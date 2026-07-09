"""
One-to-one assignment of detected faces to enrolled students for a single
classroom image.

The old approach greedily gave every detected face its nearest enrolled student
if the distance was under a loose threshold, which caused false positives: a
face would be handed to whichever student sat closest in embedding space even
when that student was not actually in the photo. This module fixes that with:

  1. A strict distance threshold (precision over recall).
  2. A runner-up margin (ratio) test — a face must be clearly closer to its best
     student than to the next-best, otherwise the match is ambiguous.
  3. Globally optimal one-to-one assignment (Hungarian algorithm) so two faces
     can never both claim the same student and a single face can't be counted
     for two students.

Anything that does not pass cleanly is left unassigned. The caller treats
unassigned enrolled students as absent — mid-confidence never becomes "present".
"""
import logging
from typing import Dict, List, Optional

import numpy as np
from scipy.optimize import linear_sum_assignment

logger = logging.getLogger(__name__)

# Cost used for (face, student) pairs where the student has no embedding, so the
# assignment solver never prefers a non-existent match. Well above any real
# cosine distance (which maxes out at 2.0).
_UNMATCHED_COST = 10.0


def size_adaptive_threshold(
    face_size: Optional[float],
    strict: float,
    relaxed: float,
    small_px: float,
    large_px: float,
) -> float:
    """
    Pick the accepted match distance for one detected face based on how large
    (detailed) it is.

    Large/close faces -> strict threshold (high detail, embeddings are reliable).
    Small/distant faces -> relaxed threshold (degraded embeddings sit further
    from the true student even when the face is clearly visible). In between,
    interpolate linearly.

    face_size is the min side of the detected box in processed-image pixels.
    Unknown size falls back to the strict threshold (conservative).
    """
    if face_size is None or large_px <= small_px:
        return strict
    if face_size >= large_px:
        return strict
    if face_size <= small_px:
        return relaxed
    t = (face_size - small_px) / (large_px - small_px)  # 0 at small, 1 at large
    return relaxed + t * (strict - relaxed)


def assign_faces_to_students(
    face_distances: List[Dict[int, float]],
    thresholds: List[float],
    margin: float,
) -> Dict[int, float]:
    """
    Assign detected faces in one image to enrolled students.

    Args:
        face_distances: one dict per detected face, mapping student_id -> cosine
            distance for every enrolled student (see
            AttendanceRepository.get_enrolled_student_distances).
        thresholds: per-face maximum accepted distance, aligned with
            face_distances (usually size-adaptive — see size_adaptive_threshold).
        margin: minimum required gap between a face's best and second-best
            student distance; smaller gaps are treated as ambiguous and dropped.

    Returns:
        {student_id: distance} for students confidently present in this image.
        Students not returned are left for the caller to mark absent.
    """
    # Fixed column order across all faces so the cost matrix lines up.
    student_ids = sorted({sid for row in face_distances for sid in row})
    if not face_distances or not student_ids:
        return {}

    num_faces = len(face_distances)
    num_students = len(student_ids)

    cost = np.full((num_faces, num_students), _UNMATCHED_COST, dtype=float)
    for i, row in enumerate(face_distances):
        for j, sid in enumerate(student_ids):
            if sid in row:
                cost[i][j] = row[sid]

    # Globally optimal one-to-one assignment (handles rectangular matrices).
    face_idx, student_idx = linear_sum_assignment(cost)

    accepted: Dict[int, float] = {}
    for i, j in zip(face_idx, student_idx):
        dist = cost[i][j]
        sid = student_ids[j]
        threshold = thresholds[i]

        # The face's own ranking, used for the threshold + ambiguity checks.
        row_sorted = np.sort(cost[i])
        best = row_sorted[0]
        second = row_sorted[1] if num_students > 1 else _UNMATCHED_COST

        # Accept only if this is the face's best student (the assignment didn't
        # push it onto a lesser option), the match is close enough, and it's
        # unambiguous versus the runner-up.
        is_best = np.isclose(dist, best)
        if dist < threshold and is_best and (second - dist) >= margin:
            # A student can only be claimed once (Hungarian guarantees this, but
            # keep the closest distance defensively).
            if sid not in accepted or dist < accepted[sid]:
                accepted[sid] = float(dist)
        else:
            logger.debug(
                "Rejected face %d -> student %s (dist=%.3f, best=%.3f, second=%.3f)",
                i, sid, dist, best, second,
            )

    return accepted
