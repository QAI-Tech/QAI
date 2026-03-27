"""
Pub/Sub abstraction layer supporting both Redis (local) and Google Cloud Pub/Sub (production).

The backend is controlled by the PUBSUB_BACKEND environment variable:
- 'redis' (default): Use Redis for local development
- 'gcp': Use Google Cloud Pub/Sub for staging/production
"""

import json
import logging
from abc import ABC, abstractmethod
from typing import Optional

import redis
from google.cloud import pubsub_v1
from google.api_core import exceptions as gcp_exceptions

from config import config

logger = logging.getLogger(__name__)


class PubSubClient(ABC):
    """Abstract base class for Pub/Sub clients."""

    @abstractmethod
    def publish(self, data: dict, topic_id: str) -> str:
        """
        Publish a message to the specified topic/queue.

        Args:
            data: Dictionary to publish as JSON
            topic_id: Topic name (GCP) or queue name (Redis)

        Returns:
            Message ID or acknowledgment string
        """
        pass


class RedisPubSubClient(PubSubClient):
    """Redis-based Pub/Sub client using Lists (LPUSH/BRPOP) for queue semantics."""

    def __init__(self, host: str = "qai-redis", port: int = 6379, db: int = 0):
        """
        Initialize Redis client.

        Args:
            host: Redis host (default: qai-redis for docker)
            port: Redis port (default: 6379)
            db: Redis database number (default: 0)
        """
        self.redis_client = redis.Redis(
            host=host,
            port=port,
            db=db,
            decode_responses=False,  # We'll handle encoding ourselves
            socket_connect_timeout=5,
            socket_timeout=5,
        )
        # Test connection
        try:
            self.redis_client.ping()
            logger.info(f"✓ Using Redis Pub/Sub (local) at {host}:{port}")
        except redis.ConnectionError as e:
            logger.error(f"Failed to connect to Redis at {host}:{port}: {e}")
            raise

    def publish(self, data: dict, topic_id: str) -> str:
        """
        Publish message to Redis list using LPUSH.

        Args:
            data: Dictionary to publish as JSON
            topic_id: Queue name (e.g., 'nova-execution')

        Returns:
            Confirmation string with queue length
        """
        try:
            message_data = json.dumps(data, ensure_ascii=False).encode("utf-8")
            queue_length = self.redis_client.lpush(topic_id, message_data)

            logger.info(f"Published to Redis queue '{topic_id}' (length: {queue_length})")
            logger.debug(f"Message data: {data}")

            return f"redis-{topic_id}-{queue_length}"

        except Exception as e:
            logger.error(f"Error publishing to Redis queue '{topic_id}': {e}")
            raise


class GooglePubSubClient(PubSubClient):
    """Google Cloud Pub/Sub client."""

    def __init__(self, project_id: str):
        """
        Initialize Google Cloud Pub/Sub client.

        Args:
            project_id: GCP project ID
        """
        self.project_id = project_id
        self.publisher = pubsub_v1.PublisherClient()
        logger.info(f"✓ Using Google Pub/Sub (production) - Project: {project_id}")

    def publish(self, data: dict, topic_id: str) -> str:
        """
        Publish message to Google Cloud Pub/Sub topic.

        Args:
            data: Dictionary to publish as JSON
            topic_id: GCP topic name

        Returns:
            Message ID from GCP
        """
        topic_path = self.publisher.topic_path(self.project_id, topic_id)

        try:
            # Check if topic exists (optional, for debugging)
            try:
                topic = self.publisher.get_topic(request={"topic": topic_path})
                logger.debug(f"Topic exists: {topic.name}")
            except gcp_exceptions.NotFound:
                logger.warning(f"Topic {topic_path} might not exist")
            except Exception as e:
                logger.debug(f"Could not verify topic existence: {e}")

            # Prepare and publish message
            message_data = json.dumps(data, ensure_ascii=False).encode("utf-8")
            future = self.publisher.publish(
                topic_path,
                message_data,
                source="python_publisher",
            )

            message_id = future.result(timeout=30)
            logger.info(f"Published to GCP topic '{topic_id}' - Message ID: {message_id}")
            logger.debug(f"Message data: {data}")

            return message_id

        except Exception as e:
            logger.error(f"Error publishing to GCP topic '{topic_id}': {e}")
            raise


def get_pubsub_client() -> PubSubClient:
    """
    Factory function to get the appropriate Pub/Sub client.

    Controlled by the PUBSUB_BACKEND environment variable:
    - 'redis' (default): Use Redis for local development
    - 'gcp': Use Google Cloud Pub/Sub for staging/production

    Returns:
        Appropriate PubSubClient instance

    Raises:
        redis.ConnectionError: If Redis connection fails when using Redis backend
        Exception: If GCP client initialization fails when using GCP backend
    """
    backend = config.pubsub_backend

    if backend == "gcp":
        logger.info(f"Initializing Google Pub/Sub client for project: {config.gcp_project_id}")
        return GooglePubSubClient(project_id=config.gcp_project_id)

    logger.info("Initializing Redis Pub/Sub client (PUBSUB_BACKEND=redis)")
    return RedisPubSubClient(host=config.redis_host, port=config.redis_port)
