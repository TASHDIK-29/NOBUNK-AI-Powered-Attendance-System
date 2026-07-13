import os
import shutil
import uuid
from typing import List
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_active_teacher, get_current_active_user, require_ai_features
from app.models.models import AttendanceSession, Course, Enrollment, SessionImage
from app.schemas.attendance import (
    ReviewCreateIn,
    ReviewEligibilityOut,
    ReviewStatusOut,
    SessionImagesOut,
)
from app.repositories.review_repository import ReviewRepository
from app.services import cloudinary_service
from pydantic import BaseModel
from datetime import datetime

from app.tasks.attendance_tasks import process_attendance_images
from app.tasks.review_tasks import process_student_review

router = APIRouter()

UPLOAD_DIR = "uploads/attendance_images"
os.makedirs(UPLOAD_DIR, exist_ok=True)

class AttendanceSessionResponse(BaseModel):
    id: int
    course_id: int
    date: datetime
    status: str
    
    class Config:
        from_attributes = True

@router.post("/upload", response_model=AttendanceSessionResponse)
async def upload_attendance_images(
    course_id: int = Form(...),
    session_date: str = Form(...),
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_teacher),
    _ai: None = Depends(require_ai_features),
):
    """
    Teacher uploads one or multiple classroom images for a chosen date.
    The system sets up a session and dispatches a Celery task.
    """
    # Verify course
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Parse the teacher-chosen attendance date (accepts "YYYY-MM-DD" or full ISO).
    try:
        parsed_date = datetime.fromisoformat(session_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Please choose a valid attendance date.")

    # Validate uploads up front so we never create an empty/partial session.
    if not files:
        raise HTTPException(status_code=400, detail="At least one classroom image is required.")
    for file in files:
        if not (file.content_type or "").startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail=f"Only image files are allowed (got '{file.filename}').",
            )

    # Create Attendance session
    session = AttendanceSession(
        course_id=course.id,
        date=parsed_date,
        created_by_teacher_id=current_user.id
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    saved_file_paths = []

    # Save the files locally for Celery to process
    session_dir = os.path.join(UPLOAD_DIR, f"session_{session.id}")
    os.makedirs(session_dir, exist_ok=True)

    for file in files:
        file_extension = (file.filename or "img.jpg").split(".")[-1]
        unique_filename = f"{uuid.uuid4().hex}.{file_extension}"
        file_path = os.path.join(session_dir, unique_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        saved_file_paths.append(file_path)
    
    # Dispatch Celery task
    process_attendance_images.delay(session_id=session.id, course_id=course_id, image_paths=saved_file_paths)
    
    return session

@router.get("/session/{session_id}/status")
def get_session_status(session_id: int, db: Session = Depends(get_db)):
    """
    Check if Celery task is 'processing', 'review_needed', 'completed', or 'failed'
    """
    session = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    return {"session_id": session.id, "status": session.status}

def _serialize_session_images(db: Session, session_id: int) -> dict:
    """Shared payload of a session's hosted photos (teacher + student review views)."""
    images = (
        db.query(SessionImage)
        .filter(SessionImage.session_id == session_id)
        .order_by(SessionImage.id.asc())
        .all()
    )

    return {
        "session_id": session_id,
        "count": len(images),
        "hosting_enabled": cloudinary_service.is_enabled(),
        "images": [
            {
                "id": image.id,
                "url": image.url,
                "thumbnail_url": cloudinary_service.thumbnail_url(image.url),
                "preview_url": cloudinary_service.preview_url(image.url),
                "width": image.width,
                "height": image.height,
                "format": image.format,
                "bytes": image.bytes,
                "created_at": image.created_at,
            }
            for image in images
        ],
    }


@router.get("/session/{session_id}/images", response_model=SessionImagesOut)
def get_session_images(
    session_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_teacher),
):
    """
    The classroom photos used for one attendance session, hosted on Cloudinary.

    Returns an empty list while the upload task is still running (it starts only
    once attendance has finished), so the client can poll or offer a refresh.
    """
    session = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    course = db.query(Course).filter(Course.id == session.course_id).first()
    if not course or course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to view this session")

    return _serialize_session_images(db, session_id)


# --- Student self-review -------------------------------------------------------

# Human-readable messages for each eligibility/rejection reason.
_REVIEW_REASON_MESSAGES = {
    "session_not_found": "Session not found.",
    "not_enrolled": "You are not enrolled in this course.",
    "already_reviewed": "You have already used your review for this session.",
    "session_not_ready": "This session is still being processed.",
    "already_present": "You are already marked present for this session.",
    "no_images": "There are no photos to review for this session yet.",
    "no_reference_image": "Add a reference photo of yourself before requesting a review.",
}


@router.get("/session/{session_id}/review/eligibility", response_model=ReviewEligibilityOut)
def get_review_eligibility(
    session_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user),
):
    """Whether the current student may request a review of this session."""
    result = ReviewRepository(db).eligibility(session_id, current_user.id)
    return {"eligible": result.eligible, "reason": result.reason, "review": result.review}


