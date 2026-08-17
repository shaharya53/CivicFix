import pytest
from sqlalchemy import text
from app.models import User

def test_database_connection(db_session):
    # Verify we can execute a simple SQL query
    result = db_session.execute(text("SELECT 1")).scalar()
    assert result == 1

def test_user_table_operations(db_session):
    # Test query on the User table model
    count = db_session.query(User).count()
    assert isinstance(count, int)
