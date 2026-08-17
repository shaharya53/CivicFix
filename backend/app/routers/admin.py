import json
import logging
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, or_, desc, asc

from app.database import get_db
from app import schemas, auth
from app.models import User, Report, Evidence, ReportStatusHistory, AIPrediction, AICorrection, Department
from app.websocket import manager

router = APIRouter(prefix="/admin", tags=["Admin"])
logger = logging.getLogger(__name__)

# Configurable threshold for AI review queue
AI_CONFIDENCE_THRESHOLD = 0.80

# State transition validation sequence mapping
VALID_TRANSITIONS = {
    "SUBMITTED": {"UNDER_REVIEW", "REJECTED", "DUPLICATE", "CANCELLED"},
    "UNDER_REVIEW": {"VERIFIED", "REJECTED", "DUPLICATE", "CANCELLED"},
    "VERIFIED": {"ASSIGNED", "IN_PROGRESS", "REJECTED", "CANCELLED"},
    "ASSIGNED": {"IN_PROGRESS", "REJECTED", "CANCELLED"},
    "IN_PROGRESS": {"RESOLVED", "REOPENED"},
    "RESOLVED": {"CLOSED", "REOPENED"},
    "CLOSED": {"REOPENED"},
    "REOPENED": {"UNDER_REVIEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS"},
    "REJECTED": {"REOPENED"},
    "DUPLICATE": {"REOPENED"},
    "CANCELLED": {"REOPENED"},
}

def require_admin(current_user: User = Depends(auth.get_current_user)) -> User:
    """Enforces ADMIN or SUPER_ADMIN role checks on backend requests."""
    if current_user.role not in {"ADMIN", "SUPER_ADMIN"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Admin or Super Admin role permissions required."
        )
    return current_user

