from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, index=True)
    role = Column(String, default="student") # "student", "teacher", "admin"
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Student specific fields
    student_id = Column(String, unique=True, index=True, nullable=True)
    department = Column(String, nullable=True)
    session_year = Column(String, nullable=True)

    # Relationships
    teach_courses = relationship("Course", back_populates="teacher", foreign_keys="Course.teacher_id")
    enrollments = relationship("Enrollment", back_populates="student")
    embeddings = relationship("StudentEmbedding", back_populates="student", cascade="all, delete-orphan")

class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    code = Column(String, index=True, nullable=False)
    department = Column(String, nullable=True)
    session_target = Column(String, nullable=True)
    join_token = Column(String, unique=True, index=True)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)
    teacher_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    teacher = relationship("User", back_populates="teach_courses", foreign_keys=[teacher_id])
    enrollments = relationship("Enrollment", back_populates="course")
    attendance_sessions = relationship("AttendanceSession", back_populates="course")

class Enrollment(Base):
    __tablename__ = "enrollments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))
    enrolled_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("User", back_populates="enrollments")
    course = relationship("Course", back_populates="enrollments")

class StudentEmbedding(Base):
    __tablename__ = "student_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    
    # 512 dimensions for ArcFace.
    embedding = Column(Vector(512), nullable=False)
    
    # E.g., frontal, side_left, low_light
    profile_type = Column(String, default="default") 
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    student = relationship("User", back_populates="embeddings")

class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    date = Column(DateTime(timezone=True), default=func.now(), nullable=False)
    status = Column(String, default="processing") # "processing", "review_needed", "completed"
    created_by_teacher_id = Column(Integer, ForeignKey("users.id"))

    course = relationship("Course", back_populates="attendance_sessions")
    records = relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")
    images = relationship("SessionImage", back_populates="session", cascade="all, delete-orphan")


class SessionImage(Base):
    """A classroom photo of one attendance session, hosted on Cloudinary."""

    __tablename__ = "session_images"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(
        Integer, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Cloudinary secure_url of the original upload.
    url = Column(String, nullable=False)
    # Cloudinary public_id — needed to build derived URLs and to delete the asset.
    public_id = Column(String, nullable=False, index=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    format = Column(String, nullable=True)
    bytes = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("AttendanceSession", back_populates="images")

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("attendance_sessions.id", ondelete="CASCADE"))
    student_id = Column(Integer, ForeignKey("users.id"))
    is_present = Column(Boolean, default=False)
    confidence = Column(Float, nullable=True)
    reviewed_manually = Column(Boolean, default=False)
    # True when the student was marked present through the automated self-review
    # flow (they marked their own face in a session photo). Distinct from
    # reviewed_manually, which means a teacher overrode the record.
    via_review = Column(Boolean, default=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("AttendanceSession", back_populates="records")
    student = relationship("User")


class AttendanceReview(Base):
    """
    A student's one-shot request to be re-evaluated for a session they were
    marked absent in. The student marks their own face in one of the session's
    photos; the system verifies that crop against the student's stored
    embeddings (a 1:1 check, unlike the strict 1:N classroom matching) and, if
    recognized, flips their attendance record to present.

    A student gets exactly one review per session (enforced by the unique
    constraint below), so a genuine "not recognized" outcome is final. Only a
    system-side failure resets the row to allow a retry.
    """

    __tablename__ = "attendance_reviews"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(
        Integer, ForeignKey("attendance_sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    student_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # The session photo the student marked their face in. SET NULL if that image
    # is later removed, so the review history survives.
    image_id = Column(Integer, ForeignKey("session_images.id", ondelete="SET NULL"), nullable=True)

    # Marked region as a fraction (0..1) of the image's natural size, so it maps
    # regardless of how the photo was scaled in the browser. (x, y) is the
    # top-left of the marker's bounding box; (w, h) its size.
    region_x = Column(Float, nullable=False)
    region_y = Column(Float, nullable=False)
    region_w = Column(Float, nullable=False)
    region_h = Column(Float, nullable=False)
    # "circle" or "square" — cosmetic; the crop is the bounding box either way.
    shape = Column(String, default="circle")

    # "pending", "recognized", "not_recognized", "failed".
    status = Column(String, default="pending", nullable=False)
    # Best cosine distance from the marked crop to the student's own embeddings.
    distance = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    decided_at = Column(DateTime(timezone=True), nullable=True)

    session = relationship("AttendanceSession")
    student = relationship("User", foreign_keys=[student_id])
    image = relationship("SessionImage")

    __table_args__ = (
        UniqueConstraint("session_id", "student_id", name="uq_review_session_student"),
    )


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    # Recipient of the notification.
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    # Category, e.g. "join_request", "join_accepted", "join_rejected",
    # "attendance_marked", "low_attendance".
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    # Frontend route to open when the notification is clicked (optional).
    link = Column(String, nullable=True)
    # Related course, if any — lets us clean up notifications when a course goes.
    course_id = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=True)
    is_read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", foreign_keys=[user_id])


class JoinRequest(Base):
    __tablename__ = "join_requests"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))
    status = Column(String, default="pending")  # pending, accepted, rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    decided_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)

    student = relationship("User", foreign_keys=[student_id])
    course = relationship("Course")
