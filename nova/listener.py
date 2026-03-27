import time
import logging
import json
import subprocess
from utils.pubsub_listener_wrapper import get_listener

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def process_message(message_data: dict) -> bool:
    """
    Process a single message from the queue.

    Args:
        message_data: Parsed message dictionary

    Returns:
        True if processing succeeded, False otherwise
    """
    try:
        logger.info(f"Processing message")
        logger.info(f"Message data: {message_data}")

        param = message_data.get("nova_execution_params", None)
        if param:
            print(f"Execution parameters: {param}")
            print("-" * 50)
            cmd = [
                "python3",
                "main.py",
                "--testing_request",
                json.dumps(param),
                "--platform",
                "ANDROID",
            ]
            print(f"\nExecuting command: {' '.join(cmd)}")
            result = subprocess.run(cmd)
            print(f"Command completed with return code: {result.returncode}")
        else:
            print("No execution parameters found in the message.")

        logger.info(f"Successfully processed message")
        return True

    except Exception as e:
        logger.error(f"Error processing message: {str(e)}")
        return False


def main():
    QUEUE_NAME = "nova-execution"             # Redis queue name
    SUBSCRIPTION_NAME = "nova-execution-sub"  # GCP subscription (used when PUBSUB_BACKEND=gcp)

    listener = get_listener(
        queue_name=QUEUE_NAME,
        subscription_name=SUBSCRIPTION_NAME
    )

    logger.info("Starting message listener...")

    try:
        for message_data in listener.listen():
            success = process_message(message_data)
            if success:
                logger.info("Message processed successfully")
            else:
                logger.error("Message processing failed")
            time.sleep(0.1)
    except KeyboardInterrupt:
        logger.info("Received interrupt signal, shutting down")
    finally:
        listener.stop()


if __name__ == "__main__":
    main()