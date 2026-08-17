import pytest
from fastapi import Depends
from app.auth import RoleChecker, get_current_user
from app.models import User
from main import app

# Add a temporary test endpoint to main app for RBAC testing
@app.get("/api/test-admin-only")
def admin_only_test_route(current_user: User = Depends(RoleChecker(["ADMIN", "SUPER_ADMIN"]))):
    return {"message": "Hello Admin"}

@app.get("/api/test-citizen-only")
def citizen_only_test_route(current_user: User = Depends(RoleChecker(["CITIZEN"]))):
    return {"message": "Hello Citizen"}


def test_register_user(client):
    # Register a new citizen
    response = client.post("/api/auth/register", json={
        "email": "test_citizen@example.com",
        "password": "securepassword123",
        "role": "CITIZEN"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test_citizen@example.com"
    assert data["role"] == "CITIZEN"
    assert "id" in data

    # Register an admin
    response = client.post("/api/auth/register", json={
        "email": "test_admin@example.com",
        "password": "securepassword123",
        "role": "ADMIN"
    })
    assert response.status_code == 201
    assert response.json()["role"] == "ADMIN"


def test_login_user(client):
    response = client.post("/api/auth/login", json={
        "email": "test_citizen@example.com",
        "password": "securepassword123"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test_citizen@example.com"
    
    # Confirm cookies are present in response headers
    cookies = response.cookies
    assert "access_token" in cookies
    assert "refresh_token" in cookies


def test_get_me_authenticated(client):
    # Log in first to set cookies in TestClient
    client.post("/api/auth/login", json={
        "email": "test_citizen@example.com",
        "password": "securepassword123"
    })
    
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "test_citizen@example.com"


def test_role_based_access_control(client):
    # 1. Log in as Citizen
    client.post("/api/auth/login", json={
        "email": "test_citizen@example.com",
        "password": "securepassword123"
    })
    
    # Access citizen route (Allowed)
    response = client.get("/api/test-citizen-only")
    assert response.status_code == 200
    
    # Access admin route (Denied - 403)
    response = client.get("/api/test-admin-only")
    assert response.status_code == 403

    # 2. Log in as Admin
    client.post("/api/auth/login", json={
        "email": "test_admin@example.com",
        "password": "securepassword123"
    })
    
    # Access admin route (Allowed)
    response = client.get("/api/test-admin-only")
    assert response.status_code == 200
    
    # Access citizen route (Denied - 403)
    response = client.get("/api/test-citizen-only")
    assert response.status_code == 403


def test_logout_user(client):
    client.post("/api/auth/login", json={
        "email": "test_citizen@example.com",
        "password": "securepassword123"
    })
    
    # Logout
    response = client.post("/api/auth/logout")
    assert response.status_code == 200
    
    # Get me (should return 200 with null body now)
    response = client.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json() is None
