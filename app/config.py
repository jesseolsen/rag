from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database
    database_url: str

    # API Keys
    anthropic_api_key: str

    # Server
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    debug: bool = True

    # Search
    similarity_threshold: float = 0.7
    default_top_k: int = 5
    max_top_k: int = 20

    # Generation
    generation_model: str = "claude-opus-4-7"
    context_chunk_count: int = 10
    max_generation_tokens: int = 2000

    # Google Sheets Integration (optional)
    google_spreadsheet: Optional[str] = None
    google_sheets_credentials_file: Optional[str] = None

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
