from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float
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

class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("attendance_sessions.id", ondelete="CASCADE"))
    student_id = Column(Integer, ForeignKey("users.id"))
    is_present = Column(Boolean, default=False)
    confidence = Column(Float, nullable=True)
    reviewed_manually = Column(Boolean, default=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("AttendanceSession", back_populates="records")
    student = relationship("User")


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