@router.get("/reports/stats")
def get_kpi_stats(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Calculates server-side aggregates and counters for dashboard widgets efficiently."""
    total_issues = db.query(Report).count()
    
    pending_statuses = ["SUBMITTED", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "REOPENED"]
    pending = db.query(Report).filter(Report.status.in_(pending_statuses)).count()
    
    in_progress = db.query(Report).filter(Report.status == "IN_PROGRESS").count()
    
    resolved_statuses = ["RESOLVED", "CLOSED"]
    resolved = db.query(Report).filter(Report.status.in_(resolved_statuses)).count()
    
    critical = db.query(Report).filter(Report.severity == "CRITICAL").count()
    
    # Reports in AI Review queue: missing predictions or prediction confidence below threshold
    ai_review = db.query(Report).outerjoin(
        AIPrediction, Report.id == AIPrediction.report_id
    ).filter(
        or_(
            AIPrediction.id.is_(None),
            AIPrediction.confidence < AI_CONFIDENCE_THRESHOLD
        )
    ).count()

    return {
        "total_issues": total_issues,
        "pending": pending,
        "in_progress": in_progress,
        "resolved": resolved,
        "critical": critical,
        "ai_review": ai_review
    }

@router.get("/reports")
def list_reports(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
    ai_review_only: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """
    Lists paginated and filtered reports with backend-driven sorting and searching.
    Keeps response payload lean for grid list rendering.
    """
    query = db.query(Report).outerjoin(AIPrediction, Report.id == AIPrediction.report_id)

    # Apply filters
    if status:
        query = query.filter(Report.status == status.upper().strip())
    if severity:
        query = query.filter(Report.severity == severity.upper().strip())
    if category:
        query = query.filter(Report.category == category.lower().strip())
    if department_id:
        query = query.filter(Report.department_id == department_id)
        
    if ai_review_only:
        query = query.filter(
            or_(
                AIPrediction.id.is_(None),
                AIPrediction.confidence < AI_CONFIDENCE_THRESHOLD
            )
        )

    if search:
        query = query.filter(
            or_(
                Report.description.ilike(f"%{search}%"),
                Report.address.ilike(f"%{search}%"),
                Report.category.ilike(f"%{search}%")
            )
        )

    # Sort ordering
    direction = desc if sort_dir.lower() == "desc" else asc
    if sort_by == "severity":
        query = query.order_by(direction(Report.severity))
    elif sort_by == "status":
        query = query.order_by(direction(Report.status))
    elif sort_by == "category":
        query = query.order_by(direction(Report.category))
    else:
        query = query.order_by(direction(Report.created_at))

    # Pagination bounds
    total_records = query.count()
    offset = (page - 1) * limit
    results = query.offset(offset).limit(limit).all()

    reports_list = []
    for r in results:
        # Load associated prediction confidence if it exists
        latest_pred = db.query(AIPrediction).filter(AIPrediction.report_id == r.id).first()
        reports_list.append({
            "id": r.id,
            "report_number": f"CF-2026-{str(r.id).zfill(6)}",
            "category": r.category,
            "severity": r.severity,
            "status": r.status,
            "latitude": r.latitude,
            "longitude": r.longitude,
            "address": r.address,
            "department_id": r.department_id,
            "assigned_worker_id": r.assigned_worker_id,
            "ai_confidence": latest_pred.confidence if latest_pred else None,
            "created_at": r.created_at.isoformat() if r.created_at else None
        })

    return {
        "total": total_records,
        "page": page,
        "limit": limit,
        "reports": reports_list
    }

@router.get("/reports/{id}")
def get_report_details(
    id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Retrieves full detail structure for the details drawer."""
    report = db.query(Report).filter(Report.id == id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    # Load predictions, corrections, history, evidence
    predictions = db.query(AIPrediction).filter(AIPrediction.report_id == id).all()
    evidence = db.query(Evidence).filter(Evidence.report_id == id).all()
    history = db.query(ReportStatusHistory).filter(ReportStatusHistory.report_id == id).order_by(ReportStatusHistory.created_at.desc()).all()

    # Get details of predictions along with any associated corrections
    predictions_payload = []
    for pred in predictions:
        corrections = db.query(AICorrection).filter(AICorrection.prediction_id == pred.id).all()
        predictions_payload.append({
            "id": pred.id,
            "analysis_id": pred.analysis_id,
            "model_name": pred.model_name,
            "model_version": pred.model_version,
            "prediction_type": pred.prediction_type,
            "confidence": pred.confidence,
            "output_json": json.loads(pred.output_json) if pred.output_json else {},
            "created_at": pred.created_at.isoformat() if pred.created_at else None,
            "corrections": [
                {
                    "id": c.id,
                    "corrected_by_id": c.corrected_by_id,
                    "original_value": c.original_value,
                    "corrected_value": c.corrected_value,
                    "reason": c.reason,
                    "created_at": c.created_at.isoformat() if c.created_at else None
                }
                for c in corrections
            ]
        })

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
        "assigned_worker_id": report.assigned_worker_id,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "evidence": [
            {"id": ev.id, "file_path": ev.file_path, "type": ev.type, "created_at": ev.created_at.isoformat() if ev.created_at else None}
            for ev in evidence
        ],
        "history": [
            {
                "id": hist.id,
                "status": hist.status,
                "changed_by_id": hist.changed_by_id,
                "comment": hist.comment,
                "created_at": hist.created_at.isoformat() if hist.created_at else None
            }
            for hist in history
        ],
        "ai_predictions": predictions_payload
    }

@router.put("/reports/{id}/status")
async def update_report_status(
    id: int,
    payload: schemas.StatusUpdate,  # Contains status (str) and optional comment (str)
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """
    Transition validation handler. Evaluates, logs updates, and broadcasts status changes.
    """
    report = db.query(Report).filter(Report.id == id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    current_status = report.status.upper().strip()
    next_status = payload.status.upper().strip()

    # Enforce strict workflow transitions
    allowed_transitions = VALID_TRANSITIONS.get(current_status, set())
    if next_status not in allowed_transitions and next_status != current_status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid transition from {current_status} to {next_status}"
        )

    # Perform updates
    report.status = next_status
    report.updated_at = datetime.utcnow()

    # Add history log
    history = ReportStatusHistory(
        report_id=report.id,
        status=next_status,
        changed_by_id=admin_user.id,
        comment=payload.comment or f"Status changed to {next_status} by admin."
    )
    db.add(history)
    db.commit()
    db.refresh(report)

    # Dispatch Real-time notification to citizen reporter (Database-first, non-blocking)
    try:
        import asyncio
        from app.services import notifications
        
        noti_type = "REPORT_STATUS_CHANGED"
        if next_status == "REOPENED":
            noti_type = "REPORT_REOPENED"
            
        asyncio.create_task(notifications.notify_user(
            db=db,
            user_id=report.reporter_id,
            noti_type=noti_type,
            title="Report Status Updated",
            message=f"Your report CF-2026-{str(report.id).zfill(6)} is now in state {next_status}.",
            report_id=report.id,
            link="/dashboard"
        ))
    except Exception as e:
        logger.error(f"Failed to trigger status change notification: {str(e)}")

    # Broadcast event
    try:
        import asyncio
        event = {
            "event": "report_status_changed",
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

    return {"message": "Status updated successfully", "status": report.status}

@router.put("/reports/{id}/assign")
async def assign_report(
    id: int,
    payload: schemas.AssignmentUpdate,  # Contains department_id (Optional[int]) and assigned_worker_id (Optional[int])
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """
    Performs backend-side assignment validation for department and worker role/membership constraints.
    """
    report = db.query(Report).filter(Report.id == id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    dept_id = payload.department_id
    worker_id = payload.assigned_worker_id

    # 1. Validate department
    if dept_id is not None:
        dept = db.query(Department).filter(Department.id == dept_id).first()
        if not dept:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department does not exist")
        report.department_id = dept_id

    # 2. Validate worker
    if worker_id is not None:
        worker = db.query(User).filter(User.id == worker_id).first()
        if not worker:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Worker does not exist")
        if worker.role.upper() != "WORKER":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned user must have WORKER role")
        report.assigned_worker_id = worker_id

    # Transition report to ASSIGNED status if worker/dept is added and state supports it
    next_status = "ASSIGNED"
    if next_status in VALID_TRANSITIONS.get(report.status, set()):
        report.status = next_status
        history = ReportStatusHistory(
            report_id=report.id,
            status=next_status,
            changed_by_id=admin_user.id,
            comment=f"Report assigned by admin to worker {worker_id if worker_id else 'none'}."
        )
        db.add(history)

    report.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(report)

    # Dispatch Real-time notification to the assigned worker (Database-first, non-blocking)
    if report.assigned_worker_id:
        try:
            import asyncio
            from app.services import notifications
            
            asyncio.create_task(notifications.notify_user(
                db=db,
                user_id=report.assigned_worker_id,
                noti_type="REPORT_ASSIGNED",
                title="New Assignment",
                message=f"Task CF-2026-{str(report.id).zfill(6)} has been assigned to you.",
                report_id=report.id,
                link=f"/worker/tasks/{report.id}"
            ))
        except Exception as e:
            logger.error(f"Failed to trigger worker assignment notification: {str(e)}")

    # Broadcast event
    try:
        import asyncio
        event = {
            "event": "report_assigned",
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

    return {"message": "Assignment updated successfully", "status": report.status}

@router.put("/reports/{id}/correct")
async def correct_prediction(
    id: int,
    payload: schemas.CorrectionUpdate,  # Contains category (str), severity (str) and reason (Optional[str])
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """
    Logs overrides of AI category/severity, inserting AICorrection tracking audits,
    without overwriting the original AIPrediction details.
    """
    report = db.query(Report).filter(Report.id == id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    new_cat = payload.category.lower().strip()
    new_sev = payload.severity.upper().strip()

    if new_sev not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid severity level")

    # Fetch latest AIPrediction
    prediction = db.query(AIPrediction).filter(AIPrediction.report_id == id).first()
    if prediction:
        # Extract predictions from original output JSON
        try:
            pred_data = json.loads(prediction.output_json)
            original_cat = pred_data.get("category", "").lower().strip()
            original_sev = pred_data.get("severity", "").upper().strip()

            # Record Category override
            if original_cat and original_cat != new_cat:
                corr_cat = AICorrection(
                    prediction_id=prediction.id,
                    corrected_by_id=admin_user.id,
                    original_value=original_cat,
                    corrected_value=new_cat,
                    reason=payload.reason or "Admin categorization correction"
                )
                db.add(corr_cat)

            # Record Severity override
            if original_sev and original_sev != new_sev:
                corr_sev = AICorrection(
                    prediction_id=prediction.id,
                    corrected_by_id=admin_user.id,
                    original_value=original_sev,
                    corrected_value=new_sev,
                    reason=payload.reason or "Admin severity correction"
                )
                db.add(corr_sev)
        except Exception as e:
            logger.error(f"Error parsing AIPrediction JSON: {str(e)}")

    # Update report fields to human decision
    report.category = new_cat
    report.severity = new_sev
    report.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(report)

    # Broadcast event
    try:
        import asyncio
        event = {
            "event": "report_corrected",
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

    return {"message": "AI prediction correction logged successfully"}

@router.get("/workers")
def list_workers(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Lists registered worker users for selector boxes."""
    workers = db.query(User).filter(User.role == "WORKER").all()
    return [{"id": w.id, "email": w.email} for w in workers]

@router.get("/departments")
def list_departments(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Lists all departments."""
    departments = db.query(Department).all()
    return [{"id": d.id, "name": d.name, "description": d.description} for d in departments]
