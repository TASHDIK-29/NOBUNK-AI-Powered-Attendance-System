import os
import logging
from typing import List
from sqlalchemy.orm import Session
from app.tasks.celery_app import celery_app
from app.services.face_service import face_service
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

        # Keep track of who has been marked so far this run
        marked_students = set()

        # 2. Process each image
        for img_path in image_paths:
            if not os.path.exists(img_path):
                logger.warning(f"Image not found: {img_path}")
                continue
                
            logger.info(f"Extracting faces from {img_path}")
            faces_data = face_service.extract_faces_and_embeddings(img_path)
            
            # 3. Compare each face with stored embeddings
            for face in faces_data:
                embedding = face["embedding"]
                
                # Cosine-distance threshold is configurable (see FACE_MATCH_THRESHOLD).
                student_id, distance = repo.find_matching_students_in_course(
                    target_embedding=embedding,
                    course_id=course_id,
                    threshold=settings.FACE_MATCH_THRESHOLD
                )
                
                if student_id and student_id not in marked_students:
                    was_marked = repo.mark_attendance(
                        session_id=session_id, 
                        student_id=student_id, 
                        distance=distance,
                        is_present=True
                    )
                    if was_marked:
                        marked_students.add(student_id)
                        logger.info(f"Marked student {student_id} present with distance {distance:.3f}")
            
            # Optionally clean up the file
            # os.remove(img_path)

        # 4. Mark absences for students not matched
        all_enrolled = db.query(Enrollment.student_id).filter(Enrollment.course_id == course_id).all()
        for (st_id,) in all_enrolled:
            if st_id not in marked_students:
                repo.mark_attendance(
                    session_id=session_id,
                    student_id=st_id,
                    distance=2.0, # Complete mismatch representation
                    is_present=False
                )

        # 5. Finish session processing
        session.status = "review_needed" # System completed, teacher can manually review
        db.commit()
        
        # 6. Send notification email (Mock setup for now)
        from app.services.notification_service import send_attendance_notifications
        send_attendance_notifications.delay(session_id)

    except Exception as e:
        logger.error(f"Error processing attendance session {session_id}: {str(e)}")
        # Optionally set status to failed
        session = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
        if session:
            session.status = "failed"
            db.commit()
    finally:
        db.close()
