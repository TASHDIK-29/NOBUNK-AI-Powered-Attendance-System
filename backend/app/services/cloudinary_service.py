"""
Cloudinary hosting for attendance session photos.

Everything here is called from background tasks only — never from a request
handler — so that image transfer never adds latency to the attendance response.
When Cloudinary credentials are absent the service degrades gracefully: uploads
are skipped, local files are left untouched, and callers see `None`/empty.
"""
import logging
from typing import Any, Dict, List, Optional

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_configured = False


def is_enabled() -> bool:
    return settings.cloudinary_enabled


def _ensure_configured() -> bool:
    """Configure the Cloudinary SDK once per process. False if unusable."""
    global _configured
    if _configured:
        return True
    if not settings.cloudinary_enabled:
        logger.warning(
            "Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET); "
            "session images will stay on local disk."
        )
        return False

    import cloudinary

    cloudinary.config(
        cloud_name=settings.CLOUDINARY_CLOUD_NAME,
        api_key=settings.CLOUDINARY_API_KEY,
        api_secret=settings.CLOUDINARY_API_SECRET,
        secure=True,
    )
    _configured = True
    return True


def session_folder(course_id: int, session_id: int) -> str:
    return f"{settings.CLOUDINARY_FOLDER}/course_{course_id}/session_{session_id}"


def upload_image(file_path: str, folder: str, public_id: str) -> Optional[Dict[str, Any]]:
    """
    Upload one image and return its Cloudinary metadata, or None on failure.

    `public_id` is deterministic (the local filename stem), so a retried task
    overwrites the same asset instead of creating duplicates.
    """
    if not _ensure_configured():
        return None

    import cloudinary.uploader

    result = cloudinary.uploader.upload(
        file_path,
        folder=folder,
        public_id=public_id,
        overwrite=True,
        resource_type="image",
        # Attendance photos are evidence, not thumbnails: keep the original.
        # Delivery is optimised per-request via derived URLs (see thumbnail_url).
        quality="auto:good",
    )
    return {
        "url": result.get("secure_url") or result.get("url"),
        "public_id": result.get("public_id"),
        "width": result.get("width"),
        "height": result.get("height"),
        "format": result.get("format"),
        "bytes": result.get("bytes"),
    }


def is_permanent_error(exc: BaseException) -> bool:
    """
    True for failures that retrying cannot fix: bad/insufficient credentials
    (401/403) or a request Cloudinary rejects outright (400). Everything else —
    timeouts, rate limits, 5xx — is treated as transient and worth a retry.
    """
    if not settings.cloudinary_enabled:
        return True

    from cloudinary import exceptions as cloudinary_exceptions

    return isinstance(
        exc,
        (
            cloudinary_exceptions.AuthorizationRequired,  # 401
            cloudinary_exceptions.NotAllowed,             # 403 — key lacks permissions
            cloudinary_exceptions.BadRequest,             # 400
        ),
    )


def delete_images(public_ids: List[str]) -> int:
    """Delete assets by public_id. Returns how many Cloudinary reported deleted."""
    if not public_ids or not _ensure_configured():
        return 0

    import cloudinary.api

    deleted = 0
    # The API accepts at most 100 public_ids per call.
    for i in range(0, len(public_ids), 100):
        batch = public_ids[i : i + 100]
        try:
            result = cloudinary.api.delete_resources(batch, resource_type="image")
            deleted += sum(1 for status in (result.get("deleted") or {}).values() if status == "deleted")
        except Exception as exc:  # pragma: no cover - network/credential failure
            logger.error(f"Failed to delete {len(batch)} Cloudinary asset(s): {exc}")
    return deleted


def derived_url(url: str, transformation: str) -> str:
    """
    Build a transformed delivery URL by injecting a transformation string into an
    existing Cloudinary URL (`.../image/upload/<transformation>/v123/folder/id.jpg`).
    Returns the URL unchanged if it isn't a Cloudinary upload URL.
    """
    marker = "/upload/"
    if not url or marker not in url:
        return url
    head, _, tail = url.partition(marker)
    return f"{head}{marker}{transformation}/{tail}"


def thumbnail_url(url: str) -> str:
    """A 4:3 grid thumbnail: face-aware crop, auto format and quality."""
    return derived_url(url, "c_fill,g_auto,w_640,h_480,f_auto,q_auto")


def preview_url(url: str) -> str:
    """Full-size lightbox delivery: capped dimensions, auto format and quality."""
    return derived_url(url, "c_limit,w_1600,h_1600,f_auto,q_auto")
