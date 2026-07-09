from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.api.deps import get_db, get_current_active_user
from app.repositories.notification_repository import NotificationRepository
from app.schemas.notification import NotificationOut, UnreadCountOut

router = APIRouter()


@router.get("", response_model=List[NotificationOut])
def list_notifications(
    unread_only: bool = False,
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """List the current user's notifications, newest first."""
    repo = NotificationRepository(db)
    return repo.list_for_user(user_id=current_user.id, limit=limit, unread_only=unread_only)


@router.get("/unread-count", response_model=UnreadCountOut)
def unread_count(db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """Number of unread notifications — used to badge the bell icon."""
    repo = NotificationRepository(db)
    return {"count": repo.unread_count(user_id=current_user.id)}


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_active_user),
):
    """Mark a single notification as read."""
    repo = NotificationRepository(db)
    notification = repo.mark_read(notification_id=notification_id, user_id=current_user.id)
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    return notification


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """Mark all of the current user's notifications as read."""
    repo = NotificationRepository(db)
    updated = repo.mark_all_read(user_id=current_user.id)
    return {"updated": updated}
