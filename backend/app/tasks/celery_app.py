from celery import Celery
from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "attendance_tasks",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    # In the lightweight deployment there is no Redis broker and no worker, so
    # any .delay() call (only the non-AI Cloudinary cleanup can fire — the AI
    # tasks are gated) runs inline instead of trying to reach a broker.
    task_always_eager=not settings.AI_FEATURES_ENABLED,
    task_eager_propagates=True,
)

# Autodiscover tasks in our app
celery_app.autodiscover_tasks(
    [
        "app.tasks.attendance_tasks",
        "app.tasks.image_tasks",
        "app.tasks.review_tasks",
        "app.services.notification_service",
    ]
)
