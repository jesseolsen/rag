import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app


DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def async_engine():
    engine = create_async_engine(
        DATABASE_URL,
        echo=True,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def async_session(async_engine):
    async_session_local = pytest_asyncio.fixture(
        lambda: AsyncSession(async_engine, expire_on_commit=False)
    )

    async with AsyncSession(async_engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def client(async_session):
    async def override_get_db():
        yield async_session

    app.dependency_overrides[get_db] = override_get_db
    from fastapi.testclient import TestClient

    return TestClient(app)
