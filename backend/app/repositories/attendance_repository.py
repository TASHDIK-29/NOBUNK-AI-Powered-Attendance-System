import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.models import StudentEmbedding, Enrollment, AttendanceRecord, User
from typing import List, Tuple

class AttendanceRepository:
    def __init__(self, db: Session):
        self.db = db

    def find_matching_students_in_course(self, target_embedding: List[float], course_id: int, threshold: float = 0.6) -> Tuple[int, float]:
        """
        Perform a pgvector similarity search using L2 distance (cosine distance is also possible, 
        setup depends on embedding geometry, DeepFace ArcFace uses Cosine or L2).
        ArcFace embeddings are usually compared using Cosine similarity.
        We will use `.cosine_distance()`.
        
        Searches ONLY within students enrolled in the given course_id.
        Returns (student_id, distance) of the best match, or (None, None) if below threshold.
        """
        # Convert to numpy array just in case, pgvector handles arrays well
        emb_array = np.array(target_embedding)
        
        # Subquery or join: Only search embeddings of students in this course
        # cosine_distance: lower is more similar (0 = identical, 2 = opposite)
        # DeepFace ArcFace default cosine threshold is around 0.68.
        
        stmt = (
            select(
                StudentEmbedding.student_id, 
                StudentEmbedding.embedding.cosine_distance(emb_array).label("distance")
            )
            .join(Enrollment, Enrollment.student_id == StudentEmbedding.student_id)
            .where(Enrollment.course_id == course_id)
            .order_by("distance")
            .limit(1)
        )
        
        result = self.db.execute(stmt).first()
        if result:
            student_id, distance = result
            # distance: smaller is better. distance < threshold implies a match
            if distance < threshold:
                return student_id, distance
        
        return None, None

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

