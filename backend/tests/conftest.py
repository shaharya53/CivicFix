import os

# Override environment variables BEFORE importing main app settings
local_db_url = "postgresql://civicfix_user:civicfix_secure_pass_2026@127.0.0.1:5432/civicfix_db"
os.environ["DATABASE_URL"] = local_db_url
os.environ["POSTGRES_HOST"] = "127.0.0.1"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from main import app
from app.database import Base, get_db
from app.config import settings
from app.models import User

# Connect to local PostgreSQL
engine = create_engine(local_db_url)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session", autouse=True)
def init_test_db():
    # Only create the users table to avoid PostGIS/pgvector missing extensions on other tables
    User.__table__.create(bind=engine, checkfirst=True)
    
    # Delete all persistent records in dependency order using TRUNCATE CASCADE
    db = TestingSessionLocal()
    try:
        db.execute(text("TRUNCATE TABLE ai_corrections, ai_predictions, report_status_history, evidence, reports, users CASCADE"))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
    yield

@pytest.fixture(scope="function")
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c
