import os
import shutil
import uuid
from typing import List
from fastapi import APIRouter, Depends, File, UploadFile, HTTPException, Form
from sqlalchemy.orm import Session
from app.api.deps import get_current_active_user, get_db
from app.models.models import User, StudentEmbedding
from app.services.face_service import face_service

router = APIRouter()
UPLOAD_DIR = "uploads/reference_images"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/reference-image")
def upload_reference_image(
    file: UploadFile = File(...),
    profile_type: str = Form("default"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Students upload a clear front-facing photo of themselves to generate 
    an ArcFace embedding that will be stored in PostgreSQL via pgvector.
    """
    if current_user.role != "student":
         raise HTTPException(status_code=403, detail="Only students can upload reference images for themselves.")
         
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed.")
        
    file_extension = file.filename.split(".")[-1]
    unique_filename = f"{current_user.id}_{uuid.uuid4().hex}.{file_extension}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    # Save temporarily
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Extract exact ONE face embedding 
    faces_data = face_service.extract_faces_and_embeddings(file_path)
    
    if len(faces_data) == 0:
        os.remove(file_path)
        raise HTTPException(status_code=400, detail="No face detected in the image. Please upload a clear photo.")
    if len(faces_data) > 1:
        os.remove(file_path)
        raise HTTPException(status_code=400, detail="Multiple faces detected. Please upload a photo with ONLY you in it.")
        
    # Save the embedding to database
    embedding_data = faces_data[0]["embedding"]
    
    student_embedding = StudentEmbedding(
        student_id=current_user.id,
        embedding=embedding_data,
        profile_type=profile_type
    )
    db.add(student_embedding)
    db.commit()
    db.refresh(student_embedding)
    
    # Remove file since embedding is securely placed in db
    os.remove(file_path)
    
    return {"message": "Reference embedding successfully created and stored.", "embedding_id": student_embedding.id}


@router.post("/reference-images")
def upload_reference_images(
    files: List[UploadFile] = File(...),
    profile_type: str = Form("default"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Students upload multiple reference images and store one embedding per image.
    """
    if current_user.role != "student":
         raise HTTPException(status_code=403, detail="Only students can upload reference images for themselves.")

    if not files:
        raise HTTPException(status_code=400, detail="At least one image is required.")

    saved_embeddings = []
    skipped_files = []

    session_dir = os.path.join(UPLOAD_DIR, f"student_{current_user.id}_{uuid.uuid4().hex}")
    os.makedirs(session_dir, exist_ok=True)

    try:
        for file in files:
            if not file.content_type.startswith("image/"):
                skipped_files.append({"filename": file.filename, "reason": "Only image files are allowed."})
                continue

            file_extension = file.filename.split(".")[-1]
            unique_filename = f"{uuid.uuid4().hex}.{file_extension}"
            file_path = os.path.join(session_dir, unique_filename)

            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            faces_data = face_service.extract_faces_and_embeddings(file_path)

            if len(faces_data) == 0:
                skipped_files.append({"filename": file.filename, "reason": "No face detected."})
                os.remove(file_path)
                continue

            if len(faces_data) > 1:
                skipped_files.append({"filename": file.filename, "reason": "Multiple faces detected."})
                os.remove(file_path)
                continue

            student_embedding = StudentEmbedding(
                student_id=current_user.id,
                embedding=faces_data[0]["embedding"],
                profile_type=profile_type,
            )
            db.add(student_embedding)
            db.commit()
            db.refresh(student_embedding)
            saved_embeddings.append({"embedding_id": student_embedding.id, "filename": file.filename})
            os.remove(file_path)
    finally:
        try:
            os.rmdir(session_dir)
        except OSError:
            pass

    if not saved_embeddings:
        raise HTTPException(status_code=400, detail="No valid faces were found in the uploaded images.")

    return {
        "message": "Reference embeddings successfully created and stored.",
        "saved_count": len(saved_embeddings),
        "skipped_count": len(skipped_files),
        "saved_embeddings": saved_embeddings,
        "skipped_files": skipped_files,
    }
