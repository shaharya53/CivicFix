from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional, List

# Authentication & User Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: Optional[str] = "CITIZEN" # CITIZEN, WORKER, ADMIN, SUPER_ADMIN

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    email: EmailStr
    role: str
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class MessageResponse(BaseModel):
    detail: str

# Department Schemas
class DepartmentCreate(BaseModel):
    name: str = Field(..., min_length=2)
    description: Optional[str] = None

class DepartmentOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

# Evidence Schemas
class EvidenceOut(BaseModel):
    id: int
    file_path: str
    type: str # BEFORE, AFTER
    created_at: datetime

    class Config:
        from_attributes = True

# Report Status History Schemas
class ReportStatusHistoryOut(BaseModel):
    id: int
    status: str
    comment: Optional[str]
    created_at: datetime
    changed_by_id: int

    class Config:
        from_attributes = True

# AI Prediction Schemas
class AIPredictionOut(BaseModel):
    id: int
    model_name: str
    model_version: str
    prediction_type: str
    confidence: float
    output_json: str
    created_at: datetime

    class Config:
        from_attributes = True

# Feedback Schemas
class FeedbackCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None

class FeedbackOut(BaseModel):
    id: int
    rating: int
    comment: Optional[str]
    submitted_by_id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Report Schemas
class ReportCreate(BaseModel):
    category: str
    severity: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    address: Optional[str] = None

class ReportOut(BaseModel):
    id: int
    category: str
    severity: str
    status: str
    description: Optional[str]
    latitude: float
    longitude: float
    address: Optional[str]
    reporter_id: int
    assigned_worker_id: Optional[int]
    department_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    evidence: List[EvidenceOut] = []
    history: List[ReportStatusHistoryOut] = []
    ai_predictions: List[AIPredictionOut] = []
    feedback: List[FeedbackOut] = []

    class Config:
        from_attributes = True
