#!/usr/bin/env python3
"""
Clear all saved field answers from the database.

Use this to clean up unwanted data that was captured from non-job sites.
"""

import asyncio
import sys
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.db import get_db, engine
from app.models.database import FormFieldAnswer


async def list_answers():
    """List all saved answers."""
    async with AsyncSession(engine) as db:
        result = await db.execute(select(FormFieldAnswer).order_by(FormFieldAnswer.created_at.desc()))
        answers = result.scalars().all()

        if not answers:
            print("No saved answers found.")
            return []

        print(f"\nFound {len(answers)} saved answers:\n")
        for i, answer in enumerate(answers, 1):
            print(f"{i}. Q: {answer.question_text[:60]}...")
            print(f"   A: {answer.answer_text[:60]}...")
            print(f"   Created: {answer.created_at}")
            print()

        return answers


async def delete_all_answers():
    """Delete all saved answers."""
    async with AsyncSession(engine) as db:
        result = await db.execute(delete(FormFieldAnswer))
        await db.commit()
        count = result.rowcount
        print(f"✓ Deleted {count} saved answers")
        return count


async def delete_answer_by_id(answer_id: str):
    """Delete a specific answer by ID."""
    async with AsyncSession(engine) as db:
        result = await db.execute(
            delete(FormFieldAnswer).where(FormFieldAnswer.id == answer_id)
        )
        await db.commit()
        if result.rowcount > 0:
            print(f"✓ Deleted answer {answer_id}")
            return True
        else:
            print(f"❌ Answer {answer_id} not found")
            return False


async def main():
    """Main function."""
    print("=" * 60)
    print("Saved Answers Manager")
    print("=" * 60)

    if len(sys.argv) > 1 and sys.argv[1] == '--list':
        await list_answers()
        return

    if len(sys.argv) > 1 and sys.argv[1] == '--delete-all':
        answers = await list_answers()
        if not answers:
            return

        print("\n⚠️  WARNING: This will delete ALL saved answers!")
        response = input("Type 'DELETE ALL' to confirm: ")

        if response == 'DELETE ALL':
            await delete_all_answers()
        else:
            print("Cancelled.")
        return

    if len(sys.argv) > 2 and sys.argv[1] == '--delete':
        answer_id = sys.argv[2]
        await delete_answer_by_id(answer_id)
        return

    # Interactive mode
    while True:
        print("\nOptions:")
        print("  1. List all saved answers")
        print("  2. Delete all saved answers")
        print("  3. Exit")

        choice = input("\nEnter choice (1-3): ").strip()

        if choice == '1':
            await list_answers()
        elif choice == '2':
            answers = await list_answers()
            if not answers:
                continue

            print("\n⚠️  WARNING: This will delete ALL saved answers!")
            response = input("Type 'DELETE ALL' to confirm: ")

            if response == 'DELETE ALL':
                await delete_all_answers()
            else:
                print("Cancelled.")
        elif choice == '3':
            print("Goodbye!")
            break
        else:
            print("Invalid choice.")


if __name__ == '__main__':
    asyncio.run(main())
