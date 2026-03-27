"""
Pub/Sub listener abstraction layer supporting both Redis (local) and Google Cloud Pub/Sub (production).

The backend is controlled by the PUBSUB_BACKEND environment variable:
- 'redis' (default): Use Redis for local development
- 'gcp': Use Google Cloud Pub/Sub for staging/production
"""

import json
import logging
import os
import time
from abc import ABC, abstractmethod
from typing import Optional, Callable

import redis
from google.cloud import pubsub_v1
from google.api_core import exceptions as gcp_exceptions

logger = logging.getLogger(__name__)


class PubSubListener(ABC):
    """Abstract base class for Pub/Sub listeners."""

    @abstractmethod
    def listen_for_messages(self, message_handler: Callable):
        """
        Start listening for messages and process them with the provided handler.

        Args:
            message_handler: Function that takes a message and processes it.
                           Should return True on success, False on failure.
        """
        pass

    @abstractmethod
    def stop_listener(self):
        """Gracefully stop the listener."""
        pass


class RedisPubSubListener(PubSubListener):
    """Redis-based Pub/Sub listener using Lists (BRPOP) for queue semantics."""

    def __init__(self, queue_name: str, host: str = "localhost", port: int = 6379, db: int = 0):
        """
        Initialize Redis listener.

        Args:
            queue_name: Redis queue name (e.g., 'nova-execution')
            host: Redis host (default: localhost)
            port: Redis port (default: 6379)
            db: Redis database number (default: 0)
        """
        self.queue_name = queue_name
        self.redis_client = redis.Redis(
            host=host,
            port=port,
            db=db,
            decode_responses=False,  # We'll handle decoding ourselves
            socket_connect_timeout=5,
            socket_timeout=5,
        )
        self.running = False

        # Test connection
        try:
            self.redis_client.ping()
            logger.info(f"✓ Using Redis Pub/Sub listener (local) at {host}:{port}")
            logger.info(f"✓ Listening on queue: {queue_name}")
        except redis.ConnectionError as e:
            logger.error(f"Failed to connect to Redis at {host}:{port}: {e}")
            raise

    def listen_for_messages(self, message_handler: Callable):
        """
        Listen for messages from Redis queue using BRPOP (blocking right pop).

        Args:
            message_handler: Function that takes message data and returns True/False
        """
        logger.info(f"Starting Redis message listener for queue: {self.queue_name}")
        self.running = True

        while self.running:
            try:
                # BRPOP blocks until a message is available (timeout: 60 seconds)
                result = self.redis_client.brpop(self.queue_name, timeout=60)

                if result is None:
                    logger.debug(f"No messages in queue '{self.queue_name}', continuing...")
                    continue

                # result is a tuple: (queue_name, message_data)
                _, message_data = result
                
                try:
                    # Decode and parse message
                    message_str = message_data.decode('utf-8')
                    message_dict = json.loads(message_str)
                    
                    logger.info(f"Received message from Redis queue '{self.queue_name}'")
                    logger.debug(f"Message data: {message_dict}")

                    # Process message
                    success = message_handler(message_dict)

                    if success:
                        logger.info(f"Message processed successfully")
                    else:
                        logger.error(f"Message processing failed")

                except json.JSONDecodeError as e:
                    logger.error(f"Failed to decode message JSON: {e}")
                except Exception as e:
                    logger.error(f"Error processing message: {e}")

                # Small delay before processing next message
                time.sleep(0.1)

            except redis.ConnectionError as e:
                logger.error(f"Redis connection error: {e}")
                logger.info("Attempting to reconnect in 5 seconds...")
                time.sleep(5)
                continue

            except Exception as e:
                logger.error(f"Error in Redis message listener: {e}")
                time.sleep(5)
                continue

    def stop_listener(self):
        """Gracefully stop the Redis listener."""
        logger.info("Stopping Redis message listener...")
        self.running = False
        try:
            self.redis_client.close()
        except Exception as e:
            logger.error(f"Error closing Redis connection: {e}")


