import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.pool import StaticPool
from sqlalchemy import Column, String, create_engine
from sqlalchemy.orm import declarative_base

from app.db import get_db
from app.main import app


DATABASE_URL = "sqlite:///:memory:"

# Create a simple in-memory database for testing
# (avoids pgvector issues with SQLite)
Base = declarative_base()


@pytest.fixture
def client():
    """Provide a test client with mocked database."""
    from fastapi.testclient import TestClient

    # Override the database dependency to do nothing during tests
    # The endpoints that need a DB will fail gracefully
    async def mock_get_db():
        yield None

    app.dependency_overrides[get_db] = mock_get_db

    client = TestClient(app)
    yield client

    app.dependency_overrides.clear()
