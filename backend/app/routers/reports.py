import uuid
import json
import math
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app import schemas, auth
from app.models import User, Report, Evidence, ReportStatusHistory, AIPrediction, AICorrection
from app.services import storage, ai_client
from app.websocket import manager

router = APIRouter(prefix="/reports", tags=["Reports"])

# Configure radius from environment or default to 200m
DUPLICATE_RADIUS_METERS = 200.0

def check_postgis_active(db: Session) -> bool:
    """Helper to check if PostGIS is enabled on the database."""
    try:
        res = db.execute(text("SELECT 1 FROM pg_type WHERE typname = 'geometry'")).scalar()
        return res == 1
    except Exception:
        return False

def get_haversine_distance_sql(lat1: float, lon1: float, table_lat_col: str, table_lon_col: str) -> str:
    """
    Returns SQL fragment calculating the Haversine distance in meters
    between a point (lat1, lon1) and database columns.
    """
    # R = 6371000 meters
    return f"""
        (6371000 * acos(
            cos(radians({lat1})) * cos(radians({table_lat_col})) * 
            cos(radians({table_lon_col}) - radians({lon1})) + 
            sin(radians({lat1})) * sin(radians({table_lat_col}))
        ))
    """

def find_duplicates(db: Session, category: str, lat: float, lon: float, radius: float = DUPLICATE_RADIUS_METERS) -> List[Report]:
    """
    Finds active reports with the same category within the given radius (in meters).
    Supports PostGIS ST_Distance if active, or falls back to a Haversine SQL query.
    """
    # Active statuses that are not resolved or archived
    active_statuses = ["SUBMITTED", "UNDER_REVIEW", "VERIFIED", "ASSIGNED", "IN_PROGRESS", "REOPENED"]
    
    query = db.query(Report).filter(
        Report.category.ilike(category),
        Report.status.in_(active_statuses)
    )
    
    if check_postgis_active(db):
        # PostGIS query
        query = query.filter(
            text(f"ST_DWithin(geom, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :radius)")
        ).params(lon=lon, lat=lat, radius=radius)
    else:
        # Haversine fallback query
        haversine_expr = get_haversine_distance_sql(lat, lon, "latitude", "longitude")
        query = query.filter(text(f"{haversine_expr} <= :radius")).params(radius=radius)
        
    return query.all()

