from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


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
