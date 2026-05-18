#!/usr/bin/env python3
"""Initialize database tables for SQLite"""
import asyncio
from app.db import engine, Base
from app.models.database import Resume, ResumeSectionChunk


async def init_db():
    """Create all tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Database tables created successfully!")


if __name__ == "__main__":
    asyncio.run(init_db())