class GooglePubSubListener(PubSubListener):
    """Google Cloud Pub/Sub listener."""

    def __init__(self, project_id: str, subscription_name: str, max_messages: int = 1):
        """
        Initialize Google Cloud Pub/Sub listener.

        Args:
            project_id: GCP project ID
            subscription_name: Subscription name
            max_messages: Maximum messages to pull at once
        """
        self.project_id = project_id
        self.subscription_name = subscription_name
        self.max_messages = max_messages
        
        self.subscriber = pubsub_v1.SubscriberClient()
        self.subscription_path = self.subscriber.subscription_path(
            project_id, subscription_name
        )
        
        self.pull_request = {
            "subscription": self.subscription_path,
            "max_messages": self.max_messages
        }
        
        self.ack_deadline_seconds = 600  # 10 minutes
        
        logger.info(f"✓ Using Google Pub/Sub listener (production)")
        logger.info(f"✓ Subscription: {self.subscription_path}")

    def listen_for_messages(self, message_handler: Callable):
        """
        Listen for messages from Google Cloud Pub/Sub subscription.

        Args:
            message_handler: Function that takes message data dict and returns True/False
        """
        logger.info("Starting Google Pub/Sub message listener...")
        
        while True:
            try:
                # Pull messages
                response = self.subscriber.pull(
                    request=self.pull_request,
                    timeout=60
                )
                
                if not response.received_messages:
                    logger.debug("No messages received, continuing to poll...")
                    continue
                
                # Process each message
                for received_message in response.received_messages:
                    message = received_message.message
                    ack_id = received_message.ack_id
                    
                    logger.info(f"Received GCP message: {message.message_id}")
                    
                    # Acknowledge immediately to prevent redelivery
                    try:
                        self.subscriber.acknowledge(
                            request={
                                "subscription": self.subscription_path,
                                "ack_ids": [ack_id]
                            }
                        )
                        logger.info(f"Acknowledged message: {message.message_id}")
                    except Exception as ack_error:
                        logger.error(f"Failed to acknowledge message {message.message_id}: {ack_error}")
                        continue
                    
                    # Parse and process message
                    try:
                        message_data = message.data.decode('utf-8')
                        message_dict = json.loads(message_data)
                        
                        logger.debug(f"Message data: {message_dict}")
                        
                        success = message_handler(message_dict)
                        
                        if success:
                            logger.info(f"Message {message.message_id} processed successfully")
                        else:
                            logger.error(f"Message {message.message_id} processing failed")
                            
                    except Exception as e:
                        logger.error(f"Error processing message {message.message_id}: {e}")
                    
                    time.sleep(0.1)
                
            except gcp_exceptions.DeadlineExceeded:
                logger.debug("Pull request timed out, continuing...")
                continue
                
            except Exception as e:
                logger.error(f"Error in GCP message listener: {e}")
                time.sleep(5)
                continue
    
    def stop_listener(self):
        """Gracefully stop the Google Pub/Sub listener."""
        logger.info("Stopping Google Pub/Sub message listener...")
        self.subscriber.close()


def get_listener(
    queue_name: str,
    subscription_name: Optional[str] = None,
    max_messages: int = 1
) -> PubSubListener:
    """
    Factory function to get the appropriate Pub/Sub listener.

    Controlled by the PUBSUB_BACKEND environment variable:
    - 'redis' (default): Use Redis for local development
    - 'gcp': Use Google Cloud Pub/Sub for staging/production

    Args:
        queue_name: Queue name for Redis (e.g., 'nova-execution')
        subscription_name: GCP subscription name (required when PUBSUB_BACKEND=gcp)
        max_messages: Max messages to pull at once (GCP only)

    Returns:
        Appropriate PubSubListener instance

    Raises:
        redis.ConnectionError: If Redis connection fails when using Redis backend
        ValueError: If PUBSUB_BACKEND=gcp but subscription_name is missing
    """
    backend = os.getenv("PUBSUB_BACKEND", "redis").lower()

    if backend == "gcp":
        project_id = os.getenv("GCP_PROJECT_ID", "")
        if not project_id:
            raise ValueError("GCP_PROJECT_ID environment variable is required when PUBSUB_BACKEND=gcp")
        if not subscription_name:
            raise ValueError("subscription_name is required when PUBSUB_BACKEND=gcp")

        logger.info(f"Initializing Google Pub/Sub listener (PUBSUB_BACKEND=gcp) for project: {project_id}")
        return GooglePubSubListener(
            project_id=project_id,
            subscription_name=subscription_name,
            max_messages=max_messages
        )

    logger.info("Initializing Redis Pub/Sub listener (PUBSUB_BACKEND=redis)")
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))

    return RedisPubSubListener(
        queue_name=queue_name,
        host=redis_host,
        port=redis_port
    )
