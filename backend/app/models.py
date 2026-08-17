import os
import datetime
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Boolean, create_engine, text
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from geoalchemy2 import Geometry
from app.database import Base

# Conditionally check if PostGIS is available on startup
db_url = os.environ.get("DATABASE_URL", "postgresql://civicfix_user:civicfix_secure_pass_2026@127.0.0.1:5432/civicfix_db")
has_postgis = False
try:
    engine = create_engine(db_url)
    with engine.connect() as conn:
        res = conn.execute(text("SELECT 1 FROM pg_type WHERE typname = 'geometry'")).scalar()
        if res == 1:
            has_postgis = True
except Exception:
    pass

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default="CITIZEN", nullable=False) # CITIZEN, WORKER, ADMIN, SUPER_ADMIN
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    reports_submitted = relationship("Report", foreign_keys="Report.reporter_id", back_populates="reporter")
    reports_assigned = relationship("Report", foreign_keys="Report.assigned_worker_id", back_populates="assigned_worker")
    notifications = relationship("Notification", back_populates="user")

class Department(Base):
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    reports = relationship("Report", back_populates="department")

class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(100), nullable=False)
    severity = Column(String(50), nullable=False) # LOW, MEDIUM, HIGH, CRITICAL
    status = Column(String(50), default="SUBMITTED", nullable=False) # SUBMITTED, UNDER_REVIEW, VERIFIED, ASSIGNED, IN_PROGRESS, RESOLVED, CLOSED, REOPENED, REJECTED, DUPLICATE
    description = Column(Text, nullable=True)
    
    # Location
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    geom = Column(Geometry(geometry_type='POINT', srid=4326), nullable=False) if has_postgis else Column(String(100), nullable=True)
    address = Column(String(500), nullable=True)
    
    # FKs
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_worker_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    reporter = relationship("User", foreign_keys=[reporter_id], back_populates="reports_submitted")
    assigned_worker = relationship("User", foreign_keys=[assigned_worker_id], back_populates="reports_assigned")
    department = relationship("Department", back_populates="reports")
    evidence = relationship("Evidence", back_populates="report", cascade="all, delete-orphan")
    history = relationship("ReportStatusHistory", back_populates="report", cascade="all, delete-orphan")
    ai_predictions = relationship("AIPrediction", back_populates="report", cascade="all, delete-orphan")
    feedback = relationship("Feedback", back_populates="report", cascade="all, delete-orphan")

class Evidence(Base):
    __tablename__ = "evidence"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    file_path = Column(String(500), nullable=False)
    type = Column(String(50), nullable=False) # BEFORE, AFTER
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    report = relationship("Report", back_populates="evidence")

class ReportStatusHistory(Base):
    __tablename__ = "report_status_history"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    status = Column(String(50), nullable=False)
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    report = relationship("Report", back_populates="history")

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="notifications")

class Feedback(Base):
    __tablename__ = "feedback"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=False)
    rating = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    submitted_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    report = relationship("Report", back_populates="feedback")

class AIPrediction(Base):
    __tablename__ = "ai_predictions"
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id"), nullable=True)
    analysis_id = Column(String(100), unique=True, index=True, nullable=True)
    model_name = Column(String(100), nullable=False)
    model_version = Column(String(50), nullable=False)
    prediction_type = Column(String(100), nullable=False) # CATEGORY, SEVERITY, DUPLICATE_CHECK, RESOLUTION_VERIFY
    input_reference = Column(String(255), nullable=True) # Image URL or text description
    output_json = Column(Text, nullable=False) # Detailed scores
    confidence = Column(Float, nullable=False)
    embedding = Column(Vector(384), nullable=True) # pgvector text description embedding
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    report = relationship("Report", back_populates="ai_predictions")
    corrections = relationship("AICorrection", back_populates="prediction", cascade="all, delete-orphan")

class AICorrection(Base):
    __tablename__ = "ai_corrections"
    id = Column(Integer, primary_key=True, index=True)
    prediction_id = Column(Integer, ForeignKey("ai_predictions.id"), nullable=False)
    corrected_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    original_value = Column(String(255), nullable=False)
    corrected_value = Column(String(255), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    prediction = relationship("AIPrediction", back_populates="corrections")

class ModelVersion(Base):
    __tablename__ = "model_versions"
    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(100), nullable=False)
    version = Column(String(50), nullable=False)
    dataset_version = Column(String(50), nullable=False)
    metrics_json = Column(Text, nullable=True)
    status = Column(String(50), default="INACTIVE") # ACTIVE, INACTIVE, DEPRECATED
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

class DatasetVersion(Base):
    __tablename__ = "dataset_versions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    version = Column(String(50), nullable=False)
    source_summary = Column(Text, nullable=True)
    label_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
