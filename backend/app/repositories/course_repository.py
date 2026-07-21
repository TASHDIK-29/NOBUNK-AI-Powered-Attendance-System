from sqlalchemy.orm import Session
from sqlalchemy import select, func
from typing import List, Optional
from app.models.models import (
    Course,
    Enrollment,
    JoinRequest,
    AttendanceSession,
    AttendanceRecord,
    AttendanceReview,
    SessionImage,
    StudentEmbedding,
    User,
)
from app.repositories.notification_repository import NotificationRepository
from sqlalchemy import delete as sa_delete
from datetime import datetime
import uuid


class CourseRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_course(self, title: str, code: str, teacher_id: int, department: Optional[str] = None, session_target: Optional[str] = None) -> Course:
        join_token = uuid.uuid4().hex
        course = Course(
            title=title,
            code=code,
            department=department,
            session_target=session_target,
            join_token=join_token,
            teacher_id=teacher_id,
        )
        self.db.add(course)
        self.db.commit()
        self.db.refresh(course)
        return course

    def create_session(self, course_id: int, created_by_teacher_id: int) -> AttendanceSession:
        session = AttendanceSession(
            course_id=course_id,
            created_by_teacher_id=created_by_teacher_id,
        )
        self.db.add(session)
        self.db.commit()
        self.db.refresh(session)
        return session

    def search_courses(self, title: Optional[str] = None, session_target: Optional[str] = None) -> List[Course]:
        stmt = select(Course)
        if title:
            stmt = stmt.where(Course.title.ilike(f"%{title}%"))
        if session_target:
            stmt = stmt.where(Course.session_target == session_target)
        result = self.db.execute(stmt).scalars().all()
        return result

    def list_courses_by_teacher(self, teacher_id: int) -> List[Course]:
        stmt = select(Course).where(Course.teacher_id == teacher_id)
        return self.db.execute(stmt).scalars().all()

    def list_enrollments_by_student(self, student_id: int) -> List[Course]:
        # return Course objects the student is enrolled in
        stmt = select(Course).join(Enrollment, Enrollment.course_id == Course.id).where(Enrollment.student_id == student_id)
        return self.db.execute(stmt).scalars().all()

    def create_join_request(self, student_id: int, course_id: int) -> JoinRequest:
        # avoid duplicate pending requests
        existing = self.db.query(JoinRequest).filter(
            JoinRequest.student_id == student_id,
            JoinRequest.course_id == course_id,
            JoinRequest.status == "pending",
        ).first()
        if existing:
            return existing

        jr = JoinRequest(student_id=student_id, course_id=course_id)
        self.db.add(jr)
        self.db.commit()
        self.db.refresh(jr)

        # Notify the course's teacher that a student wants to join.
        course = self.db.query(Course).filter(Course.id == course_id).first()
        student = self.db.query(User).filter(User.id == student_id).first()
        if course and course.teacher_id:
            student_name = (student.full_name if student else None) or "A student"
            NotificationRepository(self.db).create(
                user_id=course.teacher_id,
                type="join_request",
                title="New join request",
                message=f"{student_name} requested to join {course.title}.",
                link="/teacher/join-requests",
                course_id=course_id,
            )
        return jr

    def list_join_requests_for_teacher(self, teacher_id: int) -> List[JoinRequest]:
        stmt = (
            select(
                JoinRequest.id,
                JoinRequest.student_id,
                JoinRequest.course_id,
                JoinRequest.status,
                JoinRequest.created_at,
                JoinRequest.decided_by,
                JoinRequest.decided_at,
                User.full_name.label("student_name"),
                User.session_year.label("session_year"),
                Course.title.label("course_title"),
                Course.session_target.label("course_session"),
            )
            .join(Course, Course.id == JoinRequest.course_id)
            .join(User, User.id == JoinRequest.student_id)
            .where(Course.teacher_id == teacher_id, JoinRequest.status == "pending")
            .order_by(JoinRequest.created_at.desc())
        )
        return [row._asdict() for row in self.db.execute(stmt).all()]

    def accept_all_join_requests(self, teacher_id: int) -> int:
        """
        Accept every pending join request across a teacher's courses in one
        shot, enrolling each student and notifying them. Returns the count
        accepted.
        """
        pending = (
            self.db.query(JoinRequest)
            .join(Course, Course.id == JoinRequest.course_id)
            .filter(Course.teacher_id == teacher_id, JoinRequest.status == "pending")
            .all()
        )
        for jr in pending:
            self.decide_join_request(request_id=jr.id, accept=True, decided_by=teacher_id)
        return len(pending)

    def decide_join_request(self, request_id: int, accept: bool, decided_by: int):
        jr = self.db.query(JoinRequest).filter(JoinRequest.id == request_id).first()
        if not jr:
            return None
        jr.status = "accepted" if accept else "rejected"
        jr.decided_by = decided_by
        jr.decided_at = datetime.utcnow()
        self.db.commit()
        # if accepted, create enrollment
        if accept:
            # avoid duplicate enrollment
            existing_en = self.db.query(Enrollment).filter(Enrollment.student_id == jr.student_id, Enrollment.course_id == jr.course_id).first()
            if not existing_en:
                en = Enrollment(student_id=jr.student_id, course_id=jr.course_id)
                self.db.add(en)
                self.db.commit()

        # Notify the student of the teacher's decision.
        course = self.db.query(Course).filter(Course.id == jr.course_id).first()
        course_title = course.title if course else "the course"
        if accept:
            NotificationRepository(self.db).create(
                user_id=jr.student_id,
                type="join_accepted",
                title="Join request accepted",
                message=f"You have been enrolled in {course_title}.",
                link=f"/student/courses/{jr.course_id}",
                course_id=jr.course_id,
            )
        else:
            NotificationRepository(self.db).create(
                user_id=jr.student_id,
                type="join_rejected",
                title="Join request declined",
                message=f"Your request to join {course_title} was declined.",
                link="/student/courses",
                course_id=jr.course_id,
            )
        return jr

    def get_course_overview(self, course_id: int):
        course = self.db.query(Course).filter(Course.id == course_id).first()
        if not course:
            return None

        sessions = (
            self.db.query(AttendanceSession)
            .filter(AttendanceSession.course_id == course_id)
            # id breaks ties: sessions a teacher takes on the same calendar day
            # share a date, so without it the newest could sort last and be
            # numbered #1. Newest first (highest id) → highest session number.
            .order_by(AttendanceSession.date.desc(), AttendanceSession.id.desc())
            .all()
        )
        total_sessions = len(sessions)

        # Hosted-photo count per session, in one grouped query rather than N.
        image_counts = dict(
            self.db.query(SessionImage.session_id, func.count(SessionImage.id))
            .join(AttendanceSession, AttendanceSession.id == SessionImage.session_id)
            .filter(AttendanceSession.course_id == course_id)
            .group_by(SessionImage.session_id)
            .all()
        )

        # Number sessions per-course (oldest = 1). Listed newest-first, so the
        # first item is session #total_sessions.
        session_summaries = [
            {
                "id": s.id,
                "session_number": total_sessions - i,
                "date": s.date,
                "status": s.status,
                "image_count": image_counts.get(s.id, 0),
            }
            for i, s in enumerate(sessions)
        ]

        enrolled_students = (
            self.db.query(User)
            .join(Enrollment, Enrollment.student_id == User.id)
            .filter(Enrollment.course_id == course_id)
            .order_by(User.full_name.asc())
            .all()
        )

        student_rows = []
        for student in enrolled_students:
            present_count = (
                self.db.query(func.count(AttendanceRecord.id))
                .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
                .filter(
                    AttendanceSession.course_id == course_id,
                    AttendanceRecord.student_id == student.id,
                    AttendanceRecord.is_present.is_(True),
                )
                .scalar()
                or 0
            )
            absent_count = (
                self.db.query(func.count(AttendanceRecord.id))
                .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
                .filter(
                    AttendanceSession.course_id == course_id,
                    AttendanceRecord.student_id == student.id,
                    AttendanceRecord.is_present.is_(False),
                )
                .scalar()
                or 0
            )
            attendance_score = round((present_count / total_sessions * 100.0), 2) if total_sessions > 0 else 0.0
            student_rows.append(
                {
                    "student_id": student.id,
                    "user_id": student.id,
                    "full_name": student.full_name,
                    "email": student.email,
                    "attendance_score": attendance_score,
                    "present_count": present_count,
                    "absent_count": absent_count,
                    "total_sessions": total_sessions,
                }
            )

        return {
            "course": course,
            "total_students": len(enrolled_students),
            "total_sessions": total_sessions,
            "students": student_rows,
            "sessions": session_summaries,
        }

    def get_student_course_attendance(self, course_id: int, student_id: int):
        """
        Per-session attendance detail for ONE student in ONE course, plus a
        summary. Score = present sessions ÷ this course's total sessions, matching
        the teacher overview. A session with no record counts as absent for the
        score but is flagged (has_record=False) so the UI can distinguish
        "never detected" from an explicit absent mark.
        """
        course = self.db.query(Course).filter(Course.id == course_id).first()
        if not course:
            return None

        sessions = (
            self.db.query(AttendanceSession)
            .filter(AttendanceSession.course_id == course_id)
            # id tiebreak so same-day sessions number consistently (see overview).
            .order_by(AttendanceSession.date.desc(), AttendanceSession.id.desc())
            .all()
        )
        total_sessions = len(sessions)

        records_by_session = {
            r.session_id: r
            for r in (
                self.db.query(AttendanceRecord)
                .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
                .filter(
                    AttendanceSession.course_id == course_id,
                    AttendanceRecord.student_id == student_id,
                )
                .all()
            )
        }

        # Existing reviews and per-session photo counts, both used to decide
        # whether an absent session can still be self-reviewed. Fetched in bulk
        # (one query each) rather than per session.
        reviews_by_session = {
            r.session_id: r
            for r in (
                self.db.query(AttendanceReview)
                .join(AttendanceSession, AttendanceSession.id == AttendanceReview.session_id)
                .filter(
                    AttendanceSession.course_id == course_id,
                    AttendanceReview.student_id == student_id,
                )
                .all()
            )
        }
        image_counts = dict(
            self.db.query(SessionImage.session_id, func.count(SessionImage.id))
            .join(AttendanceSession, AttendanceSession.id == SessionImage.session_id)
            .filter(AttendanceSession.course_id == course_id)
            .group_by(SessionImage.session_id)
            .all()
        )
        has_embeddings = (
            self.db.query(StudentEmbedding.id)
            .filter(StudentEmbedding.student_id == student_id)
            .first()
            is not None
        )

        _reviewable_statuses = {"review_needed", "completed"}
        _blocking_review_statuses = {"pending", "recognized", "not_recognized"}

        present_count = 0
        absent_count = 0
        session_rows = []
        for i, s in enumerate(sessions):
            record = records_by_session.get(s.id)
            is_present = bool(record.is_present) if record else False
            if record is not None:
                if record.is_present:
                    present_count += 1
                else:
                    absent_count += 1

            review = reviews_by_session.get(s.id)
            review_status = review.status if review else None
            review_eligible = (
                not is_present
                and s.status in _reviewable_statuses
                and image_counts.get(s.id, 0) > 0
                and has_embeddings
                and (review is None or review.status not in _blocking_review_statuses)
            )

            session_rows.append(
                {
                    "session_id": s.id,
                    "session_number": total_sessions - i,
                    "date": s.date,
                    "session_status": s.status,
                    "is_present": is_present,
                    "confidence": record.confidence if record else None,
                    "reviewed_manually": bool(record.reviewed_manually) if record else False,
                    "via_review": bool(record.via_review) if record else False,
                    "has_record": record is not None,
                    "review_eligible": review_eligible,
                    "review_status": review_status,
                }
            )

        attendance_score = round((present_count / total_sessions * 100.0), 2) if total_sessions > 0 else 0.0

        return {
            "course": course,
            "total_sessions": total_sessions,
            "present_count": present_count,
            "absent_count": absent_count,
            "attendance_score": attendance_score,
            "sessions": session_rows,
        }

    def get_course_attendance_matrix(self, course_id: int):
        """
        Full attendance grid for a course, for report/PDF export. Sessions are
        listed oldest-first (so date columns read chronologically). Each student
        row carries a present/absent flag per session plus totals. A session with
        no record for a student counts as absent, so present + absent == total.
        """
        course = self.db.query(Course).filter(Course.id == course_id).first()
        if not course:
            return None

        sessions = (
            self.db.query(AttendanceSession)
            .filter(AttendanceSession.course_id == course_id)
            .order_by(AttendanceSession.date.asc(), AttendanceSession.id.asc())
            .all()
        )
        total_sessions = len(sessions)
        session_meta = [
            {"id": s.id, "session_number": i + 1, "date": s.date}
            for i, s in enumerate(sessions)
        ]

        # (student_id, session_id) -> is_present
        present_map = {}
        for student_id, session_id, is_present in (
            self.db.query(
                AttendanceRecord.student_id,
                AttendanceRecord.session_id,
                AttendanceRecord.is_present,
            )
            .join(AttendanceSession, AttendanceSession.id == AttendanceRecord.session_id)
            .filter(AttendanceSession.course_id == course_id)
            .all()
        ):
            present_map[(student_id, session_id)] = bool(is_present)

        students = (
            self.db.query(User)
            .join(Enrollment, Enrollment.student_id == User.id)
            .filter(Enrollment.course_id == course_id)
            .order_by(User.full_name.asc())
            .all()
        )

        student_rows = []
        for student in students:
            attendance = [
                bool(present_map.get((student.id, s.id), False)) for s in sessions
            ]
            present_count = sum(1 for p in attendance if p)
            absent_count = total_sessions - present_count
            percentage = round((present_count / total_sessions * 100.0), 2) if total_sessions > 0 else 0.0
            student_rows.append(
                {
                    "full_name": student.full_name,
                    "student_id": student.student_id or "—",
                    "attendance": attendance,
                    "present_count": present_count,
                    "absent_count": absent_count,
                    "percentage": percentage,
                }
            )

        return {
            "course": course,
            "total_sessions": total_sessions,
            "sessions": session_meta,
            "students": student_rows,
        }

    def search_students(
        self,
        name: Optional[str] = None,
        session_year: Optional[str] = None,
        student_id: Optional[str] = None,
    ) -> List[User]:
        stmt = select(User).where(User.role == "student")
        if name:
            stmt = stmt.where(User.full_name.ilike(f"%{name}%"))
        if session_year:
            stmt = stmt.where(User.session_year == session_year)
        if student_id:
            # Exact match (case-insensitive) — student IDs are unique identifiers,
            # so "1" must match only that ID, not every ID containing "1".
            stmt = stmt.where(User.student_id.ilike(student_id))
        return self.db.execute(stmt).scalars().all()

    def list_pending_join_request_course_ids(self, student_id: int) -> List[int]:
        """Course ids a student has a pending (undecided) join request for."""
        stmt = select(JoinRequest.course_id).where(
            JoinRequest.student_id == student_id,
            JoinRequest.status == "pending",
        )
        return list(self.db.execute(stmt).scalars().all())

    def _hosted_public_ids(self, course_id: int) -> List[str]:
        """public_ids of every Cloudinary asset belonging to a course's sessions."""
        return [
            public_id
            for (public_id,) in self.db.query(SessionImage.public_id)
            .join(AttendanceSession, AttendanceSession.id == SessionImage.session_id)
            .filter(AttendanceSession.course_id == course_id)
            .all()
        ]

    @staticmethod
    def _purge_hosted_images(public_ids: List[str]) -> None:
        """
        Delete hosted images in the background once their DB rows are gone.
        Imported lazily so the repository stays usable without a broker.
        """
        if not public_ids:
            return
        from app.tasks.image_tasks import delete_cloudinary_assets

        delete_cloudinary_assets.delay(public_ids)

    def reset_course_attendance(self, course_id: int) -> int:
        """
        Wipe all attendance for a course: delete every attendance session (which
        cascades to its records and hosted images), giving a clean slate.
        Returns sessions removed.
        """
        public_ids = self._hosted_public_ids(course_id)
        sessions = (
            self.db.query(AttendanceSession)
            .filter(AttendanceSession.course_id == course_id)
            .all()
        )
        count = len(sessions)
        for session in sessions:
            self.db.delete(session)  # cascade removes AttendanceRecord + SessionImage rows
        self.db.commit()
        self._purge_hosted_images(public_ids)
        return count

    def remove_student_from_course(self, course_id: int, student_id: int) -> int:
        """
        Unenroll a student from a course and delete all of their attendance
        records within it. Other students and the sessions themselves are left
        intact. Returns the number of attendance records removed.
        """
        session_ids = [
            sid
            for (sid,) in self.db.query(AttendanceSession.id)
            .filter(AttendanceSession.course_id == course_id)
            .all()
        ]
        deleted = 0
        if session_ids:
            deleted = (
                self.db.query(AttendanceRecord)
                .filter(
                    AttendanceRecord.student_id == student_id,
                    AttendanceRecord.session_id.in_(session_ids),
                )
                .delete(synchronize_session=False)
            )
        self.db.query(Enrollment).filter(
            Enrollment.course_id == course_id,
            Enrollment.student_id == student_id,
        ).delete(synchronize_session=False)
        self.db.commit()
        return deleted

    def delete_course(self, course_id: int) -> bool:
        """
        Permanently delete a course and everything attached to it: its attendance
        sessions (cascading to their records), enrollments, and join requests.
        Returns True if the course existed and was removed.
        """
        course = self.db.query(Course).filter(Course.id == course_id).first()
        if not course:
            return False

        public_ids = self._hosted_public_ids(course_id)

        # Sessions cascade to their AttendanceRecord and SessionImage rows, so
        # delete via the ORM to trigger the relationship cascade.
        for session in (
            self.db.query(AttendanceSession)
            .filter(AttendanceSession.course_id == course_id)
            .all()
        ):
            self.db.delete(session)

        self.db.execute(sa_delete(Enrollment).where(Enrollment.course_id == course_id))
        self.db.execute(sa_delete(JoinRequest).where(JoinRequest.course_id == course_id))

        self.db.delete(course)
        self.db.commit()
        self._purge_hosted_images(public_ids)
        return True

    def add_student_to_course(self, course_id: int, student_id: int):
        existing = self.db.query(Enrollment).filter(
            Enrollment.course_id == course_id,
            Enrollment.student_id == student_id,
        ).first()
        if existing:
            return existing

        enrollment = Enrollment(course_id=course_id, student_id=student_id)
        self.db.add(enrollment)
        self.db.commit()
        self.db.refresh(enrollment)
        return enrollment