@router.get("/session/{session_id}/review/images", response_model=SessionImagesOut)
def get_review_images(
    session_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user),
):
    """
    The session's photos for a student to mark their face in. Only available to an
    enrolled student who is eligible to review (or has already submitted one), so
    present students can't browse classroom photos.
    """
    repo = ReviewRepository(db)
    result = repo.eligibility(session_id, current_user.id)
    if not (result.eligible or result.review is not None):
        raise HTTPException(
            status_code=403,
            detail=_REVIEW_REASON_MESSAGES.get(result.reason, "You cannot review this session."),
        )
    return _serialize_session_images(db, session_id)


@router.post("/session/{session_id}/review", response_model=ReviewStatusOut)
def submit_review(
    session_id: int,
    payload: ReviewCreateIn,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user),
    _ai: None = Depends(require_ai_features),
):
    """
    Submit a review: the student's marked face region in one session photo. Creates
    the (one-per-session) review, dispatches evaluation to the worker, and returns
    the pending review to poll.
    """
    repo = ReviewRepository(db)
    result = repo.eligibility(session_id, current_user.id)
    if not result.eligible:
        raise HTTPException(
            status_code=400,
            detail=_REVIEW_REASON_MESSAGES.get(result.reason, "You cannot review this session."),
        )

    # The marked image must belong to this session.
    image = (
        db.query(SessionImage)
        .filter(SessionImage.id == payload.image_id, SessionImage.session_id == session_id)
        .first()
    )
    if not image:
        raise HTTPException(status_code=400, detail="Selected photo does not belong to this session.")

    if payload.shape not in ("circle", "square"):
        raise HTTPException(status_code=400, detail="Marker shape must be 'circle' or 'square'.")

    review = repo.create_or_reset_pending(
        session_id=session_id,
        student_id=current_user.id,
        image_id=payload.image_id,
        region=payload.region.model_dump(),
        shape=payload.shape,
    )
    process_student_review.delay(review_id=review.id)
    return review


@router.get("/review/{review_id}", response_model=ReviewStatusOut)
def get_review_status(
    review_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_user),
):
    """Poll one review's status/result. Students can only read their own reviews."""
    review = ReviewRepository(db).get_review(review_id)
    if not review or review.student_id != current_user.id:
        raise HTTPException(status_code=404, detail="Review not found")
    return review


@router.put("/session/{session_id}/manual-review")
def update_attendance_manually(
    session_id: int,
    student_id: int,
    is_present: bool,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_teacher),
):
    """
    Allows the owning teacher to manually override attendance for a specific
    session if the automated system missed a student (or produced a false match).
    """
    from app.models.models import AttendanceRecord

    session = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    course = db.query(Course).filter(Course.id == session.course_id).first()
    if not course or course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to modify this session")

    record = db.query(AttendanceRecord).filter(
        AttendanceRecord.session_id == session_id,
        AttendanceRecord.student_id == student_id
    ).first()
    
    if not record:
        record = AttendanceRecord(
            session_id=session_id,
            student_id=student_id,
            is_present=is_present,
            reviewed_manually=True,
            confidence=1.0 # 100% confidence if manual
        )
        db.add(record)
    else:
        record.is_present = is_present
        record.reviewed_manually = True
        record.confidence = 1.0
        
    db.commit()
    return {"message": "Attendance record updated"}
