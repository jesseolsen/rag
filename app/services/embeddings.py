from openai import AsyncOpenAI
from app.config import settings
from typing import Union


class EmbeddingError(Exception):
    pass


async def generate_embeddings(text: Union[str, list[str]]) -> Union[list[float], list[list[float]]]:
    """Generate embeddings using OpenAI. Returns a single embedding for a string or list of embeddings for a list."""
    if isinstance(text, str):
        if not text:
            return []
        input_text = [text]
        single_result = True
    else:
        if not text:
            return []
        input_text = text
        single_result = False

    try:
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.embeddings.create(
            model="text-embedding-3-small",
            input=input_text
        )

        embeddings = [item.embedding for item in response.data]

        if single_result:
            return embeddings[0]
        return embeddings
    except Exception as e:
        raise EmbeddingError(f"Failed to generate embeddings: {str(e)}")
