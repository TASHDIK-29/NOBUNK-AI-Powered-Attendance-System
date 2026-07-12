from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: str = "student"
    
class UserCreate(UserBase):
    password: str
    student_id: Optional[str] = None
    department: Optional[str] = None
    session_year: Optional[str] = None

class UserOut(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    student_id: Optional[str] = None
    department: Optional[str] = None
    session_year: Optional[str] = None

    class Config:
        from_attributes = True
