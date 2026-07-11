from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class SessionImageOut(BaseModel):
    id: int
    # Original hosted image.
    url: str
    # Cloudinary-derived delivery URLs: a cropped grid thumbnail and a
    # size-capped preview, both auto-format/auto-quality.
    thumbnail_url: str
    preview_url: str
    width: Optional[int] = None
    height: Optional[int] = None
    format: Optional[str] = None
    bytes: Optional[int] = None
    created_at: Optional[datetime] = None


class SessionImagesOut(BaseModel):
    session_id: int
    count: int
    # False when hosting is not configured — the UI explains why there is nothing
    # to show instead of implying the photos were lost.
    hosting_enabled: bool
    images: List[SessionImageOut]


# --- Student self-review -------------------------------------------------------


class ReviewRegionIn(BaseModel):
    """Marked region as fractions (0..1) of the image's natural size."""

    x: float = Field(ge=0.0, le=1.0)
    y: float = Field(ge=0.0, le=1.0)
    w: float = Field(gt=0.0, le=1.0)
    h: float = Field(gt=0.0, le=1.0)


class ReviewCreateIn(BaseModel):
    image_id: int
    region: ReviewRegionIn
    shape: str = "circle"


class ReviewStatusOut(BaseModel):
    id: int
    session_id: int
    status: str  # pending, recognized, not_recognized, failed
    distance: Optional[float] = None
    created_at: Optional[datetime] = None
    decided_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReviewEligibilityOut(BaseModel):
    eligible: bool
    reason: str
    # Present when a review already exists (so the UI can show its outcome).
    review: Optional[ReviewStatusOut] = None
