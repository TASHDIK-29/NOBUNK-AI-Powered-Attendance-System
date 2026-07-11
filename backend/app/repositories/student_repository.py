"""
Data access for a student's own reference embeddings: counting, replacing, and
comparing a fresh photo against the stored set (for the self-check flow).
"""
from typing import List, Optional

import numpy as np
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.models import StudentEmbedding


class StudentRepository:
    def __init__(self, db: Session):
        self.db = db

    def count_embeddings(self, student_id: int) -> int:
        return (
            self.db.query(StudentEmbedding.id)
            .filter(StudentEmbedding.student_id == student_id)
            .count()
        )

    def delete_embeddings(self, student_id: int) -> int:
        """Remove all of a student's stored embeddings. Returns how many were deleted."""
        deleted = (
            self.db.query(StudentEmbedding)
            .filter(StudentEmbedding.student_id == student_id)
            .delete(synchronize_session=False)
        )
        self.db.commit()
        return deleted

    def add_embeddings(
        self, student_id: int, embeddings: List[list], profile_type: str = "default"
    ) -> List[int]:
        rows = [
            StudentEmbedding(student_id=student_id, embedding=emb, profile_type=profile_type)
            for emb in embeddings
        ]
        self.db.add_all(rows)
        self.db.commit()
        for row in rows:
            self.db.refresh(row)
        return [row.id for row in rows]

    def min_distance(self, embedding: list, student_id: int) -> Optional[float]:
        """
        Smallest cosine distance from `embedding` to any of the student's stored
        reference embeddings (0 = identical). None if they have none stored.
        """
        emb = np.array(embedding)
        value = self.db.execute(
            select(func.min(StudentEmbedding.embedding.cosine_distance(emb)))
            .where(StudentEmbedding.student_id == student_id)
        ).scalar()
        return float(value) if value is not None else None
