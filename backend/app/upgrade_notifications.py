import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://civicfix_user:civicfix_secure_pass_2026@127.0.0.1:5432/civicfix_db"
)

def upgrade():
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        print("Upgrading notifications table columns...")
        
        # Check existing columns
        result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='notifications'"))
        columns = {row[0] for row in result.fetchall()}
        
        # Add columns if they do not exist
        if "type" not in columns:
            print("Adding 'type' column...")
            conn.execute(text("ALTER TABLE notifications ADD COLUMN type VARCHAR(50) DEFAULT 'SYSTEM' NOT NULL"))
            
        if "report_id" not in columns:
            print("Adding 'report_id' column...")
            conn.execute(text("ALTER TABLE notifications ADD COLUMN report_id INT REFERENCES reports(id) NULL"))
            
        if "task_id" not in columns:
            print("Adding 'task_id' column...")
            conn.execute(text("ALTER TABLE notifications ADD COLUMN task_id INT NULL"))
            
        if "link" not in columns:
            print("Adding 'link' column...")
            conn.execute(text("ALTER TABLE notifications ADD COLUMN link VARCHAR(255) NULL"))
            
        if "read_at" not in columns:
            print("Adding 'read_at' column...")
            conn.execute(text("ALTER TABLE notifications ADD COLUMN read_at TIMESTAMP NULL"))
            
        conn.commit()
        print("Notifications table upgraded successfully.")

if __name__ == "__main__":
    upgrade()
