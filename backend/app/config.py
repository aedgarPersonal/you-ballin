"""
Application Configuration
=========================
Uses pydantic-settings to load configuration from environment variables.
All settings are typed and validated at startup - if a required setting is
missing, the app fails fast with a clear error.

TEACHING NOTE:
    pydantic-settings reads from .env files automatically. Each field maps
    to an environment variable of the same name (case-insensitive).
    See .env.example for all available settings.
"""

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @model_validator(mode="after")
    def set_google_redirect_uri(self):
        if not self.google_redirect_uri:
            self.google_redirect_uri = f"{self.backend_url}/api/auth/google/callback"
        return self

    # --- Database ---
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/you_ballin"

    # --- Authentication ---
    secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 43200  # 30 days

    # --- Google OAuth ---
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    # --- Email (Resend) ---
    resend_api_key: str = ""
    email_from: str = "You Ballin <noreply@youballin.app>"

    # --- Email (Legacy SMTP - kept for backward compat) ---
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""

    # --- SMS (Twilio) ---
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # --- Web Push (VAPID) ---
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_claim_email: str = "mailto:admin@youballin.app"

    # --- AI Commentary (Anthropic Claude) ---
    anthropic_api_key: str = ""

    # --- Application ---
    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
    default_game_day: int = 2  # 0=Monday, 6=Sunday
    default_game_time: str = "19:00"
    game_roster_size: int = 16  # 5v5 + 3 subs per team


# Singleton instance - import this wherever you need settings
settings = Settings()
