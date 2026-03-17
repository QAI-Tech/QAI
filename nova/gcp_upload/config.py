from __future__ import annotations
from typing import Optional, Type
from dataclasses import dataclass
import os

@dataclass
class Config:
    """Configuration class to manage environment variables as a Singleton."""

    environment: str
    path_to_gcp_creds: str
    gcp_project_id: str
    gemini_api_key: str
    clerk_jwks_url: str
    clerk_publishable_key: str
    clerk_secret_key: str
    hmac_secret_key: str
    notification_webhook_url: str
    team_qai_org_id: str

    _instance: Optional[Config] = None

    STAGING = "staging"
    PRODUCTION = "production"

    @classmethod
    def load(cls: Type[Config]) -> Config:
        """Load configuration based on environment as a Singleton."""

        if cls._instance is None:
            cls._instance = cls(
                environment=os.environ.get("ENVIRONMENT", "development"),
                path_to_gcp_creds=os.environ.get("PATH_TO_GCP_CREDS", "./gcp-service-account.json"),
                gcp_project_id=os.environ.get("GCP_PROJECT_ID", "qai-tech-staging"),
                gemini_api_key=os.environ.get("GEMINI_API_KEY", ""),
                clerk_jwks_url=os.environ.get("CLERK_JWKS_URL", ""),
                clerk_publishable_key=os.environ.get("CLERK_PUBLISHABLE_KEY", ""),
                clerk_secret_key=os.environ.get("CLERK_SECRET_KEY", ""),
                hmac_secret_key=os.environ.get("HMAC_SECRET_KEY", ""),
                notification_webhook_url=os.environ.get("NOTIFICATION_WEBHOOK_URL", ""),
                team_qai_org_id=os.environ.get("TEAM_QAI_ORG_ID", "5629659324612608")
            )
        return cls._instance


config = Config.load()

