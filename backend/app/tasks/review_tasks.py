"""
Background evaluation of a student self-review request.

Kept off the API process (like the classroom attendance pipeline) so the heavy
DeepFace models stay loaded in the Celery worker. The API creates the pending
review row and dispatches this task; the frontend polls the review's status.
"""
import logging

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.models import AttendanceSession, Course, SessionImage, User
from app.repositories.attendance_repository import AttendanceRepository
from app.repositories.notification_repository import NotificationRepository
from app.repositories.review_repository import ReviewRepository
from app.services.review_service import evaluate_review
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task
def process_student_review(review_id: int):
    """
    Evaluate one review: crop the student's marked face, verify it against their
    own embeddings, and — if recognized — flip their attendance record to present.

    Terminal states:
      * recognized      — matched; record updated, student + teacher notified.
      * not_recognized   — genuine miss; the student's single attempt is spent.
      * failed           — system error (bad image, network); the student may retry.
    """
    db: Session = SessionLocal()
    try:
        review_repo = ReviewRepository(db)
        review = review_repo.get_review(review_id)
        if not review:
            logger.error(f"Review {review_id} not found.")
            return
        if review.status != "pending":
            logger.info(f"Review {review_id} already resolved ({review.status}); skipping.")
            return

        session = (
            db.query(AttendanceSession)
            .filter(AttendanceSession.id == review.session_id)
            .first()
        )
        image = (
            db.query(SessionImage).filter(SessionImage.id == review.image_id).first()
            if review.image_id
            else None
        )
        if not session or not image:
            logger.error(f"Review {review_id}: session or image missing.")
            review_repo.set_result(review, "failed", None)
            return

        course_id = session.course_id
        student_id = review.student_id
        attendance_repo = AttendanceRepository(db)

        region = {
            "x": review.region_x,
            "y": review.region_y,
            "w": review.region_w,
            "h": review.region_h,
        }

        try:
            outcome = evaluate_review(
                image_url=image.url,
                region=region,
                enrolled_distances_fn=lambda emb: attendance_repo.get_enrolled_student_distances(
                    emb, course_id
                ),
                student_id=student_id,
            )
        except Exception as exc:  # noqa: BLE001 - transient/system failure → allow retry
            logger.error(f"Review {review_id} evaluation errored: {exc}")
            review_repo.set_result(review, "failed", None)
            return

        if outcome.recognized:
            attendance_repo.mark_present_via_review(
                session_id=review.session_id,
                student_id=student_id,
                distance=outcome.distance if outcome.distance is not None else 0.0,
            )
            review_repo.set_result(review, "recognized", outcome.distance)
            _notify(db, session, course_id, student_id, recognized=True)
            logger.info(f"Review {review_id}: recognized student {student_id} (dist={outcome.distance}).")
        else:
            review_repo.set_result(review, "not_recognized", outcome.distance)
            _notify(db, session, course_id, student_id, recognized=False)
            logger.info(f"Review {review_id}: student {student_id} not recognized ({outcome.reason}).")

    except Exception as e:  # noqa: BLE001
        logger.error(f"Unexpected error processing review {review_id}: {e}")
        try:
            review = ReviewRepository(db).get_review(review_id)
            if review and review.status == "pending":
                ReviewRepository(db).set_result(review, "failed", None)
        except Exception:  # pragma: no cover
            pass
    finally:
        db.close()


def _notify(db: Session, session, course_id: int, student_id: int, recognized: bool) -> None:
    """Notify the student of the review result, and the teacher on success (audit)."""
    try:
        course = db.query(Course).filter(Course.id == course_id).first()
        course_title = course.title if course else "the course"
        notifications = NotificationRepository(db)

        if recognized:
            notifications.create(
                user_id=student_id,
                type="review_recognized",
                title="Attendance updated",
                message=f"Your review was approved — you're now marked present in {course_title}.",
                link=f"/student/courses/{course_id}",
                course_id=course_id,
            )
            if course and course.teacher_id:
                student = db.query(User).filter(User.id == student_id).first()
                student_name = (student.full_name if student else None) or f"Student {student_id}"
                notifications.create(
                    user_id=course.teacher_id,
                    type="review_recognized",
                    title="Attendance self-corrected",
                    message=(
                        f"{student_name} was marked present in {course_title} via an "
                        f"automated face review."
                    ),
                    link=f"/teacher/courses/{course_id}",
                    course_id=course_id,
                )
        else:
            notifications.create(
                user_id=student_id,
                type="review_not_recognized",
                title="Review not approved",
                message=(
                    f"We couldn't confirm your face in the {course_title} session photo, "
                    f"so your attendance was not changed."
                ),
                link=f"/student/courses/{course_id}",
                course_id=course_id,
            )
    except Exception as exc:  # noqa: BLE001 - notifications must never fail the review
        logger.error(f"Failed to send review notifications for student {student_id}: {exc}")
