from sqlalchemy.orm import Session
from sqlalchemy import select, update, func
from typing import List, Optional
from app.models.models import Notification


class NotificationRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        user_id: int,
        type: str,
        title: str,
        message: str,
        link: Optional[str] = None,
        course_id: Optional[int] = None,
        commit: bool = True,
    ) -> Notification:
        notification = Notification(
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            link=link,
            course_id=course_id,
        )
        self.db.add(notification)
        if commit:
            self.db.commit()
            self.db.refresh(notification)
        return notification

    def list_for_user(
        self, user_id: int, limit: int = 30, unread_only: bool = False
    ) -> List[Notification]:
        stmt = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            stmt = stmt.where(Notification.is_read.is_(False))
        stmt = stmt.order_by(Notification.created_at.desc()).limit(limit)
        return list(self.db.execute(stmt).scalars().all())

    def unread_count(self, user_id: int) -> int:
        stmt = (
            select(func.count(Notification.id))
            .where(Notification.user_id == user_id, Notification.is_read.is_(False))
        )
        return self.db.execute(stmt).scalar() or 0

    def mark_read(self, notification_id: int, user_id: int) -> Optional[Notification]:
        notification = (
            self.db.query(Notification)
            .filter(Notification.id == notification_id, Notification.user_id == user_id)
            .first()
        )
        if not notification:
            return None
        notification.is_read = True
        self.db.commit()
        return notification

    def mark_all_read(self, user_id: int) -> int:
        updated = (
            self.db.query(Notification)
            .filter(Notification.user_id == user_id, Notification.is_read.is_(False))
            .update({Notification.is_read: True}, synchronize_session=False)
        )
        self.db.commit()
        return updated
