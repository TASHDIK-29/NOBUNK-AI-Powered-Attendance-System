"""
Data access + eligibility rules for the student self-review flow.

A student may request exactly one review per session, and only when they were
actually marked absent for a session that has finished processing and has photos
to mark. All of those rules live in `eligibility` so the "can I review?" endpoint
and the "submit review" endpoint agree.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Optional

from sqlalchemy.orm import Session

from app.models.models import (
    AttendanceRecord,
    AttendanceReview,
    AttendanceSession,
    Enrollment,
    SessionImage,
    StudentEmbedding,
)

# Session must have finished the automated pass before a review makes sense.
_REVIEWABLE_SESSION_STATUSES = {"review_needed", "completed"}
# A prior review in one of these states means the student's one chance is spent.
# "failed" is deliberately excluded so a system error doesn't burn their attempt.
_BLOCKING_REVIEW_STATUSES = {"pending", "recognized", "not_recognized"}


@dataclass
class Eligibility:
    eligible: bool
    reason: str
    # Present review row (any status), so callers can surface its result.
    review: Optional[AttendanceReview] = None


class ReviewRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_review(self, review_id: int) -> Optional[AttendanceReview]:
        return self.db.query(AttendanceReview).filter(AttendanceReview.id == review_id).first()

    def get_review_for(self, session_id: int, student_id: int) -> Optional[AttendanceReview]:
        return (
            self.db.query(AttendanceReview)
            .filter(
                AttendanceReview.session_id == session_id,
                AttendanceReview.student_id == student_id,
            )
            .first()
        )

    def student_has_embeddings(self, student_id: int) -> bool:
        return (
            self.db.query(StudentEmbedding.id)
            .filter(StudentEmbedding.student_id == student_id)
            .first()
            is not None
        )

    def session_image_count(self, session_id: int) -> int:
        return (
            self.db.query(SessionImage.id)
            .filter(SessionImage.session_id == session_id)
            .count()
        )

    def eligibility(self, session_id: int, student_id: int) -> Eligibility:
        """Whether `student_id` may request a review for `session_id`, and why not."""
        session = (
            self.db.query(AttendanceSession)
            .filter(AttendanceSession.id == session_id)
            .first()
        )
        if not session:
            return Eligibility(False, "session_not_found")

        enrolled = (
            self.db.query(Enrollment.id)
            .filter(
                Enrollment.course_id == session.course_id,
                Enrollment.student_id == student_id,
            )
            .first()
        )
        if not enrolled:
            return Eligibility(False, "not_enrolled")

        existing = self.get_review_for(session_id, student_id)
        if existing and existing.status in _BLOCKING_REVIEW_STATUSES:
            return Eligibility(False, "already_reviewed", review=existing)

        if session.status not in _REVIEWABLE_SESSION_STATUSES:
            return Eligibility(False, "session_not_ready", review=existing)

        # Only an absent student can request a review.
        record = (
            self.db.query(AttendanceRecord)
            .filter(
                AttendanceRecord.session_id == session_id,
                AttendanceRecord.student_id == student_id,
            )
            .first()
        )
        if record and record.is_present:
            return Eligibility(False, "already_present", review=existing)

        if self.session_image_count(session_id) == 0:
            return Eligibility(False, "no_images", review=existing)

        if not self.student_has_embeddings(student_id):
            return Eligibility(False, "no_reference_image", review=existing)

        return Eligibility(True, "eligible", review=existing)

    def create_or_reset_pending(
        self,
        session_id: int,
        student_id: int,
        image_id: int,
        region: Dict[str, float],
        shape: str,
    ) -> AttendanceReview:
        """
        Create a pending review, or reuse an existing row that previously failed
        (a system error must not consume the student's single attempt). The
        unique (session_id, student_id) constraint guarantees at most one row.
        """
        review = self.get_review_for(session_id, student_id)
        if review is None:
            review = AttendanceReview(session_id=session_id, student_id=student_id)
            self.db.add(review)

        review.image_id = image_id
        review.region_x = region["x"]
        review.region_y = region["y"]
        review.region_w = region["w"]
        review.region_h = region["h"]
        review.shape = shape
        review.status = "pending"
        review.distance = None
        review.decided_at = None
        self.db.commit()
        self.db.refresh(review)
        return review

    def set_result(self, review: AttendanceReview, status: str, distance: Optional[float]) -> AttendanceReview:
        review.status = status
        review.distance = distance
        review.decided_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(review)
        return review
