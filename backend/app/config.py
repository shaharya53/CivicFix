import os

class Settings:
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "civicfix_user")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "civicfix_secure_pass_2026")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "civicfix_db")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "postgres")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://civicfix_user:civicfix_secure_pass_2026@postgres:5432/civicfix_db")
    
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    
    JWT_SECRET: str = os.getenv("JWT_SECRET", "civicfix_super_secret_jwt_key_for_signing_tokens_2026_xyz")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
    
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "/app/uploads")
    AI_SERVICE_URL: str = os.getenv("AI_SERVICE_URL", "http://ai-service:8001")

settings = Settings()
