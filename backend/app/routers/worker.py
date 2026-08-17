import os
import json
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import case, or_

from app.database import get_db
from app import schemas, auth
from app.models import User, Report, Evidence, ReportStatusHistory, AIPrediction
from app.services import storage
from app.websocket import manager

router = APIRouter(prefix="/worker", tags=["Worker"])
logger = logging.getLogger(__name__)

def require_worker(current_user: User = Depends(auth.get_current_user)) -> User:
    """Enforces that the authenticated user has the role WORKER."""
    if current_user.role.upper() != "WORKER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Worker role permissions required."
        )
    return current_user

@router.get("/tasks")
def list_assigned_tasks(
    status: str = Query("active", regex="^(active|completed|all)$"),
    db: Session = Depends(get_db),
    worker_user: User = Depends(require_worker)
):
    """
    Lists tasks assigned to the logged-in worker.
    Sorts by severity priority (CRITICAL -> HIGH -> MEDIUM -> LOW),
    then by oldest assignment date first.
    """
    query = db.query(Report).filter(Report.assigned_worker_id == worker_user.id)

    # Apply status filters
    if status == "active":
        query = query.filter(Report.status.in_(["ASSIGNED", "IN_PROGRESS"]))
    elif status == "completed":
        query = query.filter(Report.status.in_(["RESOLVED", "CLOSED"]))

    # Sort severity using CASE statement
    severity_order = case(
        (Report.severity == "CRITICAL", 1),
        (Report.severity == "HIGH", 2),
        (Report.severity == "MEDIUM", 3),
        (Report.severity == "LOW", 4),
        else_=5
    )
    # Secondary sort: oldest updated/assigned task first
    query = query.order_by(severity_order.asc(), Report.updated_at.asc())

    results = query.all()
    tasks = []
    
    for r in results:
        # Load evidence before image if available
        before_ev = db.query(Evidence).filter(Evidence.report_id == r.id, Evidence.type == "BEFORE").first()
        tasks.append({
            "id": r.id,
            "report_number": f"CF-2026-{str(r.id).zfill(6)}",
            "category": r.category,
            "severity": r.severity,
            "status": r.status,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "address": r.address,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            "before_image": before_ev.file_path if before_ev else None
        })

    return tasks

@router.get("/tasks/{id}")
def get_task_details(
    id: int,
    db: Session = Depends(get_db),
    worker_user: User = Depends(require_worker)
):
    """
    Retrieves full details of a specific task.
    Enforces task assignment ownership checks.
    """
    report = db.query(Report).filter(Report.id == id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    # Ownership validation
    if report.assigned_worker_id != worker_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You are not assigned to this task."
        )

    evidence = db.query(Evidence).filter(Evidence.report_id == id).all()
    history = db.query(ReportStatusHistory).filter(ReportStatusHistory.report_id == id).order_by(ReportStatusHistory.created_at.desc()).all()
    latest_pred = db.query(AIPrediction).filter(AIPrediction.report_id == id).first()

    return {
        "id": report.id,
        "report_number": f"CF-2026-{str(report.id).zfill(6)}",
        "category": report.category,
        "severity": report.severity,
        "status": report.status,
        "description": report.description,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "address": report.address,
        "department_id": report.department_id,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "ai_confidence": latest_pred.confidence if latest_pred else None,
        "evidence": [
            {"id": ev.id, "file_path": ev.file_path, "type": ev.type, "created_at": ev.created_at.isoformat() if ev.created_at else None}
            for ev in evidence
        ],
        "history": [
            {
                "id": hist.id,
                "status": hist.status,
                "comment": hist.comment,
                "created_at": hist.created_at.isoformat() if hist.created_at else None
            }
            for hist in history
        ]
    }

@router.put("/tasks/{id}/start")
async def start_task(
    id: int,
    payload: Optional[schemas.StatusUpdate] = None, # Optional comment payload
    db: Session = Depends(get_db),
    worker_user: User = Depends(require_worker)
):
    """
    Transitions report status to IN_PROGRESS.
    """
    report = db.query(Report).filter(Report.id == id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    # Verify ownership
    if report.assigned_worker_id != worker_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Ownership required.")

    # Verify state
    if report.status.upper() != "ASSIGNED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot start task. Current status must be ASSIGNED (got: {report.status})"
        )

    # Perform update
    next_status = "IN_PROGRESS"
    report.status = next_status
    report.updated_at = datetime.utcnow()

    # Log history
    comment_text = payload.comment if payload and payload.comment else "Worker started progress on task."
    history = ReportStatusHistory(
        report_id=report.id,
        status=next_status,
        changed_by_id=worker_user.id,
        comment=comment_text
    )
    db.add(history)
    db.commit()
    db.refresh(report)

    # Broadcast event
    try:
        import asyncio
        event = {
            "event": "task_status_changed",
            "report": {
                "id": report.id,
                "status": report.status,
                "category": report.category,
                "severity": report.severity,
                "latitude": report.latitude,
                "longitude": report.longitude,
                "address": report.address
            }
        }
        asyncio.create_task(manager.broadcast(json.dumps(event)))
    except Exception:
        pass

    return {"message": "Task started successfully", "status": report.status}

@router.post("/tasks/{id}/resolve")
async def resolve_task(
    id: int,
    comment: str = Form(...),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    worker_user: User = Depends(require_worker)
):
    """
    Validates, saves the resolution AFTER evidence image, and transitions status to RESOLVED.
    """
    report = db.query(Report).filter(Report.id == id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    # Verify ownership
    if report.assigned_worker_id != worker_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: Ownership required.")

    # Verify state
    if report.status.upper() != "IN_PROGRESS":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot resolve task. Current status must be IN_PROGRESS (got: {report.status})"
        )

    # Verify inputs
    if not comment or comment.strip() == "":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Closure comment is required")

    # Save AFTER resolution image file (validations occur in storage)
    file_path = storage.save_uploaded_file(image)

    # Perform updates
    next_status = "RESOLVED"
    report.status = next_status
    report.updated_at = datetime.utcnow()

    # Save Evidence record
    evidence = Evidence(
        report_id=report.id,
        file_path=file_path,
        type="AFTER",
        uploaded_by_id=worker_user.id
    )
    db.add(evidence)

    # Log history
    history = ReportStatusHistory(
        report_id=report.id,
        status=next_status,
        changed_by_id=worker_user.id,
        comment=comment
    )
    db.add(history)
    db.commit()
    db.refresh(report)

    # Broadcast event
    try:
        import asyncio
        event = {
            "event": "task_resolved",
            "report": {
                "id": report.id,
                "status": report.status,
                "category": report.category,
                "severity": report.severity,
                "latitude": report.latitude,
                "longitude": report.longitude,
                "address": report.address
            }
        }
        asyncio.create_task(manager.broadcast(json.dumps(event)))
    except Exception:
        pass

    return {"message": "Task resolved successfully", "status": report.status}
