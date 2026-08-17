import io
import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi import status
from sqlalchemy import text
from app.services import ai_client
from app.models import Report, Evidence, AIPrediction, AICorrection, User, ReportStatusHistory

# Helper to create a dummy image file
def create_dummy_image(name="test.jpg", content=b"fakeimagebytes"):
    return (name, content, "image/jpeg")

@pytest.fixture(scope="module", autouse=True)
def setup_test_users(client):
    # Ensure test users exist at module scope
    client.post("/api/auth/register", json={
        "email": "report_citizen@example.com",
        "password": "securepassword123",
        "role": "CITIZEN"
    })
    client.post("/api/auth/register", json={
        "email": "other_citizen@example.com",
        "password": "securepassword123",
        "role": "CITIZEN"
    })
    yield

@pytest.fixture
def auth_headers(client):
    login_resp = client.post("/api/auth/login", json={
        "email": "report_citizen@example.com",
        "password": "securepassword123"
    })
    return login_resp.cookies

@pytest.fixture
def other_user_headers(client):
    login_resp = client.post("/api/auth/login", json={
        "email": "other_citizen@example.com",
        "password": "securepassword123"
    })
    return login_resp.cookies

@pytest.fixture(autouse=True)
def clean_db(db_session):
    # Wipe reports and predictions data tables before every test function runs
    db_session.execute(text("TRUNCATE TABLE ai_corrections, ai_predictions, report_status_history, evidence, reports CASCADE"))
    db_session.commit()


# ==========================================
# 1. AI Analysis Tests
# ==========================================

