import os
import logging
from typing import List
from sqlalchemy.orm import Session
from app.tasks.celery_app import celery_app
from app.services.face_service import face_service
from app.services.attendance_matching import assign_faces_to_students, size_adaptive_threshold
from app.repositories.attendance_repository import AttendanceRepository
from app.core.database import SessionLocal
from app.core.config import get_settings
from app.models.models import AttendanceSession, AttendanceRecord, Enrollment

settings = get_settings()

logger = logging.getLogger(__name__)

@celery_app.task
def process_attendance_images(session_id: int, course_id: int, image_paths: List[str]):
    """
    Background task to process images and mark attendance.
    """
    logger.info(f"Starting attendance processing for session {session_id}, course {course_id} with {len(image_paths)} images.")
    
    db: Session = SessionLocal()
    try:
        repo = AttendanceRepository(db)
        
        # 1. Update session status
        session = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
        if not session:
            logger.error(f"Session {session_id} not found.")
            return
            
        session.status = "processing"
        db.commit()

        # Best (smallest) match distance seen for each student across all images.
        # A student present in any image is marked present; we keep their best
        # distance for the stored confidence.
        best_distance_by_student = {}

        # 2. Process each image independently
        for img_path in image_paths:
            if not os.path.exists(img_path):
                logger.warning(f"Image not found: {img_path}")
                continue

            logger.info(f"Extracting faces from {img_path}")
            faces_data = face_service.extract_faces_and_embeddings(img_path)
            if not faces_data:
                continue

            # 3. Distance from each detected face to every enrolled student, plus
            #    a size-adaptive threshold per face (distant/small faces are given
            #    more leeway since their embeddings are degraded).
            face_distances = []
            thresholds = []
            for face in faces_data:
                face_distances.append(
                    repo.get_enrolled_student_distances(face["embedding"], course_id)
                )
                area = face.get("facial_area") or {}
                w, h = area.get("w"), area.get("h")
                face_size = min(w, h) if (w and h) else None
                thresholds.append(
                    size_adaptive_threshold(
                        face_size,
                        strict=settings.FACE_MATCH_THRESHOLD,
                        relaxed=settings.FACE_MATCH_THRESHOLD_FAR,
                        small_px=settings.FACE_SMALL_PX,
                        large_px=settings.FACE_LARGE_PX,
                    )
                )

            # 4. One-to-one assignment for THIS image: per-face threshold + runner-up
            #    margin + Hungarian assignment. Ambiguous/contested faces are
            #    dropped, so nobody is marked present on a weak match.
            assigned = assign_faces_to_students(
                face_distances,
                thresholds=thresholds,
                margin=settings.FACE_MATCH_MARGIN,
            )
            for student_id, distance in assigned.items():
                prev = best_distance_by_student.get(student_id)
                if prev is None or distance < prev:
                    best_distance_by_student[student_id] = distance

            # Optionally clean up the file
            # os.remove(img_path)

        # 5. Mark confidently-matched students present.
        marked_students = set()
        for student_id, distance in best_distance_by_student.items():
            was_marked = repo.mark_attendance(
                session_id=session_id,
                student_id=student_id,
                distance=distance,
                is_present=True,
            )
            marked_students.add(student_id)
            if was_marked:
                logger.info(f"Marked student {student_id} present with distance {distance:.3f}")

        # 6. Mark absences for everyone not confidently matched (includes
        #    ambiguous/mid-confidence faces, which are intentionally left absent).
        all_enrolled = db.query(Enrollment.student_id).filter(Enrollment.course_id == course_id).all()
        for (st_id,) in all_enrolled:
            if st_id not in marked_students:
                repo.mark_attendance(
                    session_id=session_id,
                    student_id=st_id,
                    distance=2.0, # Complete mismatch representation
                    is_present=False
                )

        # 7. Finish session processing
        session.status = "review_needed" # System completed, teacher can manually review
        db.commit()

        # 8. Create attendance notifications inline (present/absent for each
        #    student + auto low-attendance alerts). Done here, in the same task
        #    that already ran, so delivery never depends on a second Celery task
        #    being dispatched and picked up. Errors are contained internally.
        from app.services.notification_service import create_attendance_notifications
        create_attendance_notifications(db, session_id)

    except Exception as e:
        logger.error(f"Error processing attendance session {session_id}: {str(e)}")
        # Optionally set status to failed
        session = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
        if session:
            session.status = "failed"
            db.commit()
    finally:
        db.close()
