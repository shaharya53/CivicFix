import json
import pytest
from fastapi import status
from sqlalchemy import text
from app.models import User, Report, Evidence, ReportStatusHistory, AIPrediction, AICorrection, Department

@pytest.fixture
def admin_headers(client):
    client.post("/api/auth/register", json={
        "email": "admin_user@example.com",
        "password": "securepassword123",
        "role": "ADMIN"
    })
    login_resp = client.post("/api/auth/login", json={
        "email": "admin_user@example.com",
        "password": "securepassword123"
    })
    return login_resp.cookies

@pytest.fixture
def citizen_headers(client):
    client.post("/api/auth/register", json={
        "email": "citizen_user@example.com",
        "password": "securepassword123",
        "role": "CITIZEN"
    })
    login_resp = client.post("/api/auth/login", json={
        "email": "citizen_user@example.com",
        "password": "securepassword123"
    })
    return login_resp.cookies

@pytest.fixture
def worker_headers(client):
    client.post("/api/auth/register", json={
        "email": "worker_user@example.com",
        "password": "securepassword123",
        "role": "WORKER"
    })
    login_resp = client.post("/api/auth/login", json={
        "email": "worker_user@example.com",
        "password": "securepassword123"
    })
    return login_resp.cookies

@pytest.fixture(autouse=True)
def clean_db(db_session):
    # Ensure database is clean before every admin test
    db_session.execute(text("TRUNCATE TABLE ai_corrections, ai_predictions, report_status_history, evidence, reports, departments CASCADE"))
    db_session.commit()


# ==========================================
# 1. Authorization Controls Tests
# ==========================================

def test_admin_endpoints_authorization(client, admin_headers, citizen_headers, worker_headers):
    # 1. Citizen is denied (403)
    resp = client.get("/api/admin/reports/stats", cookies=citizen_headers)
    assert resp.status_code == 403

    # 2. Worker is denied (403)
    resp = client.get("/api/admin/reports/stats", cookies=worker_headers)
    assert resp.status_code == 403

    # 3. Admin is allowed (200)
    resp = client.get("/api/admin/reports/stats", cookies=admin_headers)
    assert resp.status_code == 200


# ==========================================
# 2. Reports Filtering and Pagination Tests
# ==========================================

def test_admin_reports_list_and_filters(client, admin_headers, db_session):
    # Seed reports
    admin_user = db_session.query(User).filter(User.email == "admin_user@example.com").first()
    
    r1 = Report(
        category="pothole", severity="HIGH", status="SUBMITTED",
        latitude=23.0, longitude=72.0, reporter_id=admin_user.id
    )
    r2 = Report(
        category="garbage", severity="LOW", status="IN_PROGRESS",
        latitude=23.1, longitude=72.1, reporter_id=admin_user.id
    )
    db_session.add_all([r1, r2])
    db_session.commit()

    # Test list reports pagination
    resp = client.get("/api/admin/reports?page=1&limit=1", cookies=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["reports"]) == 1

    # Test status filtering
    resp = client.get("/api/admin/reports?status=IN_PROGRESS", cookies=admin_headers)
    assert resp.status_code == 200
    assert len(resp.json()["reports"]) == 1
    assert resp.json()["reports"][0]["category"] == "garbage"


# ==========================================
# 3. Status Transitions Validation
# ==========================================

def test_admin_status_transitions(client, admin_headers, db_session):
    admin_user = db_session.query(User).filter(User.email == "admin_user@example.com").first()
    report = Report(
        category="pothole", severity="HIGH", status="SUBMITTED",
        latitude=23.0, longitude=72.0, reporter_id=admin_user.id
    )
    db_session.add(report)
    db_session.commit()

    # 1. Valid Transition: SUBMITTED -> UNDER_REVIEW
    resp = client.put(
        f"/api/admin/reports/{report.id}/status",
        json={"status": "UNDER_REVIEW", "comment": "Reviewing details"},
        cookies=admin_headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "UNDER_REVIEW"

    # Verify history
    history = db_session.query(ReportStatusHistory).filter(ReportStatusHistory.report_id == report.id).first()
    assert history is not None
    assert history.status == "UNDER_REVIEW"
    assert history.comment == "Reviewing details"

    # 2. Invalid Transition: UNDER_REVIEW -> RESOLVED (leaping state)
    resp = client.put(
        f"/api/admin/reports/{report.id}/status",
        json={"status": "RESOLVED"},
        cookies=admin_headers
    )
    assert resp.status_code == 400
    assert "Invalid transition" in resp.json()["detail"]


# ==========================================
# 4. Assignments Verification
# ==========================================

def test_admin_worker_assignment(client, admin_headers, db_session):
    admin_user = db_session.query(User).filter(User.email == "admin_user@example.com").first()
    worker_user = db_session.query(User).filter(User.email == "worker_user@example.com").first()
    
    report = Report(
        category="pothole", severity="HIGH", status="VERIFIED",
        latitude=23.0, longitude=72.0, reporter_id=admin_user.id
    )
    dept = Department(name="Roads Department", description="Road repairs")
    db_session.add_all([report, dept])
    db_session.commit()

    # 1. Invalid Worker Assignment (wrong role: CITIZEN is worker_id)
    citizen = db_session.query(User).filter(User.email == "citizen_user@example.com").first()
    resp = client.put(
        f"/api/admin/reports/{report.id}/assign",
        json={"department_id": dept.id, "assigned_worker_id": citizen.id},
        cookies=admin_headers
    )
    assert resp.status_code == 400
    assert "must have WORKER role" in resp.json()["detail"]

    # 2. Valid Assignment (valid worker user, valid department)
    resp = client.put(
        f"/api/admin/reports/{report.id}/assign",
        json={"department_id": dept.id, "assigned_worker_id": worker_user.id},
        cookies=admin_headers
    )
    assert resp.status_code == 200
    
    # Reload and check details
    db_session.refresh(report)
    assert report.assigned_worker_id == worker_user.id
    assert report.department_id == dept.id
    assert report.status == "ASSIGNED"


# ==========================================
# 5. AI prediction Override Audits
# ==========================================

def test_admin_ai_prediction_corrections(client, admin_headers, db_session):
    admin_user = db_session.query(User).filter(User.email == "admin_user@example.com").first()
    
    report = Report(
        category="garbage", severity="LOW", status="SUBMITTED",
        latitude=23.0, longitude=72.0, reporter_id=admin_user.id
    )
    db_session.add(report)
    db_session.flush()

    # Pre-insert prediction
    pred = AIPrediction(
        report_id=report.id,
        model_name="Test Model",
        model_version="1.0",
        prediction_type="INITIAL",
        output_json=json.dumps({"category": "garbage", "severity": "low"}),
        confidence=0.9
    )
    db_session.add(pred)
    db_session.commit()

    # Correct category to pothole and severity to HIGH
    resp = client.put(
        f"/api/admin/reports/{report.id}/correct",
        json={"category": "pothole", "severity": "HIGH", "reason": "AI missed road surface pothole"},
        cookies=admin_headers
    )
    assert resp.status_code == 200

    # Ensure Report category and severity updated
    db_session.refresh(report)
    assert report.category == "pothole"
    assert report.severity == "HIGH"

    # Ensure original prediction output was NOT modified
    db_session.refresh(pred)
    assert "garbage" in pred.output_json

    # Check AICorrection records created
    corrections = db_session.query(AICorrection).filter(AICorrection.prediction_id == pred.id).all()
    assert len(corrections) == 2
