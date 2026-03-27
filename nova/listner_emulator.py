import time
import logging
import json
import subprocess
import os
from google.cloud import pubsub_v1
from google.api_core import exceptions
from concurrent.futures import ThreadPoolExecutor
from utils.pubsub_listener_wrapper import get_listener

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Health check configuration
HEALTH_STATUS_FILE = "/tmp/emulator_health_status"
HEALTH_CHECK_INTERVAL = 10  # seconds between health checks when waiting

def is_emulator_healthy():
    """
    Check if the emulator is healthy by reading the status file
    Returns True only if status is 'healthy'
    """
    try:
        if not os.path.exists(HEALTH_STATUS_FILE):
            logger.warning(f"Health status file not found: {HEALTH_STATUS_FILE}")
            return False
        
        with open(HEALTH_STATUS_FILE, 'r') as f:
            data = json.load(f)
        
        status = data.get("status", "unknown")
        message = data.get("message", "")
        
        if status == "healthy":
            return True
        else:
            logger.info(f"Emulator status: {status} - {message}")
            return False
            
    except Exception as e:
        logger.error(f"Error reading health status: {e}")
        return False

def wait_for_healthy_emulator():
    """
    Block until the emulator becomes healthy
    """
    while not is_emulator_healthy():
        logger.info(f"Waiting for emulator to become healthy... (checking every {HEALTH_CHECK_INTERVAL}s)")
        time.sleep(HEALTH_CHECK_INTERVAL)
    
    logger.info("Emulator is healthy, proceeding...")

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
    QUEUE_NAME = "nova-execution"        # Redis queue name
    SUBSCRIPTION_NAME = "nova-execution-sub"  # GCP subscription (used when PUBSUB_BACKEND=gcp)

    listener = get_listener(
        queue_name=QUEUE_NAME,
        subscription_name=SUBSCRIPTION_NAME
    )
    
    # Define message handler with health check integration
    def message_handler_with_health_check(message_data: dict) -> bool:
        \"\"\"Message handler that waits for healthy emulator before processing.\"\"\"
        wait_for_healthy_emulator()
        return process_message(message_data)
    
    try:
        listener.listen_for_messages(message_handler_with_health_check)
    except KeyboardInterrupt:
        logger.info("Received interrupt signal")
    finally:
        listener.stop_listener()

if __name__ == "__main__":
    main()
