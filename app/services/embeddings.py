from sentence_transformers import SentenceTransformer
from app.config import settings
from typing import Union
import asyncio


class EmbeddingError(Exception):
    pass

# Load model once at module level
_model = None


def _get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer('all-MiniLM-L6-v2')
    return _model


async def generate_embeddings(text: Union[str, list[str]]) -> Union[list[float], list[list[float]]]:
    """Generate embeddings using sentence-transformers (local model). Returns a single embedding for a string or list of embeddings for a list."""
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
        # Run the synchronous model encoding in a thread pool
        loop = asyncio.get_event_loop()
        model = _get_model()
        embeddings = await loop.run_in_executor(None, model.encode, input_text)
        
        # Convert to list format
        embeddings = embeddings.tolist()

        if single_result:
            return embeddings[0]
        return embeddings
    except Exception as e:
        raise EmbeddingError(f"Failed to generate embeddings: {str(e)}")
