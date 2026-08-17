from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def init_db():
    # Attempt to enable extensions but do not crash if not supported/installed locally
    with engine.connect() as conn:
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
            conn.commit()
        except Exception as e:
            print(f"Database Warning: Could not enable 'postgis' extension. Details: {str(e)}")
            
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            conn.commit()
        except Exception as e:
            print(f"Database Warning: Could not enable 'vector' extension. Details: {str(e)}")
    
    # Import models to register them on Base
    from app import models
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Database Warning: Error during metadata table creation. Details: {str(e)}")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
