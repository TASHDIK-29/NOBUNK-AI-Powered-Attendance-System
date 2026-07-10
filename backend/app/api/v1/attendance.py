import os
import shutil
import uuid
from typing import List
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_active_teacher
from app.models.models import AttendanceSession, Course, SessionImage
from app.schemas.attendance import SessionImagesOut
from app.services import cloudinary_service
from pydantic import BaseModel
from datetime import datetime

from app.tasks.attendance_tasks import process_attendance_images

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
    current_user = Depends(get_current_active_teacher)
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
