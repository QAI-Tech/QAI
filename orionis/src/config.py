from __future__ import annotations
from typing import Optional, Type
import os
from dataclasses import dataclass


@dataclass
class Config:
    """Configuration class to manage environment variables as a Singleton."""

    STAGING = "staging"
    PRODUCTION = "production"

    environment: str
    path_to_gcp_creds: str
    gcp_project_id: str
    gemini_api_key: str
    clerk_jwks_url: str
    clerk_publishable_key: str
    clerk_secret_key: str
    hmac_secret_key: str
    notification_webhook_url: str
    test_run_update_webhook_url: str
    customer_comments_webhook_url: str
    team_qai_org_id: str
    sentry_dsn: str
    tcs_from_flow_timeout_mins: int
    jira_encryption_key: str
    enable_sharding_for_kg_flow_analyzer: bool = True
    enable_new_video_to_flow: bool = False
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    redis_host: str = "qai-redis"
    redis_port: int = 6379
    pubsub_backend: str = "redis"

    _instance: Optional[Config] = None

    @staticmethod
    def _get_env(key: str, env_suffix: str = "") -> str:
        """Get environment variable with proper error handling."""
        value = os.getenv(f"{key}{env_suffix}")
        if value is None:
            raise ValueError(
                f"Required environment variable {key}{env_suffix} is not set"
            )
        return value

    @staticmethod
    def _is_local_storage_mode() -> bool:
        """Return True when running with local storage backend."""
        backend = os.getenv("STORAGE_BACKEND", os.getenv("ORIONIS_BACKEND", "")).lower()
        return backend == "local"

    @classmethod
    def load(cls: Type[Config]) -> Config:
        """Load configuration based on environment as a Singleton."""
        if cls._instance is None:
            environment = os.getenv("ENVIRONMENT", cls.PRODUCTION).lower()
            env_suffix = "_" + environment.upper()
            is_local_storage = cls._is_local_storage_mode()

            team_qai_org_id_map = {
                cls.STAGING: "5629659324612608",
                cls.PRODUCTION: "5650266825162752",
            }

            cls._instance = cls(
                environment=environment,
                path_to_gcp_creds=(
                    os.getenv(f"PATH_TO_GCP_CREDS{env_suffix}", "")
                    if is_local_storage
                    else cls._get_env("PATH_TO_GCP_CREDS", env_suffix)
                ),
                gcp_project_id=(
                    os.getenv(f"GCP_PROJECT_ID{env_suffix}", "")
                    if is_local_storage
                    else cls._get_env("GCP_PROJECT_ID", env_suffix)
                ),
                gemini_api_key=cls._get_env("GEMINI_API_KEY", env_suffix),
                clerk_jwks_url="",
                clerk_publishable_key="",
                clerk_secret_key="",
                hmac_secret_key="",
                notification_webhook_url="",
                test_run_update_webhook_url="",
                customer_comments_webhook_url="",
                team_qai_org_id=team_qai_org_id_map.get(environment, ""),
                sentry_dsn="",
                tcs_from_flow_timeout_mins=int(
                    cls._get_env("TCS_FROM_FLOW_TIMEOUT_MINS")
                ),
                jira_encryption_key="",
                enable_sharding_for_kg_flow_analyzer=(
                    str(cls._get_env("ENABLE_SHARDING_FOR_KG_FLOW_ANALYZER")).lower()
                    == "true"
                ),
                enable_new_video_to_flow=(
                    os.getenv("ENABLE_NEW_VIDEO_TO_FLOW", "false").lower() == "true"
                ),
                stripe_secret_key="",
                stripe_webhook_secret="",
                redis_host=os.getenv("REDIS_HOST", "qai-redis"),
                redis_port=int(os.getenv("REDIS_PORT", "6379")),
                pubsub_backend=os.getenv("PUBSUB_BACKEND", "redis").lower(),
            )
        return cls._instance


config = Config.load()
