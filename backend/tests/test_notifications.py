import pytest
from unittest.mock import patch, MagicMock
from fastapi import status
from sqlalchemy import text
from app.models import User, Report, Evidence, ReportStatusHistory, AIPrediction, Notification

@pytest.fixture
def citizen_headers(client):
    client.post("/api/auth/register", json={
        "email": "noti_citizen@example.com",
        "password": "securepassword123",
        "role": "CITIZEN"
    })
    login_resp = client.post("/api/auth/login", json={
        "email": "noti_citizen@example.com",
        "password": "securepassword123"
    })
    return login_resp.cookies

@pytest.fixture
def worker_headers(client):
    client.post("/api/auth/register", json={
        "email": "noti_worker@example.com",
        "password": "securepassword123",
        "role": "WORKER"
    })
    login_resp = client.post("/api/auth/login", json={
        "email": "noti_worker@example.com",
        "password": "securepassword123"
    })
    return login_resp.cookies

@pytest.fixture
def admin_headers(client):
    client.post("/api/auth/register", json={
        "email": "noti_admin@example.com",
        "password": "securepassword123",
        "role": "ADMIN"
    })
    login_resp = client.post("/api/auth/login", json={
        "email": "noti_admin@example.com",
        "password": "securepassword123"
    })
    return login_resp.cookies

@pytest.fixture(autouse=True)
def clean_db(db_session):
    # Ensure database is clean before every notifications test
    db_session.execute(text("TRUNCATE TABLE ai_corrections, ai_predictions, report_status_history, evidence, reports, notifications, users CASCADE"))
    db_session.commit()

# Helper to create dummy image file
def create_dummy_image(name="test.jpg", content=b"fakeimagebytes"):
    return (name, content, "image/jpeg")


# ==========================================
# 1. API Endpoints, Filters and Privacy Controls
# ==========================================

