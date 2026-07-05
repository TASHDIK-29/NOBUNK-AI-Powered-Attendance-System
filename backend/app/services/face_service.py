import cv2
import numpy as np
from deepface import DeepFace
import logging

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class FaceRecognitionService:
    def __init__(self):
        # Enforce ArcFace as per requirements (512-d embeddings).
        self.model_name = settings.FACE_MODEL
        # RetinaFace is the strongest detector for classroom scenes (many faces,
        # varying sizes and occlusions). MTCNN is used as a fallback because the
        # two detectors fail on different kinds of images, so trying both recovers
        # faces that a single detector would miss.
        self.detector_backend = settings.FACE_DETECTOR
        self.fallback_detector = settings.FACE_FALLBACK_DETECTOR
        self.min_confidence = settings.FACE_DETECTION_CONFIDENCE
        self.target_side = settings.FACE_TARGET_IMAGE_SIDE
        self.max_side = settings.FACE_MAX_IMAGE_SIDE
        self.max_upscale = settings.FACE_MAX_UPSCALE

    def _prepare_image(self, img):
        """
        Load the image (if given a path) and adaptively resize it so far/small
        faces become detectable while huge uploads stay memory-safe.

        Returns a BGR numpy frame. Falls back to the original input (so DeepFace
        can read it directly) if the image can't be decoded here.
        """
        frame = cv2.imread(img) if isinstance(img, str) else img
        if frame is None:
            # Unreadable/unsupported by OpenCV — let DeepFace try the raw input.
            return img

        h, w = frame.shape[:2]
        longer = max(h, w)
        if longer == 0:
            return frame

        if longer > self.max_side:
            scale = self.max_side / longer          # downscale oversized uploads
        elif longer < self.target_side:
            scale = min(self.target_side / longer, self.max_upscale)  # upscale small ones
        else:
            return frame

        interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
        resized = cv2.resize(frame, (round(w * scale), round(h * scale)), interpolation=interp)
        logger.debug(f"Resized image {w}x{h} -> {resized.shape[1]}x{resized.shape[0]} (scale {scale:.2f})")
        return resized

    def _represent(self, img, detector_backend):
        """
        Run DeepFace.represent with a given detector.

        enforce_detection is False so a hard-to-detect image never throws and
        wipes out an entire classroom photo. When DeepFace finds nothing it
        returns a single whole-image "face" with confidence 0, which we filter
        out below by confidence.
        """
        return DeepFace.represent(
            img_path=img,
            model_name=self.model_name,
            detector_backend=detector_backend,
            enforce_detection=False,
            align=True,
        )

    def _detect(self, img):
        """
        Detect faces and extract embeddings, filtering low-confidence detections
        and falling back to the secondary detector when the primary finds nothing
        usable. Returns a list of {embedding, facial_area, confidence}.
        """
        def run(detector):
            try:
                faces = self._represent(img, detector)
            except Exception as e:  # noqa: BLE001 - never let one image break a batch
                logger.warning(f"Detector '{detector}' failed on image: {e}")
                return []
            good = []
            for f in faces:
                confidence = f.get("face_confidence") or 0
                if confidence < self.min_confidence:
                    continue
                good.append({
                    "embedding": f.get("embedding"),
                    "facial_area": f.get("facial_area"),
                    "confidence": confidence,
                })
            return good

        results = run(self.detector_backend)
        if not results and self.fallback_detector and self.fallback_detector != self.detector_backend:
            logger.info(
                f"Primary detector '{self.detector_backend}' found no faces; "
                f"retrying with fallback '{self.fallback_detector}'."
            )
            results = run(self.fallback_detector)
        return results

    def extract_faces_and_embeddings(self, img_path: str):
        """
        Detect faces in an image on disk and extract ArcFace embeddings.
        Returns a list of dicts containing embedding, bounding box, and confidence.
        Never raises: returns [] when no usable face is found.
        """
        return self._detect(self._prepare_image(img_path))

    def get_embedding_from_frame(self, frame_np):
        """
        Same as extract_faces_and_embeddings, but for an OpenCV/numpy frame.
        """
        return self._detect(self._prepare_image(frame_np))


face_service = FaceRecognitionService()
