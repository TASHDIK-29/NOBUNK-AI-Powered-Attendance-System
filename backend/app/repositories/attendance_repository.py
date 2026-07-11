import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from app.models.models import StudentEmbedding, Enrollment, AttendanceRecord, User
from typing import Dict, List

class AttendanceRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_enrolled_student_distances(self, target_embedding: List[float], course_id: int) -> Dict[int, float]:
        """
        Cosine distance from one detected face to every enrolled student in the
        course, taking each student's BEST (minimum) distance across all of their
        reference embeddings.

        Returns {student_id: distance} for every enrolled student that has at
        least one embedding. Lower distance = more similar (0 = identical). The
        caller uses these to build a face x student cost matrix for one-to-one
        assignment and to apply the runner-up margin (ambiguity) test — so we
        return the full ranking here rather than a single top-1 guess.
        """
        emb_array = np.array(target_embedding)
        distance = func.min(StudentEmbedding.embedding.cosine_distance(emb_array)).label("distance")
        stmt = (
            select(StudentEmbedding.student_id, distance)
            .join(Enrollment, Enrollment.student_id == StudentEmbedding.student_id)
            .where(Enrollment.course_id == course_id)
            .group_by(StudentEmbedding.student_id)
        )
        return {row.student_id: float(row.distance) for row in self.db.execute(stmt).all()}

    def mark_attendance(self, session_id: int, student_id: int, distance: float, is_present: bool = True):
        """
        Marks attendance. Handles duplicate prevention by checking if a record exists.
        Returns True if newly marked, False if already marked.
        """
        # Calculate a pseudo confidence score from distance (cosine distance 0..2)
        # 1 - (distance / 2) is a simple conversion to 0.0 - 1.0 confidence
        confidence = max(0.0, 1 - (distance / 2.0))

        existing = self.db.query(AttendanceRecord).filter(
            AttendanceRecord.session_id == session_id,
            AttendanceRecord.student_id == student_id
        ).first()

        if existing:
            # If already marked correctly, ignore
            if existing.is_present == is_present:
                return False
            else:
                existing.is_present = is_present
                existing.confidence = confidence
                self.db.commit()
                return True

        # create new record
        record = AttendanceRecord(
            session_id=session_id,
            student_id=student_id,
            is_present=is_present,
            confidence=confidence
        )
        self.db.add(record)
        self.db.commit()
        return True

    def mark_present_via_review(self, session_id: int, student_id: int, distance: float):
        """
        Mark a student present as the result of an approved self-review, tagging
        the record with via_review so the UI can attribute it correctly. Upserts
        the record (a review only happens for an absent student, but be safe).
        """
        confidence = max(0.0, 1 - (distance / 2.0))
        record = self.db.query(AttendanceRecord).filter(
            AttendanceRecord.session_id == session_id,
            AttendanceRecord.student_id == student_id,
        ).first()

        if record:
            record.is_present = True
            record.confidence = confidence
            record.via_review = True
        else:
            record = AttendanceRecord(
                session_id=session_id,
                student_id=student_id,
                is_present=True,
                confidence=confidence,
                via_review=True,
            )
            self.db.add(record)
        self.db.commit()
        return record