def test_notification_list_unread_and_privacy(client, citizen_headers, worker_headers, db_session):
    # Register/fetch users
    cit_user = db_session.query(User).filter(User.email == "noti_citizen@example.com").first()
    wrk_user = db_session.query(User).filter(User.email == "noti_worker@example.com").first()

    # Create notifications
    n1 = Notification(user_id=cit_user.id, title="Alert 1", message="Read me", read=False)
    n2 = Notification(user_id=cit_user.id, title="Alert 2", message="Already read", read=True)
    n3 = Notification(user_id=wrk_user.id, title="Worker Alert", message="Task assigned", read=False)
    db_session.add_all([n1, n2, n3])
    db_session.commit()

    # 1. Citizen retrieves own list
    resp = client.get("/api/notifications?unread_only=false", cookies=citizen_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["notifications"]) == 2

    # 2. Citizen retrieves unread list only
    resp = client.get("/api/notifications?unread_only=true", cookies=citizen_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 1
    assert resp.json()["notifications"][0]["title"] == "Alert 1"

    # 3. Citizen cannot view worker's notifications
    resp = client.get("/api/notifications", cookies=citizen_headers)
    titles = {n["title"] for n in resp.json()["notifications"]}
    assert "Worker Alert" not in titles


def test_notification_unread_count_and_mark_read(client, citizen_headers, db_session):
    cit_user = db_session.query(User).filter(User.email == "noti_citizen@example.com").first()
    
    n1 = Notification(user_id=cit_user.id, title="A1", message="M1", read=False)
    n2 = Notification(user_id=cit_user.id, title="A2", message="M2", read=False)
    db_session.add_all([n1, n2])
    db_session.commit()

    # 1. Verify unread count is 2
    resp = client.get("/api/notifications/unread-count", cookies=citizen_headers)
    assert resp.status_code == 200
    assert resp.json()["unread_count"] == 2

    # 2. Mark n1 as read
    resp = client.put(f"/api/notifications/{n1.id}/read", cookies=citizen_headers)
    assert resp.status_code == 200

    # 3. Verify count became 1
    resp = client.get("/api/notifications/unread-count", cookies=citizen_headers)
    assert resp.json()["unread_count"] == 1

    # 4. Mark all as read
    resp = client.put("/api/notifications/read-all", cookies=citizen_headers)
    assert resp.status_code == 200

    # 5. Verify count became 0
    resp = client.get("/api/notifications/unread-count", cookies=citizen_headers)
    assert resp.json()["unread_count"] == 0


# ==========================================
# 2. Event Dispatch Flow Integrations
# ==========================================

def test_dispatch_on_report_submission(client, citizen_headers, admin_headers, db_session):
    # Citizen submits report -> Admin should receive REPORT_CREATED notification
    form_data = {
        "category": "pothole",
        "severity": "HIGH",
        "latitude": 23.0,
        "longitude": 72.0
    }
    file_data = {"image": create_dummy_image()}

    # Call submit report
    resp = client.post("/api/reports/create", data=form_data, files=file_data, cookies=citizen_headers)
    assert resp.status_code == 201

    # Verify admin received notification
    admin_user = db_session.query(User).filter(User.email == "noti_admin@example.com").first()
    notifications = db_session.query(Notification).filter(Notification.user_id == admin_user.id).all()
    
    assert len(notifications) >= 1
    assert "New Report Submitted" in [n.title for n in notifications]


def test_dispatch_on_assignment_and_status(client, admin_headers, worker_headers, citizen_headers, db_session):
    # Setup report
    cit_user = db_session.query(User).filter(User.email == "noti_citizen@example.com").first()
    wrk_user = db_session.query(User).filter(User.email == "noti_worker@example.com").first()
    adm_user = db_session.query(User).filter(User.email == "noti_admin@example.com").first()
    
    report = Report(
        category="pothole", severity="HIGH", status="VERIFIED",
        latitude=23.0, longitude=72.0, reporter_id=cit_user.id
    )
    db_session.add(report)
    db_session.commit()

    # 1. Admin assigns report to worker -> Worker should get REPORT_ASSIGNED notification
    resp = client.put(
        f"/api/admin/reports/{report.id}/assign",
        json={"assigned_worker_id": wrk_user.id},
        cookies=admin_headers
    )
    assert resp.status_code == 200

    worker_notis = db_session.query(Notification).filter(Notification.user_id == wrk_user.id).all()
    assert len(worker_notis) >= 1
    assert "New Assignment" in [n.title for n in worker_notis]

    # 2. Worker starts work (status = IN_PROGRESS) -> Citizen gets TASK_STARTED notification
    resp = client.put(f"/api/worker/tasks/{report.id}/start", cookies=worker_headers)
    assert resp.status_code == 200

    citizen_notis = db_session.query(Notification).filter(Notification.user_id == cit_user.id).all()
    assert len(citizen_notis) >= 1
    assert "Work Progress Started" in [n.title for n in citizen_notis]


# ==========================================
# 3. Operations Resiliency (Decoupling)
# ==========================================

def test_notification_failure_resiliency(client, citizen_headers, db_session):
    # Mock notify_admins service to raise exception
    # Creating report should still succeed and commit to DB even if notifications crash
    with patch("app.services.notifications.notify_admins", side_effect=Exception("Connection drop")):
        form_data = {
            "category": "pothole",
            "severity": "HIGH",
            "latitude": 23.0,
            "longitude": 72.0
        }
        file_data = {"image": create_dummy_image()}

        resp = client.post("/api/reports/create", data=form_data, files=file_data, cookies=citizen_headers)
        
        # Report creation must succeed (returns 201) despite notification failure
        assert resp.status_code == 201
        
        # Verify report exists in DB
        report_exists = db_session.query(Report).filter(Report.category == "pothole").first()
        assert report_exists is not None


def test_notification_schema_properties(client, citizen_headers, db_session):
    cit_user = db_session.query(User).filter(User.email == "noti_citizen@example.com").first()
    
    noti = Notification(
        user_id=cit_user.id,
        type="REPORT_ASSIGNED",
        title="New Task Assigned",
        message="A new task has been assigned to you.",
        report_id=None,
        task_id=456,
        link="/worker/dashboard?taskId=456",
        read=False
    )
    db_session.add(noti)
    db_session.commit()
    db_session.refresh(noti)
    
    # Query API
    resp = client.get("/api/notifications", cookies=citizen_headers)
    assert resp.status_code == 200
    data = resp.json()["notifications"][0]
    
    assert data["type"] == "REPORT_ASSIGNED"
    assert data["link"] == "/worker/dashboard?taskId=456"
    assert data["task_id"] == 456
    assert data["is_read"] is False
    
    # Mark read and check read_at is updated
    read_resp = client.put(f"/api/notifications/{noti.id}/read", cookies=citizen_headers)
    assert read_resp.status_code == 200
    
    db_session.refresh(noti)
    assert noti.read is True
    assert noti.read_at is not None
