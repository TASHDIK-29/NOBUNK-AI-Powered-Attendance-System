import logging
from app.tasks.celery_app import celery_app
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import SessionLocal
from app.core.config import get_settings
from app.models.models import (
    AttendanceRecord,
    AttendanceSession,
    Course,
    User,
)
from app.repositories.notification_repository import NotificationRepository

logger = logging.getLogger(__name__)
settings = get_settings()


def create_attendance_notifications(db: Session, session_id: int) -> int:
    """
    After a session is processed, notify each enrolled student whether they were
    marked present or absent, and raise an automatic low-attendance alert (to the
    student and the teacher) for anyone whose course attendance dips below the
    configured threshold.

    Uses the caller-provided session and never closes it. Errors are contained
    (logged + rolled back) so notification problems can't fail the surrounding
    attendance processing. Returns the number of notifications created.
    """
    try:
        session = (
            db.query(AttendanceSession)
            .filter(AttendanceSession.id == session_id)
            .first()
        )
        if not session:
            logger.error(f"Session {session_id} not found for notifications.")
            return 0

        course = db.query(Course).filter(Course.id == session.course_id).first()
        if not course:
            logger.error(f"Course {session.course_id} not found for notifications.")
            return 0

        course_id = course.id
        course_title = course.title
        notifications = NotificationRepository(db)
        created = 0

        # Total sessions in this course, used for percentage calculations.
        total_sessions = (
            db.query(func.count(AttendanceSession.id))
            .filter(AttendanceSession.course_id == course_id)
            .scalar()
            or 0
        )

        records = (
            db.query(AttendanceRecord)
            .filter(AttendanceRecord.session_id == session_id)
            .all()
        )

        for record in records:
            student = db.query(User).filter(User.id == record.student_id).first()
            if not student:
                continue

            # 1. Present/absent notification for this session.
            if record.is_present:
                notifications.create(
                    user_id=student.id,
                    type="attendance_marked",
                    title="Marked present",
                    message=f"You were marked present in {course_title}.",
                    link=f"/student/courses/{course_id}",
                    course_id=course_id,
                    commit=False,
                )
            else:
                notifications.create(
                    user_id=student.id,
                    type="attendance_marked",
                    title="Marked absent",
                    message=f"You were marked absent in {course_title}.",
                    link=f"/student/courses/{course_id}",
                    course_id=course_id,
                    commit=False,
                )
            created += 1

            # 2. Auto low-attendance alert if the student's overall course
            #    attendance has fallen below the threshold.
            if total_sessions > 0:
                present_count = (
                    db.query(func.count(AttendanceRecord.id))
                    .join(
                        AttendanceSession,
                        AttendanceSession.id == AttendanceRecord.session_id,
                    )
                    .filter(
                        AttendanceSession.course_id == course_id,
                        AttendanceRecord.student_id == student.id,
                        AttendanceRecord.is_present.is_(True),
                    )
                    .scalar()
                    or 0
                )
                percentage = round(present_count / total_sessions * 100.0, 2)

                if percentage < settings.LOW_ATTENDANCE_THRESHOLD:
                    # Alert the student.
                    notifications.create(
                        user_id=student.id,
                        type="low_attendance",
                        title="Low attendance alert",
                        message=(
                            f"Your attendance in {course_title} is {percentage:.0f}%, "
                            f"below the {settings.LOW_ATTENDANCE_THRESHOLD:.0f}% requirement."
                        ),
                        link=f"/student/courses/{course_id}",
                        course_id=course_id,
                        commit=False,
                    )
                    created += 1
                    # Alert the teacher.
                    if course.teacher_id:
                        student_name = student.full_name or f"Student {student.id}"
                        notifications.create(
                            user_id=course.teacher_id,
                            type="low_attendance",
                            title="Student below attendance threshold",
                            message=(
                                f"{student_name}'s attendance in {course_title} is "
                                f"{percentage:.0f}% (below {settings.LOW_ATTENDANCE_THRESHOLD:.0f}%)."
                            ),
                            link=f"/teacher/courses/{course_id}",
                            course_id=course_id,
                            commit=False,
                        )
                        created += 1

        db.commit()
        logger.info(
            f"Created {created} attendance notification(s) for session {session_id}."
        )
        return created
    except Exception as e:  # noqa: BLE001
        logger.error(f"Error creating notifications for session {session_id}: {e}")
        db.rollback()
        return 0


@celery_app.task
def send_attendance_notifications(session_id: int):
    """
    Celery wrapper around create_attendance_notifications that owns its own DB
    session. Kept for any asynchronous callers; the attendance pipeline calls
    create_attendance_notifications directly so delivery never depends on a
    second task being dispatched and picked up.
    """
    db: Session = SessionLocal()
    try:
        create_attendance_notifications(db, session_id)
    finally:
        db.close()
