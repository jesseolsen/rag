from openai import OpenAI
from app.config import settings


class EmbeddingError(Exception):
    pass


def generate_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings using OpenAI."""
    if not texts:
        return []

    try:
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=texts
        )

        embeddings = [item.embedding for item in response.data]
        return embeddings
    except Exception as e:
        raise EmbeddingError(f"Failed to generate embeddings: {str(e)}")
