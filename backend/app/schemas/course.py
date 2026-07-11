from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class CourseCreate(BaseModel):
    title: str
    code: str
    department: Optional[str] = None
    session_target: Optional[str] = None


class CourseOut(BaseModel):
    id: int
    title: str
    code: str
    department: Optional[str]
    session_target: Optional[str]
    teacher_id: Optional[int]
    join_token: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class SessionOut(BaseModel):
    id: int
    course_id: int
    date: datetime
    status: str
    created_by_teacher_id: Optional[int]

    class Config:
        from_attributes = True


class JoinRequestOut(BaseModel):
    id: int
    student_id: int
    course_id: int
    status: str
    created_at: datetime
    decided_by: Optional[int]
    decided_at: Optional[datetime]

    class Config:
        from_attributes = True


class CourseStudentAttendanceOut(BaseModel):
    student_id: int
    user_id: int
    full_name: str
    email: str
    attendance_score: float
    present_count: int
    absent_count: int
    total_sessions: int


class CourseSessionSummaryOut(BaseModel):
    id: int
    # Per-course sequential number (1 = first session in THIS course), so session
    # counts never combine across a teacher's other courses.
    session_number: int
    date: datetime
    status: str
    # Number of classroom photos hosted for this session (0 while the upload
    # task is still running, or if image hosting is disabled).
    image_count: int = 0

    class Config:
        from_attributes = True


class CourseOverviewOut(BaseModel):
    course: CourseOut
    total_students: int
    total_sessions: int
    students: List[CourseStudentAttendanceOut]
    sessions: List[CourseSessionSummaryOut]


class StudentSessionAttendanceOut(BaseModel):
    session_id: int
    # Per-course sequential number (1 = first session in THIS course).
    session_number: int
    date: datetime
    session_status: str
    is_present: bool
    confidence: Optional[float] = None
    reviewed_manually: bool
    # True when the student was marked present via the self-review flow.
    via_review: bool = False
    # False when no attendance record exists for this student in the session
    # (i.e. never detected/marked) — still counts as absent for the score.
    has_record: bool
    # Whether the student may request a self-review for this (absent) session.
    review_eligible: bool = False
    # Status of an existing review, if any: pending | recognized | not_recognized | failed.
    review_status: Optional[str] = None

    class Config:
        from_attributes = True


class StudentCourseAttendanceOut(BaseModel):
    course: CourseOut
    total_sessions: int
    present_count: int
    absent_count: int
    attendance_score: float
    sessions: List[StudentSessionAttendanceOut]


class StudentSearchOut(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    student_id: Optional[str] = None
    department: Optional[str] = None
    session_year: Optional[str] = None

    class Config:
        from_attributes = True


class AddStudentToCourseOut(BaseModel):
    message: str
    course_id: int
    student_id: int


class JoinRequestDetailOut(BaseModel):
    id: int
    student_id: int
    course_id: int
    status: str
    created_at: datetime
    decided_by: Optional[int]
    decided_at: Optional[datetime]
    student_name: Optional[str] = None
    session_year: Optional[str] = None
    course_title: Optional[str] = None
    course_session: Optional[str] = None
