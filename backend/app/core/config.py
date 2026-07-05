from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Attendance System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    
    # Security
    SECRET_KEY: str = "REPLACE_THIS_WITH_A_SUPER_SECRET_KEY_IN_PRODUCTION"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    ALGORITHM: str = "HS256"
    
    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost:5435/attendancedb"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # DeepFace
    FACE_DETECTOR: str = "retinaface"
    # Secondary detector tried when the primary finds no usable faces in an image.
    FACE_FALLBACK_DETECTOR: str = "mtcnn"
    FACE_MODEL: str = "ArcFace"
    # Drop detections below this confidence (also filters DeepFace's whole-image
    # fallback "face" that is returned with confidence 0 when nothing is detected).
    FACE_DETECTION_CONFIDENCE: float = 0.5
    # Cosine-distance threshold for an embedding match (lower = stricter).
    # 0.68 is DeepFace's default for ArcFace; raise slightly to favour recall.
    FACE_MATCH_THRESHOLD: float = 0.68
    # Adaptive resizing before detection. Small/low-res classroom photos are
    # upscaled so far/back-row faces become large enough to detect; oversized
    # uploads are capped to keep detection fast and memory-safe.
    FACE_TARGET_IMAGE_SIDE: int = 2200  # upscale until the longer side reaches this
    FACE_MAX_IMAGE_SIDE: int = 3000     # never let the longer side exceed this
    FACE_MAX_UPSCALE: float = 2.0       # cap how much a tiny image may be enlarged
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
