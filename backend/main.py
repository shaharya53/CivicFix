from fastapi import FastAPI, Depends, WebSocket, WebSocketDisconnect, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
import redis
import httpx
from jose import jwt, JWTError

from app.config import settings
from app.database import init_db, get_db
from fastapi.staticfiles import StaticFiles
from app.routers import auth, reports
from app.websocket import manager

app = FastAPI(title="CivicFix Core Backend API", version="1.0.0")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production configuration
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "name": "CivicFix Core Backend API",
        "version": "1.0.0",
        "status": "active",
        "documentation": "/docs"
    }

@app.on_event("startup")
def startup_event():
    init_db()

# Register API Routers
app.include_router(auth.router, prefix="/api")
app.include_router(reports.router, prefix="/api")

# Serve uploaded static files
import os
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    """
    Consolidated Health check endpoint verifying backend connectivity to
    PostgreSQL, PostGIS, pgvector extension, Redis, and the AI Service.
    """
    db_status = "healthy"
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"
        
    redis_status = "healthy"
    try:
        r = redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        r.ping()
    except Exception as e:
        redis_status = f"unhealthy: {str(e)}"
        
    ai_status = "healthy"
    try:
        resp = httpx.get(f"{settings.AI_SERVICE_URL}/health", timeout=2)
        if resp.status_code != 200:
            ai_status = f"unhealthy: status code {resp.status_code}"
    except Exception as e:
        ai_status = f"unhealthy: {str(e)}"
        
    postgis_version = "not available"
    pgvector_version = "not available"
    if db_status == "healthy":
        try:
            postgis_version = db.execute(text("SELECT PostGIS_Full_Version()")).scalar()
        except Exception:
            pass
        try:
            pgvector_version = db.execute(text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")).scalar()
        except Exception:
            pass

    overall_status = "healthy"
    if "unhealthy" in db_status or "unhealthy" in redis_status or "unhealthy" in ai_status:
        overall_status = "degraded"

    return {
        "status": overall_status,
        "database": db_status,
        "postgis": postgis_version,
        "pgvector": pgvector_version,
        "redis": redis_status,
        "ai_service": ai_status
    }

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(None)):
    """
    WebSocket endpoint. Expects authentication token via query parameter or cookies.
    """
    if not token:
        token = websocket.cookies.get("access_token")
        
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = int(payload.get("sub"))
        role = payload.get("role", "CITIZEN")
    except (JWTError, ValueError):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket, user_id, role)
    try:
        while True:
            # Hold connection open and reply to ping signals
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id, role)
