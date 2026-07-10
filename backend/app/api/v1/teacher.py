import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List
from app.api.deps import get_db, get_current_active_teacher, get_current_active_user
from app.repositories.course_repository import CourseRepository
from app.schemas.course import CourseCreate, CourseOut, SessionOut, JoinRequestOut, CourseOverviewOut, StudentSearchOut, AddStudentToCourseOut, JoinRequestDetailOut, StudentCourseAttendanceOut
from app.models.models import Course, Enrollment, User
from app.services.pdf_service import build_attendance_pdf

router = APIRouter()


@router.post("/courses", response_model=CourseOut)
def create_course(course_in: CourseCreate, db: Session = Depends(get_db), current_user = Depends(get_current_active_teacher)):
    repo = CourseRepository(db)
    course = repo.create_course(title=course_in.title, code=course_in.code, teacher_id=current_user.id, department=course_in.department, session_target=course_in.session_target)
    return course


@router.post("/courses/{course_id}/sessions", response_model=SessionOut)
def create_session(course_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_active_teacher)):
    # verify teacher owns the course
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to create sessions for this course")
    repo = CourseRepository(db)
    session = repo.create_session(course_id=course_id, created_by_teacher_id=current_user.id)
    return session


@router.get("/join-requests", response_model=List[JoinRequestDetailOut])
def list_join_requests(db: Session = Depends(get_db), current_user = Depends(get_current_active_teacher)):
    repo = CourseRepository(db)
    reqs = repo.list_join_requests_for_teacher(teacher_id=current_user.id)
    return reqs


@router.get("/courses", response_model=List[CourseOut])
def list_my_courses(db: Session = Depends(get_db), current_user = Depends(get_current_active_teacher)):
    repo = CourseRepository(db)
    courses = repo.list_courses_by_teacher(teacher_id=current_user.id)
    return courses


@router.get("/courses/{course_id}/overview", response_model=CourseOverviewOut)
def course_overview(course_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_active_teacher)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to view this course")

    repo = CourseRepository(db)
    overview = repo.get_course_overview(course_id)
    if not overview:
        raise HTTPException(status_code=404, detail="Course not found")
    return overview


@router.get(
    "/courses/{course_id}/students/{student_id}/attendance",
    response_model=StudentCourseAttendanceOut,
)
def student_course_attendance(
    course_id: int,
    student_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_active_teacher),
):
    """
    One enrolled student's per-session attendance in a course the teacher owns —
    powers the per-student detail + manual-correction view.
    """
    _get_owned_course(course_id, db, current_user)

    enrolled = db.query(Enrollment).filter(
        Enrollment.course_id == course_id,
        Enrollment.student_id == student_id,
    ).first()
    if not enrolled:
        raise HTTPException(status_code=404, detail="Student is not enrolled in this course")

    repo = CourseRepository(db)
    data = repo.get_student_course_attendance(course_id=course_id, student_id=student_id)
    if not data:
        raise HTTPException(status_code=404, detail="Course not found")
    return data


@router.get("/courses/{course_id}/attendance/pdf")
def download_attendance_pdf(course_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_active_teacher)):
    """Download the latest attendance state of a course as a PDF report."""
    course = _get_owned_course(course_id, db, current_user)
    repo = CourseRepository(db)
    data = repo.get_course_attendance_matrix(course_id)
    if not data:
        raise HTTPException(status_code=404, detail="Course not found")

    pdf_bytes = build_attendance_pdf(data)

    safe_code = re.sub(r"[^A-Za-z0-9_-]+", "_", (course.code or f"course_{course_id}"))
    filename = f"attendance_{safe_code}_{datetime.now().strftime('%Y%m%d')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/join-requests/{request_id}/decide")
def decide_join_request(request_id: int, accept: bool, db: Session = Depends(get_db), current_user = Depends(get_current_active_teacher)):
    repo = CourseRepository(db)
    jr = repo.decide_join_request(request_id=request_id, accept=accept, decided_by=current_user.id)
    if not jr:
        raise HTTPException(status_code=404, detail="Join request not found")
    return {"status": jr.status}


@router.get("/students/search", response_model=List[StudentSearchOut])
def search_students(name: str | None = None, session_year: str | None = None, db: Session = Depends(get_db), current_user = Depends(get_current_active_teacher)):
    repo = CourseRepository(db)
    return repo.search_students(name=name, session_year=session_year)


@router.post("/courses/{course_id}/students/{student_id}", response_model=AddStudentToCourseOut)
def add_student_to_course(course_id: int, student_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_active_teacher)):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to modify this course")

    student = db.query(User).filter(User.id == student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    repo = CourseRepository(db)
    repo.add_student_to_course(course_id=course_id, student_id=student_id)
    return {"message": "Student added to course", "course_id": course_id, "student_id": student_id}


def _get_owned_course(course_id: int, db: Session, current_user: User) -> Course:
    """Fetch a course and ensure the current teacher owns it, else raise."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if course.teacher_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not allowed to modify this course")
    return course


@router.delete("/courses/{course_id}")
def delete_course(course_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_active_teacher)):
    """Permanently delete a course the teacher owns, with all its data."""
    _get_owned_course(course_id, db, current_user)
    repo = CourseRepository(db)
    repo.delete_course(course_id)
    return {"message": "Course deleted.", "course_id": course_id}


@router.delete("/courses/{course_id}/attendance")
def reset_course_attendance(course_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_active_teacher)):
    """Reset the entire attendance record for a course (all sessions + records)."""
    _get_owned_course(course_id, db, current_user)
    repo = CourseRepository(db)
    removed = repo.reset_course_attendance(course_id)
    return {
        "message": f"Reset attendance for course {course_id}. Removed {removed} session(s).",
        "sessions_removed": removed,
    }


@router.delete("/courses/{course_id}/students/{student_id}")
def remove_student_from_course(course_id: int, student_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_active_teacher)):
    """Remove a student from a course, deleting their attendance records too."""
    _get_owned_course(course_id, db, current_user)
    repo = CourseRepository(db)
    removed = repo.remove_student_from_course(course_id, student_id)
    return {
        "message": f"Student removed from course. Deleted {removed} attendance record(s).",
        "records_removed": removed,
    }
