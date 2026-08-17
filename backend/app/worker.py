from celery import Celery
from app.config import settings

celery_app = Celery(
    "tasks",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

@celery_app.task(name="app.worker.analyze_report_task")
def analyze_report_task(report_id: int):
    """
    Asynchronous Celery task to orchestrate AI analysis.
    In subsequent phases, this will query the isolated ai-service and write results back to the database.
    """
    print(f"Celery task: Initiating AI analysis pipeline for report {report_id}...")
    return {"status": "success", "report_id": report_id, "detail": "Task setup completed"}