def test_analyze_image_success(client, auth_headers):
    mock_response = {
        "category": "pothole",
        "category_confidence": 0.96,
        "severity": "high",
        "severity_confidence": 0.91,
        "recommended_department": "road_maintenance",
        "model_versions": {
            "vision": "civic-vision-v1",
            "severity": "civic-severity-v1"
        }
    }
    
    with patch("app.services.ai_client.analyze_image", return_value=mock_response) as mock_analyze:
        file_data = {"image": create_dummy_image()}
        response = client.post("/api/reports/analyze", files=file_data, cookies=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "pothole"
        assert data["category_confidence"] == 0.96
        assert data["severity"] == "high"
        assert data["recommended_department"] == "road_maintenance"
        assert "analysis_id" in data
        mock_analyze.assert_called_once()

def test_analyze_image_unauthorized_rejected(client):
    client.cookies.clear()
    file_data = {"image": create_dummy_image()}
    response = client.post("/api/reports/analyze", files=file_data)
    assert response.status_code == 401

def test_analyze_image_oversized_rejected(client, auth_headers):
    # Generate 6MB file bytes to exceed the 5MB size limit
    oversized_content = b"0" * (6 * 1024 * 1024)
    file_data = {"image": create_dummy_image(content=oversized_content)}
    
    response = client.post("/api/reports/analyze", files=file_data, cookies=auth_headers)
    assert response.status_code == 400
    assert "exceeds" in response.json()["detail"]

def test_analyze_image_invalid_mime_rejected(client, auth_headers):
    file_data = {"image": ("test.txt", b"sometext", "text/plain")}
    
    response = client.post("/api/reports/analyze", files=file_data, cookies=auth_headers)
    assert response.status_code == 400
    assert "Invalid file" in response.json()["detail"]

def test_analyze_image_ai_service_unavailable(client, auth_headers):
    with patch("app.services.ai_client.analyze_image", side_effect=ai_client.AIServiceUnavailableError("Offline")):
        file_data = {"image": create_dummy_image()}
        response = client.post("/api/reports/analyze", files=file_data, cookies=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["ai_unavailable"] is True
        assert data["category"] == "other"
        assert "analysis_id" in data


# ==========================================
# 2. Report Creation Tests
# ==========================================

def test_create_report_success(client, auth_headers, db_session):
    form_data = {
        "category": "pothole",
        "severity": "HIGH",
        "description": "Deep pothole near junction",
        "latitude": 23.0225,
        "longitude": 72.5714,
        "address": "Ahmedabad center"
    }
    file_data = {"image": create_dummy_image()}
    
    response = client.post(
        "/api/reports/create",
        data=form_data,
        files=file_data,
        cookies=auth_headers
    )
    
    assert response.status_code == 201
    data = response.json()
    assert data["category"] == "pothole"
    assert data["severity"] == "HIGH"
    assert data["status"] == "SUBMITTED"
    
    report = db_session.query(Report).filter(Report.id == data["id"]).first()
    assert report is not None
    assert report.description == "Deep pothole near junction"
    
    evidence = db_session.query(Evidence).filter(Evidence.report_id == report.id).first()
    assert evidence is not None
    assert evidence.type == "BEFORE"

def test_create_report_invalid_coordinates(client, auth_headers):
    form_data = {
        "category": "pothole",
        "severity": "HIGH",
        "latitude": 95.0,
        "longitude": 72.5714
    }
    file_data = {"image": create_dummy_image()}
    response = client.post("/api/reports/create", data=form_data, files=file_data, cookies=auth_headers)
    assert response.status_code == 400

def test_create_report_invalid_severity(client, auth_headers):
    form_data = {
        "category": "pothole",
        "severity": "EXTREME",
        "latitude": 23.0225,
        "longitude": 72.5714
    }
    file_data = {"image": create_dummy_image()}
    response = client.post("/api/reports/create", data=form_data, files=file_data, cookies=auth_headers)
    assert response.status_code == 400


# ==========================================
# 3. AI Prediction Link and Corrections Tests
# ==========================================

def test_create_report_with_corrections(client, auth_headers, db_session):
    analysis_id = "test-analysis-123"
    prediction_json = {
        "category": "garbage",
        "severity": "low",
        "model_versions": {"vision": "v1", "severity": "v1"}
    }
    
    pred_record = AIPrediction(
        analysis_id=analysis_id,
        model_name="CivicFix Vision + Severity Service",
        model_version="v1",
        prediction_type="INITIAL_ANALYSIS",
        input_reference="test.jpg",
        output_json=json.dumps(prediction_json),
        confidence=0.85
    )
    db_session.add(pred_record)
    db_session.commit()
    
    form_data = {
        "category": "pothole",
        "severity": "HIGH",
        "latitude": 23.0225,
        "longitude": 72.5714,
        "analysis_id": analysis_id
    }
    file_data = {"image": create_dummy_image()}
    
    response = client.post("/api/reports/create", data=form_data, files=file_data, cookies=auth_headers)
    assert response.status_code == 201
    
    db_session.refresh(pred_record)
    assert pred_record.report_id is not None
    
    corrections = db_session.query(AICorrection).filter(AICorrection.prediction_id == pred_record.id).all()
    assert len(corrections) == 2
    
    original_values = {c.original_value for c in corrections}
    corrected_values = {c.corrected_value for c in corrections}
    assert "garbage" in original_values
    assert "pothole" in corrected_values
    assert "LOW" in original_values or "low" in original_values
    assert "HIGH" in corrected_values


# ==========================================
# 4. Duplicate Detection Tests
# ==========================================

def test_duplicate_detection(client, auth_headers, db_session):
    user = db_session.query(User).filter(User.email == "report_citizen@example.com").first()
    
    active_report = Report(
        category="pothole",
        severity="HIGH",
        status="SUBMITTED",
        latitude=23.0225,
        longitude=72.5714,
        geom="POINT(72.5714 23.0225)",
        reporter_id=user.id
    )
    db_session.add(active_report)
    db_session.commit()
    
    response = client.get(
        "/api/reports/duplicates",
        params={"category": "pothole", "latitude": 23.0225, "longitude": 72.5714},
        cookies=auth_headers
    )
    
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["id"] == active_report.id

    response = client.get(
        "/api/reports/duplicates",
        params={"category": "pothole", "latitude": 19.0760, "longitude": 72.8777},
        cookies=auth_headers
    )
    assert response.status_code == 200
    assert len(response.json()) == 0


# ==========================================
# 5. Authorization & Data Isolation Tests
# ==========================================

def test_my_reports_isolation(client, auth_headers, other_user_headers, db_session):
    user1 = db_session.query(User).filter(User.email == "report_citizen@example.com").first()
    r1 = Report(
        category="pothole", severity="HIGH", status="SUBMITTED",
        latitude=23.0225, longitude=72.5714, geom="POINT(72.5714 23.0225)",
        reporter_id=user1.id
    )
    db_session.add(r1)
    
    user2 = db_session.query(User).filter(User.email == "other_citizen@example.com").first()
    r2 = Report(
        category="garbage", severity="MEDIUM", status="SUBMITTED",
        latitude=23.0200, longitude=72.5700, geom="POINT(72.5700 23.0200)",
        reporter_id=user2.id
    )
    db_session.add(r2)
    db_session.commit()
    
    response = client.get("/api/reports/my-reports", cookies=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == r1.id
    assert data[0]["category"] == "pothole"
    
    response = client.get("/api/reports/my-reports", cookies=other_user_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == r2.id
    assert data[0]["category"] == "garbage"
