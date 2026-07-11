from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "NoBunk"
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

    # Cloudinary — permanent hosting for the classroom photos of each session.
    # Uploads run in a background task AFTER attendance has been computed, so a
    # slow network round-trip never delays the teacher's result.
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    CLOUDINARY_FOLDER: str = "attendance_system"
    # Remove the local copy once the image is safely stored on Cloudinary.
    CLOUDINARY_DELETE_LOCAL_AFTER_UPLOAD: bool = True

    @property
    def cloudinary_enabled(self) -> bool:
        """Uploads are skipped (and local files kept) unless fully configured."""
        return bool(
            self.CLOUDINARY_CLOUD_NAME
            and self.CLOUDINARY_API_KEY
            and self.CLOUDINARY_API_SECRET
        )

    # DeepFace
    FACE_DETECTOR: str = "retinaface"
    # Secondary detector tried when the primary finds no usable faces in an image.
    FACE_FALLBACK_DETECTOR: str = "mtcnn"
    FACE_MODEL: str = "ArcFace"
    # Drop detections below this confidence (also filters DeepFace's whole-image
    # fallback "face" that is returned with confidence 0 when nothing is detected).
    FACE_DETECTION_CONFIDENCE: float = 0.5
    # Cosine-distance threshold for an embedding match (lower = stricter).
    # 0.68 is DeepFace's *verification* (1:1) default and is far too loose for
    # 1:N classroom identification — it lets different students match.
    #
    # The allowed distance is SIZE-ADAPTIVE: close/large faces carry high detail
    # and get the strict threshold, while distant/small faces produce degraded
    # embeddings (larger distance to the true student even when clearly visible),
    # so they get a more lenient threshold. Precision for far faces is preserved
    # by the runner-up margin + one-to-one assignment, not by the raw threshold.
    # A face's size is interpolated between FACE_SMALL/LARGE_PX (see below).
    FACE_MATCH_THRESHOLD: float = 0.45       # strict, for large/close faces
    FACE_MATCH_THRESHOLD_FAR: float = 0.68   # lenient, for small/distant faces
    # Face min-side (px, in the processed image) at/above which the strict
    # threshold applies, and at/below which the lenient one applies. In between,
    # the threshold is linearly interpolated.
    FACE_LARGE_PX: int = 110
    FACE_SMALL_PX: int = 45
    # Minimum gap between the best and second-best candidate for a detected face.
    # If a face is nearly as close to another student as to its best match, the
    # match is ambiguous and we leave the student unmarked (counts as absent)
    # rather than guess. Raise to be stricter, lower to accept tighter clusters.
    # This is the main precision guard once far-face thresholds are relaxed.
    FACE_MATCH_MARGIN: float = 0.08

    # --- Student reference photos & self-check --------------------------------
    # Max reference photos a student may store. A new upload REPLACES the whole
    # set rather than adding to it, so this caps the stored embeddings too.
    MAX_REFERENCE_IMAGES: int = 3
    # Self-check ("is my current look OK for attendance?"): the student uploads a
    # current photo and we compare it 1:1 against their stored reference
    # embeddings (nearest match). <= GOOD: strong match. <= UPDATE: still fine.
    # > UPDATE: appearance has drifted enough that refreshing photos is advised.
    FACE_SELFCHECK_GOOD_DISTANCE: float = 0.40
    FACE_SELFCHECK_UPDATE_DISTANCE: float = 0.58

    # --- Student self-review evaluation ---------------------------------------
    # When a student is marked absent they may request ONE automated review: they
    # mark their own face in a session photo and the system re-checks that crop.
    # Unlike classroom marking (1:N, must guard against matching the wrong
    # student), this is a 1:1 verification against the requesting student's own
    # embeddings — the target is fixed, so false-positive risk is far lower and
    # the threshold is deliberately more lenient than FACE_MATCH_THRESHOLD.
    FACE_REVIEW_THRESHOLD: float = 0.62
    # Anti-cheat guard: the marked face must be closer to the requesting student
    # than to any OTHER enrolled student by at least this margin, so a student
    # cannot pass by marking a look-alike classmate. Lenient by design.
    FACE_REVIEW_IMPOSTOR_MARGIN: float = 0.04
    # The marked box is padded by this fraction on each side before cropping, so
    # the detector has enough context to detect and align the face reliably even
    # if the student drew a tight marker.
    FACE_REVIEW_CROP_PADDING: float = 0.25

    # Attendance percentage below which students (and their teacher) get an
    # automatic low-attendance alert after a session is processed.
    LOW_ATTENDANCE_THRESHOLD: float = 60.0
    # The alert is only meaningful once enough sessions exist: it fires only when
    # a course has MORE than this many sessions, so early low percentages (e.g.
    # absent for the first of 2 classes) don't trigger premature warnings.
    LOW_ATTENDANCE_MIN_SESSIONS: int = 8
    # Adaptive resizing before detection. Small/low-res classroom photos are
    # upscaled so far/back-row faces become large enough to detect; oversized
    # uploads are capped to keep detection fast and memory-safe.
    #
    # MAX_IMAGE_SIDE is deliberately high: a distant whole-class photo from a
    # modern phone (~4000px) must NOT be downscaled, or its already-small faces
    # shrink further and become unrecognisable. Detection is slower on big
    # images but this runs in a background task.
    FACE_TARGET_IMAGE_SIDE: int = 2200  # upscale until the longer side reaches this
    FACE_MAX_IMAGE_SIDE: int = 4000     # never let the longer side exceed this
    FACE_MAX_UPSCALE: float = 2.0       # cap how much a tiny image may be enlarged
    
    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
