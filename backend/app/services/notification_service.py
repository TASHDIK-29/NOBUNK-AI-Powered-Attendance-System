import logging
from app.tasks.celery_app import celery_app
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.models import AttendanceRecord, User

logger = logging.getLogger(__name__)

@celery_app.task
def send_attendance_notifications(session_id: int):
    """
    Mock function to send emails/push notifications to students about their attendance.
    """
    db: Session = SessionLocal()
    try:
        records = db.query(AttendanceRecord).filter(AttendanceRecord.session_id == session_id).all()
        for record in records:
            student = db.query(User).filter(User.id == record.student_id).first()
            if student:
                status = "Present" if record.is_present else "Absent"
                logger.info(f"Sending Notification -> Student: {student.email}, Session ID: {session_id}, Status: {status}")
                # TODO: Implement actual email sending via SMTP or third-party API
    finally:
        db.close()
