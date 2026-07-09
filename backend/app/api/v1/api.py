from fastapi import APIRouter
from app.api.v1 import attendance, auth, students
from app.api.v1 import courses, teacher, notifications

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(students.router, prefix="/students", tags=["students"])
api_router.include_router(attendance.router, prefix="/attendance", tags=["attendance"])
api_router.include_router(courses.router, prefix="/courses", tags=["courses"])
api_router.include_router(teacher.router, prefix="/teacher", tags=["teacher"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