@router.post("/analyze")
async def analyze_report(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Accepts an uploaded image, routes to the AI service, packages results, 
    records an initial AIPrediction record for auditing, and returns predictions.
    """
    # 1. Validate file size and MIME type
    storage.validate_image_file(image)
    
    analysis_id = str(uuid.uuid4())
    
    try:
        image_bytes = await image.read()
        
        # 1. Call AI client service to get predictions
        ai_result = ai_client.analyze_image(image_bytes, image.filename or "upload.jpg")
        
        # 2. Persist AIPrediction record in DB (without report_id initially)
        model_versions_json = json.dumps(ai_result.get("model_versions", {}))
        
        db_prediction = AIPrediction(
            analysis_id=analysis_id,
            model_name="CivicFix Vision + Severity Service",
            model_version=ai_result["model_versions"].get("vision", "civic-vision-v1"),
            prediction_type="INITIAL_ANALYSIS",
            input_reference=image.filename or "upload.jpg",
            output_json=json.dumps(ai_result),
            confidence=ai_result.get("category_confidence", 0.0)
        )
        db.add(db_prediction)
        db.commit()
        
        # 3. Check duplicate reports nearby
        duplicates = find_duplicates(
            db, 
            category=ai_result["category"], 
            lat=0.0,  # Coordinates unknown at analysis stage, duplicate lookup will be rerun in create
            lon=0.0
        )
        
        return {
            "analysis_id": analysis_id,
            "category": ai_result["category"],
            "category_confidence": ai_result["category_confidence"],
            "severity": ai_result["severity"],
            "severity_confidence": ai_result["severity_confidence"],
            "recommended_department": ai_result["recommended_department"],
            "model_versions": ai_result["model_versions"],
            "possible_duplicates": [
                {"id": r.id, "category": r.category, "latitude": r.latitude, "longitude": r.longitude}
                for r in duplicates
            ]
        }
        
    except ai_client.AIServiceUnavailableError as e:
        # Controlled error response in case AI service is offline
        return {
            "ai_unavailable": True,
            "analysis_id": analysis_id,
            "category": "other",
            "category_confidence": 0.0,
            "severity": "medium",
            "severity_confidence": 0.0,
            "recommended_department": "general_maintenance",
            "model_versions": {"vision": "unknown", "severity": "unknown"},
            "possible_duplicates": []
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed: {str(e)}"
        )

@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_report(
    category: str = Form(...),
    severity: str = Form(...),
    description: Optional[str] = Form(None),
    latitude: float = Form(...),
    longitude: float = Form(...),
    address: Optional[str] = Form(None),
    analysis_id: Optional[str] = Form(None),
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Validates, saves the image, checks duplicates, creates the report, 
    records corrections if values differed from the AI prediction, and broadcasts live events.
    """
    # 1. Validation
    if not (-90.0 <= latitude <= 90.0):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Latitude must be between -90 and 90")
    if not (-180.0 <= longitude <= 180.0):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Longitude must be between -180 and 180")
        
    clean_category = category.lower().strip()
    clean_severity = severity.upper().strip()
    
    if clean_severity not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid severity level")

    # 2. Save image file
    file_path = storage.save_uploaded_file(image)

    # 3. Create Report record
    postgis_active = check_postgis_active(db)
    geom_val = f"SRID=4326;POINT({longitude} {latitude})" if postgis_active else f"POINT({longitude} {latitude})"
    
    report = Report(
        category=clean_category,
        severity=clean_severity,
        status="SUBMITTED",
        description=description,
        latitude=latitude,
        longitude=longitude,
        geom=geom_val,
        address=address,
        reporter_id=current_user.id
    )
    db.add(report)
    db.flush() # Secure report.id

    # 4. Create Evidence record
    evidence = Evidence(
        report_id=report.id,
        file_path=file_path,
        type="BEFORE",
        uploaded_by_id=current_user.id
    )
    db.add(evidence)

    # 5. Create Status History record
    history = ReportStatusHistory(
        report_id=report.id,
        status="SUBMITTED",
        changed_by_id=current_user.id,
        comment="Report submitted by citizen"
    )
    db.add(history)

    # 6. Audit AI prediction link & corrections
    if analysis_id:
        prediction = db.query(AIPrediction).filter(AIPrediction.analysis_id == analysis_id).first()
        if prediction:
            prediction.report_id = report.id
            db.add(prediction)
            
            # Extract original predictions from JSON
            try:
                original_data = json.loads(prediction.output_json)
                original_cat = original_data.get("category", "").lower().strip()
                original_sev = original_data.get("severity", "").upper().strip()
                
                # Check for category correction
                if original_cat and original_cat != clean_category:
                    cat_correction = AICorrection(
                        prediction_id=prediction.id,
                        corrected_by_id=current_user.id,
                        original_value=original_cat,
                        corrected_value=clean_category,
                        reason="Citizen category correction during reporting"
                    )
                    db.add(cat_correction)
                    
                # Check for severity correction
                if original_sev and original_sev != clean_severity:
                    sev_correction = AICorrection(
                        prediction_id=prediction.id,
                        corrected_by_id=current_user.id,
                        original_value=original_sev,
                        corrected_value=clean_severity,
                        reason="Citizen severity correction during reporting"
                    )
                    db.add(sev_correction)
            except Exception as e:
                logger.error(f"Error parsing AI prediction audit JSON: {str(e)}")

    db.commit()
    db.refresh(report)

    # 7. WebSocket Live Notification (Non-blocking)
    try:
        import asyncio
        event_payload = {
            "event": "report_created",
            "report": {
                "id": report.id,
                "category": report.category,
                "severity": report.severity,
                "status": report.status,
                "latitude": report.latitude,
                "longitude": report.longitude,
                "address": report.address
            }
        }
        # Run broadcast asynchronously
        asyncio.create_task(manager.broadcast(json.dumps(event_payload)))
    except Exception:
        pass

    return report

@router.get("/my-reports", response_model=List[schemas.ReportOut])
def get_my_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Returns the list of reports submitted by the logged-in citizen."""
    return db.query(Report).filter(Report.reporter_id == current_user.id).order_by(Report.created_at.desc()).all()

@router.get("/duplicates")
def get_duplicates(
    category: str,
    latitude: float,
    longitude: float,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Returns any active reports matching the target category within DUPLICATE_RADIUS_METERS."""
    duplicates = find_duplicates(db, category, latitude, longitude)
    return [
        {"id": r.id, "category": r.category, "latitude": r.latitude, "longitude": r.longitude, "status": r.status}
        for r in duplicates
    ]
