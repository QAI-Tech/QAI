#!/usr/bin/env python3
"""
Redis Pub/Sub verification script for local testing.

This script tests the Redis-based message queue by:
1. Publishing a test message to the queue
2. Verifying the message can be consumed
3. Checking round-trip communication

Usage:
    python test_redis_pubsub.py [--publish | --consume | --roundtrip]
"""

import argparse
import json
import logging
import time
import sys

try:
    import redis
except ImportError:
    print("Error: redis package not installed. Run: pip install redis")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def get_redis_client(host='localhost', port=6379, db=0):
    """Get Redis client with connection test."""
    try:
        client = redis.Redis(
            host=host,
            port=port,
            db=db,
            decode_responses=False,
            socket_connect_timeout=5,
        )
        client.ping()
        logger.info(f"✓ Connected to Redis at {host}:{port}")
        return client
    except redis.ConnectionError as e:
        logger.error(f"✗ Failed to connect to Redis at {host}:{port}")
        logger.error(f"Error: {e}")
        logger.info("Make sure Redis is running: docker-compose up redis")
        sys.exit(1)


def publish_test_message(queue_name='nova-execution', host='localhost', port=6379):
    """Publish a test message to the Redis queue."""
    logger.info(f"Publishing test message to queue: {queue_name}")
    
    client = get_redis_client(host, port)
    
    # Create test message (similar to actual nova_execution_params)
    test_message = {
        "nova_execution_params": {
            "test_run_id": "test-run-12345",
            "product_id": "test-product-67890",
            "executable_url": "https://example.com/test-app",
            "platform": "ANDROID",
            "test_message": "This is a verification test message",
            "timestamp": time.time()
        }
    }
    
    # Encode and push to queue
    message_data = json.dumps(test_message, ensure_ascii=False).encode('utf-8')
    queue_length = client.lpush(queue_name, message_data)
    
    logger.info(f"✓ Message published successfully")
    logger.info(f"  Queue: {queue_name}")
    logger.info(f"  Queue length: {queue_length}")
    logger.info(f"  Message: {test_message}")
    
    return test_message


def consume_test_message(queue_name='nova-execution', host='localhost', port=6379, timeout=10):
    """Consume a test message from the Redis queue."""
    logger.info(f"Consuming message from queue: {queue_name} (timeout: {timeout}s)")
    
    client = get_redis_client(host, port)
    
    # BRPOP blocks until message available or timeout
    result = client.brpop(queue_name, timeout=timeout)
    
    if result is None:
        logger.warning(f"✗ No message received within {timeout} seconds")
        logger.info(f"  Queue '{queue_name}' is empty")
        return None
    
    # result is (queue_name, message_data)
    _, message_data = result
    message_str = message_data.decode('utf-8')
    message_dict = json.loads(message_str)
    
    logger.info(f"✓ Message consumed successfully")
    logger.info(f"  Queue: {queue_name}")
    logger.info(f"  Message: {message_dict}")
    
    return message_dict


def test_roundtrip(queue_name='nova-execution', host='localhost', port=6379):
    """Test round-trip: publish and then consume."""
    logger.info("=" * 70)
    logger.info("ROUND-TRIP TEST: Publish → Consume")
    logger.info("=" * 70)
    
    # Publish
    logger.info("\n[1/2] Publishing test message...")
    published_msg = publish_test_message(queue_name, host, port)
    
    time.sleep(1)  # Small delay
    
    # Consume
    logger.info("\n[2/2] Consuming test message...")
    consumed_msg = consume_test_message(queue_name, host, port, timeout=5)
    
    # Verify
    logger.info("\n" + "=" * 70)
    if consumed_msg is None:
        logger.error("✗ ROUND-TRIP TEST FAILED: No message consumed")
        return False
    
    if consumed_msg == published_msg:
        logger.info("✓ ROUND-TRIP TEST PASSED: Message matches!")
        logger.info("  Redis Pub/Sub is working correctly")
        return True
    else:
        logger.error("✗ ROUND-TRIP TEST FAILED: Message mismatch")
        logger.error(f"  Published: {published_msg}")
        logger.error(f"  Consumed:  {consumed_msg}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Test Redis Pub/Sub for Nova')
    parser.add_argument(
        '--mode',
        choices=['publish', 'consume', 'roundtrip'],
        default='roundtrip',
        help='Test mode (default: roundtrip)'
    )
    parser.add_argument(
        '--queue',
        default='nova-execution',
        help='Queue name (default: nova-execution)'
    )
    parser.add_argument(
        '--host',
        default='localhost',
        help='Redis host (default: localhost)'
    )
    parser.add_argument(
        '--port',
        type=int,
        default=6379,
        help='Redis port (default: 6379)'
    )
    
    args = parser.parse_args()
    
    logger.info("Redis Pub/Sub Verification Script")
    logger.info("=" * 70)
    
    try:
        if args.mode == 'publish':
            publish_test_message(args.queue, args.host, args.port)
        elif args.mode == 'consume':
            consume_test_message(args.queue, args.host, args.port)
        elif args.mode == 'roundtrip':
            success = test_roundtrip(args.queue, args.host, args.port)
            sys.exit(0 if success else 1)
    
    except KeyboardInterrupt:
        logger.info("\nInterrupted by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
