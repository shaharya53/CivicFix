import io
import json
import pytest
from fastapi import status
from sqlalchemy import text
from app.models import User, Report, Evidence, ReportStatusHistory, AIPrediction

@pytest.fixture
def worker_a_headers(client):
    client.post("/api/auth/register", json={
        "email": "worker_a@example.com",
        "password": "securepassword123",
        "role": "WORKER"
    })
    login_resp = client.post("/api/auth/login", json={
        "email": "worker_a@example.com",
        "password": "securepassword123"
    })
    return login_resp.cookies

@pytest.fixture
def worker_b_headers(client):
    client.post("/api/auth/register", json={
        "email": "worker_b@example.com",
        "password": "securepassword123",
        "role": "WORKER"
    })
    login_resp = client.post("/api/auth/login", json={
        "email": "worker_b@example.com",
        "password": "securepassword123"
    })
    return login_resp.cookies

@pytest.fixture
def citizen_headers(client):
    client.post("/api/auth/register", json={
        "email": "citizen_worker@example.com",
        "password": "securepassword123",
        "role": "CITIZEN"
    })
    login_resp = client.post("/api/auth/login", json={
        "email": "citizen_worker@example.com",
        "password": "securepassword123"
    })
    return login_resp.cookies

@pytest.fixture
def admin_headers(client):
    client.post("/api/auth/register", json={
        "email": "admin_worker@example.com",
        "password": "securepassword123",
        "role": "ADMIN"
    })
    login_resp = client.post("/api/auth/login", json={
        "email": "admin_worker@example.com",
        "password": "securepassword123"
    })
    return login_resp.cookies

@pytest.fixture(autouse=True)
def clean_db(db_session):
    # Ensure database is clean before every worker test
    db_session.execute(text("TRUNCATE TABLE ai_corrections, ai_predictions, report_status_history, evidence, reports, departments CASCADE"))
    db_session.commit()

# Helper to create a dummy image file
def create_dummy_image(name="resolve.jpg", content=b"resolveimagebytes"):
    return (name, content, "image/jpeg")


# ==========================================
# 1. Worker Authorization Controls
# ==========================================

def test_worker_endpoints_rbac(client, worker_a_headers, citizen_headers, admin_headers):
    # 1. Citizen is denied (403)
    resp = client.get("/api/worker/tasks", cookies=citizen_headers)
    assert resp.status_code == 403

    # 2. Admin is denied (403)
    resp = client.get("/api/worker/tasks", cookies=admin_headers)
    assert resp.status_code == 403

    # 3. Worker is allowed (200)
    resp = client.get("/api/worker/tasks", cookies=worker_a_headers)
    assert resp.status_code == 200


# ==========================================
# 2. Task Visibility Controls
# ==========================================

def test_worker_task_visibility_isolation(client, worker_a_headers, worker_b_headers, db_session):
    user_a = db_session.query(User).filter(User.email == "worker_a@example.com").first()
    user_b = db_session.query(User).filter(User.email == "worker_b@example.com").first()

    # Seed task assigned to Worker A
    r_a = Report(
        category="pothole", severity="HIGH", status="ASSIGNED",
        latitude=23.0, longitude=72.0, assigned_worker_id=user_a.id, reporter_id=user_a.id
    )
    # Seed task assigned to Worker B
    r_b = Report(
        category="garbage", severity="LOW", status="ASSIGNED",
        latitude=23.1, longitude=72.1, assigned_worker_id=user_b.id, reporter_id=user_b.id
    )
    db_session.add_all([r_a, r_b])
    db_session.commit()

    # 1. Worker A sees only A's tasks
    resp = client.get("/api/worker/tasks", cookies=worker_a_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == r_a.id

    # 2. Worker A trying to query Worker B's details is blocked (403)
    resp = client.get(f"/api/worker/tasks/{r_b.id}", cookies=worker_a_headers)
    assert resp.status_code == 403


# ==========================================
# 3. Worker Task Status Toggles
# ==========================================

def test_worker_start_progress(client, worker_a_headers, db_session):
    user_a = db_session.query(User).filter(User.email == "worker_a@example.com").first()
    report = Report(
        category="pothole", severity="HIGH", status="ASSIGNED",
        latitude=23.0, longitude=72.0, assigned_worker_id=user_a.id, reporter_id=user_a.id
    )
    db_session.add(report)
    db_session.commit()

    # Start progress
    resp = client.put(f"/api/worker/tasks/{report.id}/start", cookies=worker_a_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "IN_PROGRESS"

    # Verify history
    hist = db_session.query(ReportStatusHistory).filter(ReportStatusHistory.report_id == report.id).first()
    assert hist is not None
    assert hist.status == "IN_PROGRESS"


# ==========================================
# 4. Mandatory Closure Evidence
# ==========================================

def test_worker_resolve_validation(client, worker_a_headers, db_session):
    user_a = db_session.query(User).filter(User.email == "worker_a@example.com").first()
    report = Report(
        category="pothole", severity="HIGH", status="IN_PROGRESS",
        latitude=23.0, longitude=72.0, assigned_worker_id=user_a.id, reporter_id=user_a.id
    )
    db_session.add(report)
    db_session.commit()

    # 1. Try to resolve without image (fails 422 or 400 validation)
    resp = client.post(
        f"/api/worker/tasks/{report.id}/resolve",
        data={"comment": "Pothole filled with gravel"},
        cookies=worker_a_headers
    )
    assert resp.status_code == 422 # Missing form file

    # 2. Try to resolve with empty comment (fails 400 or 422)
    file_data = {"image": create_dummy_image()}
    resp = client.post(
        f"/api/worker/tasks/{report.id}/resolve",
        data={"comment": ""},
        files=file_data,
        cookies=worker_a_headers
    )
    assert resp.status_code in {400, 422}

    # 3. Successful resolution (with image and notes)
    file_data = {"image": create_dummy_image()}
    resp = client.post(
        f"/api/worker/tasks/{report.id}/resolve",
        data={"comment": "Pothole filled with hot asphalt and compacted."},
        files=file_data,
        cookies=worker_a_headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "RESOLVED"

    # Check evidence record
    evidence = db_session.query(Evidence).filter(Evidence.report_id == report.id, Evidence.type == "AFTER").first()
    assert evidence is not None
    assert "/uploads/" in evidence.file_path
