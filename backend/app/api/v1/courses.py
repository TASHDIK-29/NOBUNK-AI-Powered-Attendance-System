from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.api.deps import get_db, get_current_active_user
from app.repositories.course_repository import CourseRepository
from app.schemas.course import CourseOut, SessionOut, JoinRequestOut, StudentCourseAttendanceOut
from app.models.models import Course, Enrollment

router = APIRouter()


@router.get("/", response_model=List[CourseOut])
def search_courses(title: str = None, session: str = None, db: Session = Depends(get_db)):
    repo = CourseRepository(db)
    courses = repo.search_courses(title=title, session_target=session)
    return courses


@router.post("/{course_id}/join-request", response_model=JoinRequestOut)
def place_join_request(course_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    # Only students should place join requests
    if current_user.role != "student":
        raise HTTPException(status_code=403, detail="Only students can request to join courses.")
    repo = CourseRepository(db)
    jr = repo.create_join_request(student_id=current_user.id, course_id=course_id)
    return jr


@router.get("/mine", response_model=List[CourseOut])
def my_enrolled_courses(db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    repo = CourseRepository(db)
    courses = repo.list_enrollments_by_student(student_id=current_user.id)
    return courses


@router.get("/my-join-requests", response_model=List[int])
def my_pending_join_requests(db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """Course ids the current student has an undecided join request for."""
    repo = CourseRepository(db)
    return repo.list_pending_join_request_course_ids(student_id=current_user.id)


@router.get("/{course_id}/my-attendance", response_model=StudentCourseAttendanceOut)
def my_course_attendance(course_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_active_user)):
    """A student's own per-session attendance record for a course they joined."""
    enrollment = db.query(Enrollment).filter(
        Enrollment.course_id == course_id,
        Enrollment.student_id == current_user.id,
    ).first()
    if not enrollment:
        raise HTTPException(status_code=403, detail="You are not enrolled in this course.")

    repo = CourseRepository(db)
    data = repo.get_student_course_attendance(course_id=course_id, student_id=current_user.id)
    if not data:
        raise HTTPException(status_code=404, detail="Course not found")
    return data
