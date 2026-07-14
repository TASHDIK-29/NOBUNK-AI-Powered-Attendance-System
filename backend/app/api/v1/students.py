import os
import shutil
import uuid
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Form
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_db, require_ai_features
from app.core.config import get_settings
from app.models.models import User
from app.repositories.student_repository import StudentRepository
from app.services.face_service import face_service

router = APIRouter()
settings = get_settings()

UPLOAD_DIR = "uploads/reference_images"
try:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
except OSError:
    # Read-only filesystem (e.g. Vercel serverless). The endpoints that write
    # here are AI-only and disabled in that deployment, so this is safe to skip.
    pass

# Human-readable reasons why a single photo couldn't be used.
_REASON_MESSAGES = {
    "not_image": "Only image files are allowed.",
    "no_face": "No face detected.",
    "multiple_faces": "Multiple faces detected — upload a photo with only you.",
}


def _save_temp(file: UploadFile) -> str:
    extension = (file.filename or "img.jpg").split(".")[-1]
    path = os.path.join(UPLOAD_DIR, f"{uuid.uuid4().hex}.{extension}")
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return path


def _extract_one_embedding(file: UploadFile) -> Tuple[Optional[list], Optional[str]]:
    """
    Extract exactly one face embedding from an uploaded photo. Returns
    (embedding, None) on success, or (None, reason) when the photo can't be used
    (not an image, no face, or more than one face). Cleans up the temp file.
    """
    if not (file.content_type or "").startswith("image/"):
        return None, "not_image"

    path = _save_temp(file)
    try:
        faces = face_service.extract_faces_and_embeddings(path)
    finally:
        try:
            os.remove(path)
        except OSError:
            pass

    if len(faces) == 0:
        return None, "no_face"
    if len(faces) > 1:
        return None, "multiple_faces"
    return faces[0]["embedding"], None


@router.get("/reference-status")
def reference_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """How many reference photos the current student has stored, and the cap."""
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students have reference photos.")
    count = StudentRepository(db).count_embeddings(current_user.id)
    return {
        "count": count,
        "has_reference": count > 0,
        "max_images": settings.MAX_REFERENCE_IMAGES,
    }


@router.post("/reference-images")
def upload_reference_images(
    files: List[UploadFile] = File(...),
    profile_type: str = Form("default"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    _ai: None = Depends(require_ai_features),
):
    """
    Save a student's reference photos, REPLACING any they had before.

    At most MAX_REFERENCE_IMAGES photos are accepted. Each must show exactly one
    face. Only if at least one photo yields a valid embedding do we swap out the
    old set — a fully invalid upload leaves the existing photos untouched.
    """
    if current_user.role != "student":
        raise HTTPException(
            status_code=403, detail="Only students can upload reference images for themselves."
        )
    if not files:
        raise HTTPException(status_code=400, detail="At least one image is required.")
    if len(files) > settings.MAX_REFERENCE_IMAGES:
        raise HTTPException(
            status_code=400,
            detail=f"You can upload at most {settings.MAX_REFERENCE_IMAGES} photos.",
        )

    embeddings: List[list] = []
    skipped_files = []
    for file in files:
        embedding, reason = _extract_one_embedding(file)
        if embedding is None:
            skipped_files.append(
                {"filename": file.filename, "reason": _REASON_MESSAGES.get(reason, "Unusable photo.")}
            )
            continue
        embeddings.append(embedding)

    if not embeddings:
        # Nothing valid — keep whatever the student already had.
        raise HTTPException(
            status_code=400, detail="No valid faces were found in the uploaded images."
        )

    repo = StudentRepository(db)
    previous = repo.count_embeddings(current_user.id)
    if previous > 0:
        repo.delete_embeddings(current_user.id)
    saved_ids = repo.add_embeddings(current_user.id, embeddings, profile_type)

    return {
        "message": "Reference photos saved.",
        "saved_count": len(saved_ids),
        "skipped_count": len(skipped_files),
        "skipped_files": skipped_files,
        "replaced_previous": previous > 0,
    }


@router.post("/face-check")
def face_check(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
    _ai: None = Depends(require_ai_features),
):
    """
    Tell a student whether their CURRENT look still matches their stored
    reference photos, and recommend re-uploading if it has drifted too far.

    This is a 1:1 self-comparison (nearest stored embedding), so it is more
    forgiving than the strict 1:N classroom matching.
    """
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can check their reference photos.")

    repo = StudentRepository(db)
    stored_count = repo.count_embeddings(current_user.id)
    if stored_count == 0:
        raise HTTPException(
            status_code=400,
            detail="Add your reference photos first, then you can check your current look.",
        )

    embedding, reason = _extract_one_embedding(file)
    if embedding is None:
        detail = {
            "not_image": "Only image files are allowed.",
            "no_face": "No face detected — use a clear, front-facing photo of just you.",
            "multiple_faces": "More than one face detected — upload a photo with only you.",
        }.get(reason, "We couldn't read that photo.")
        raise HTTPException(status_code=400, detail=detail)

    distance = repo.min_distance(embedding, current_user.id)
    if distance is None:
        raise HTTPException(status_code=400, detail="No reference photos to compare against.")

    if distance <= settings.FACE_SELFCHECK_GOOD_DISTANCE:
        status = "good"
        recommend_update = False
        message = "Strong match — your current look is great for attendance."
    elif distance <= settings.FACE_SELFCHECK_UPDATE_DISTANCE:
        status = "ok"
        recommend_update = False
        message = (
            "You still match your reference photos well. No need to update, but you can "
            "if your look has changed recently."
        )
    else:
        status = "update_recommended"
        recommend_update = True
        message = (
            "Your current look differs noticeably from your reference photos. We recommend "
            "uploading fresh photos so you're reliably recognized in class."
        )

    # Map cosine distance (0..2) to an intuitive 0..100% similarity for display.
    similarity = max(0.0, 1 - (distance / 2.0))

    return {
        "stored_count": stored_count,
        "distance": distance,
        "similarity": similarity,
        "status": status,
        "recommend_update": recommend_update,
        "message": message,
    }
