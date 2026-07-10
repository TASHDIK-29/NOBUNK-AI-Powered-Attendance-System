"""
Cloudinary workflow — runs strictly after the attendance workflow.

`process_attendance_images` dispatches `upload_session_images` as its last step,
so the teacher's attendance result is already computed and returned before a
single byte is sent to Cloudinary. Nothing in here can slow attendance down.
"""
import logging
import os
from typing import List

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.models.models import AttendanceSession, SessionImage
from app.services import cloudinary_service
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)
settings = get_settings()


def _cleanup_local(image_paths: List[str]) -> None:
    """Delete the local originals (and their now-empty session directory)."""
    parents = set()
    for path in image_paths:
        try:
            if os.path.exists(path):
                os.remove(path)
                parents.add(os.path.dirname(path))
        except OSError as exc:
            logger.warning(f"Could not remove local image {path}: {exc}")

    for parent in parents:
        try:
            if os.path.isdir(parent) and not os.listdir(parent):
                os.rmdir(parent)
        except OSError:
            pass


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def upload_session_images(self, session_id: int, image_paths: List[str]):
    """
    Upload a session's classroom photos to Cloudinary and store their URLs.

    Idempotent: images already recorded for the session are skipped, so a retry
    after a partial failure only uploads what is missing.
    """
    if not cloudinary_service.is_enabled():
        logger.warning(
            f"Skipping Cloudinary upload for session {session_id}: service not configured."
        )
        return

    db: Session = SessionLocal()
    try:
        session = db.query(AttendanceSession).filter(AttendanceSession.id == session_id).first()
        if not session:
            logger.error(f"Session {session_id} not found; nothing to upload.")
            return

        folder = cloudinary_service.session_folder(session.course_id, session_id)
        already_uploaded = {
            public_id.rsplit("/", 1)[-1]
            for (public_id,) in db.query(SessionImage.public_id)
            .filter(SessionImage.session_id == session_id)
            .all()
        }

        uploaded_paths = []
        failed = 0
        permanently_failed = False
        for path in image_paths:
            if not os.path.exists(path):
                logger.warning(f"Local image missing, skipping upload: {path}")
                continue

            # The local filename is already a uuid hex — reuse it as the asset's
            # public_id so retries overwrite rather than duplicate.
            stem = os.path.splitext(os.path.basename(path))[0]
            if stem in already_uploaded:
                uploaded_paths.append(path)
                continue

            try:
                result = cloudinary_service.upload_image(path, folder=folder, public_id=stem)
            except Exception as exc:
                failed += 1
                permanently_failed = permanently_failed or cloudinary_service.is_permanent_error(exc)
                logger.error(f"Cloudinary upload failed for {path}: {exc}")
                continue

            if not result or not result.get("url"):
                failed += 1
                continue

            db.add(
                SessionImage(
                    session_id=session_id,
                    url=result["url"],
                    public_id=result["public_id"],
                    width=result.get("width"),
                    height=result.get("height"),
                    format=result.get("format"),
                    bytes=result.get("bytes"),
                )
            )
            db.commit()
            uploaded_paths.append(path)
            logger.info(f"Uploaded {path} to Cloudinary as {result['public_id']}")

        if failed:
            # Local files are always kept on failure, so nothing is lost and a
            # later retry (or a re-run once credentials are fixed) can finish.
            if permanently_failed:
                logger.error(
                    f"Cloudinary rejected {failed} image(s) for session {session_id} and retrying "
                    f"cannot help — check that the API key has upload (create) permission. "
                    f"The images are kept on local disk."
                )
                return

            # Celery re-raises the exception we hand it once retries run out, so
            # check the budget ourselves rather than catching MaxRetriesExceeded.
            if self.request.retries >= self.max_retries:
                logger.error(
                    f"Giving up on Cloudinary upload for session {session_id} after "
                    f"{self.max_retries} retries; {failed} image(s) still unsent."
                )
                return

            raise self.retry(
                exc=RuntimeError(f"{failed} image(s) failed to upload for session {session_id}")
            )

        if settings.CLOUDINARY_DELETE_LOCAL_AFTER_UPLOAD:
            _cleanup_local(uploaded_paths)

    finally:
        db.close()


@celery_app.task
def delete_cloudinary_assets(public_ids: List[str]):
    """Remove hosted images whose sessions were deleted (course reset/deletion)."""
    if not public_ids:
        return
    deleted = cloudinary_service.delete_images(public_ids)
    logger.info(f"Deleted {deleted}/{len(public_ids)} Cloudinary asset(s).")
