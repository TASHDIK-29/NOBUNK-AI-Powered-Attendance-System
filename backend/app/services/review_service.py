"""
Evaluation for the student self-review flow.

A student who was marked absent marks their own face in one of the session's
photos. We crop that region, extract its embedding, and verify it against the
requesting student's OWN reference embeddings.

Why this differs from classroom matching (see attendance_matching.py):
  * Classroom marking is 1:N — every detected face is contested by every enrolled
    student, so it must be strict to avoid handing a face to the wrong person.
  * A review is effectively 1:1 — the student has fixed the target by marking it,
    so there is a single identity to confirm. False-positive risk is far lower,
    which lets us use a more lenient distance threshold (FACE_REVIEW_THRESHOLD).

The only remaining false-positive risk is a student marking a look-alike
classmate to cheat, which is caught by a light impostor guard: the marked face
must be closer to the requesting student than to any other enrolled student by a
small margin.
"""
import logging
from dataclasses import dataclass
from typing import Dict, Optional

import cv2
import numpy as np
import requests

from app.core.config import get_settings
from app.services.face_service import face_service

logger = logging.getLogger(__name__)
settings = get_settings()

# Guard against a pathological upload/transform returning an enormous file.
_MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
_DOWNLOAD_TIMEOUT = 20


@dataclass
class ReviewOutcome:
    recognized: bool
    # Best cosine distance to the requesting student's own embeddings, if a face
    # was found in the marked region (None when no face could be extracted).
    distance: Optional[float]
    # Machine-readable reason, useful for logging and messaging.
    reason: str


def _fetch_image(url: str) -> Optional[np.ndarray]:
    """Download an image by URL and decode it to a BGR frame. None on failure."""
    try:
        resp = requests.get(url, timeout=_DOWNLOAD_TIMEOUT, stream=True)
        resp.raise_for_status()
        content = resp.content
    except Exception as exc:  # noqa: BLE001 - network failures are expected/transient
        logger.warning(f"Could not download review image {url}: {exc}")
        return None

    if not content or len(content) > _MAX_DOWNLOAD_BYTES:
        logger.warning(f"Review image {url} was empty or too large ({len(content)} bytes).")
        return None

    frame = cv2.imdecode(np.frombuffer(content, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        logger.warning(f"Review image {url} could not be decoded.")
        return None
    return frame


def _crop_region(frame: np.ndarray, region: Dict[str, float], padding: float) -> Optional[np.ndarray]:
    """
    Crop the marked region (given as fractions 0..1 of the frame) with padding on
    each side so the detector has enough context to align the face. Returns None
    if the region is degenerate or lands outside the image.
    """
    h, w = frame.shape[:2]
    if h == 0 or w == 0:
        return None

    # Clamp the normalized box, then expand by `padding` on every side.
    rx = max(0.0, min(1.0, region["x"]))
    ry = max(0.0, min(1.0, region["y"]))
    rw = max(0.0, min(1.0 - rx, region["w"]))
    rh = max(0.0, min(1.0 - ry, region["h"]))
    if rw <= 0 or rh <= 0:
        return None

    pad_x = rw * padding
    pad_y = rh * padding
    x0 = int(round(max(0.0, rx - pad_x) * w))
    y0 = int(round(max(0.0, ry - pad_y) * h))
    x1 = int(round(min(1.0, rx + rw + pad_x) * w))
    y1 = int(round(min(1.0, ry + rh + pad_y) * h))

    if x1 <= x0 or y1 <= y0:
        return None
    return frame[y0:y1, x0:x1]


def _best_face_embedding(crop: np.ndarray) -> Optional[list]:
    """
    Detect faces in the marked crop and return the embedding of the largest one
    (the student's face should dominate a tight crop). None if none found.
    """
    faces = face_service.get_embedding_from_frame(crop)
    if not faces:
        return None

    def area(face) -> float:
        box = face.get("facial_area") or {}
        return float((box.get("w") or 0) * (box.get("h") or 0))

    best = max(faces, key=area)
    return best.get("embedding")


def evaluate_review(
    image_url: str,
    region: Dict[str, float],
    enrolled_distances_fn,
    student_id: int,
) -> ReviewOutcome:
    """
    Run the full evaluation for one review request.

    Args:
        image_url: original (full-resolution) URL of the marked session photo.
        region: {"x","y","w","h"} as fractions of the image's natural size.
        enrolled_distances_fn: callable(embedding) -> {student_id: distance} for
            every enrolled student with an embedding (see
            AttendanceRepository.get_enrolled_student_distances).
        student_id: the requesting student.

    Returns a ReviewOutcome. A returned outcome (recognized True/False) is a real
    verdict; a system failure is signalled by raising, so the caller can allow a
    retry rather than consuming the student's one chance.
    """
    frame = _fetch_image(image_url)
    if frame is None:
        raise RuntimeError("Could not load the marked image for review.")

    crop = _crop_region(frame, region, settings.FACE_REVIEW_CROP_PADDING)
    if crop is None:
        return ReviewOutcome(False, None, "invalid_region")

    embedding = _best_face_embedding(crop)
    if embedding is None:
        return ReviewOutcome(False, None, "no_face_in_marked_area")

    distances = enrolled_distances_fn(embedding)
    own = distances.get(student_id)
    if own is None:
        # The student has no reference embedding to verify against.
        return ReviewOutcome(False, None, "no_reference_embedding")

    others = [d for sid, d in distances.items() if sid != student_id]
    nearest_other = min(others) if others else None

    within_threshold = own < settings.FACE_REVIEW_THRESHOLD
    passes_impostor_guard = (
        nearest_other is None
        or (nearest_other - own) >= settings.FACE_REVIEW_IMPOSTOR_MARGIN
    )

    if within_threshold and passes_impostor_guard:
        return ReviewOutcome(True, float(own), "recognized")

    if not within_threshold:
        reason = "distance_above_threshold"
    else:
        reason = "ambiguous_impostor_guard"
    logger.info(
        "Review not recognized for student %s (own=%.3f, nearest_other=%s, reason=%s)",
        student_id, own, f"{nearest_other:.3f}" if nearest_other is not None else "n/a", reason,
    )
    return ReviewOutcome(False, float(own), reason)
