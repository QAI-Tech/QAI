import time
import logging
from google.cloud import pubsub_v1
from google.api_core import exceptions
from concurrent.futures import ThreadPoolExecutor
import json
import subprocess
import os
from utils.pubsub_listener_wrapper import get_listener

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def process_web_message(message_data: dict) -> bool:
    """
    Process a single web execution message from the queue.
    
    Args:
        message_data: Parsed message dictionary
        
    Returns:
        True if processing succeeded, False otherwise
    """
    try:
        logger.info(f"Processing WEB message")
        logger.info(f"Message data: {message_data}")
        
        param = message_data.get("nova_execution_params", None)
        if param:
            print(f"Web Execution parameters: {param}")
            print("-" * 50)
            
            # Web platform - default to WEB
            platform = param.get("platform", "WEB")
            print(f"Platform: {platform}")
            
            cmd = [
                "python3",
                "main.py",
                "--testing_request",
                json.dumps(param),
                "--platform",
                platform,
            ]
            print(f"\nExecuting WEB command: {' '.join(cmd)}")
            result = subprocess.run(cmd)
            print(f"WEB command completed with return code: {result.returncode}")
        else:
            print("No execution parameters found in the message.")
        
        logger.info(f"Successfully processed WEB message")
        return True
        
    except Exception as e:
        logger.error(f"Error processing WEB message: {str(e)}")
        return False

def main():
    QUEUE_NAME = "nova-web-execution-queue"        # Redis queue name
    SUBSCRIPTION_NAME = "nova-web-execution-queue-sub"  # GCP subscription (used when PUBSUB_BACKEND=gcp)

    listener = get_listener(
        queue_name=QUEUE_NAME,
        subscription_name=SUBSCRIPTION_NAME
    )
    
    try:
        listener.listen_for_messages(process_web_message)
    except KeyboardInterrupt:
        logger.info("Received interrupt signal")
    finally:
        listener.stop_listener()

if __name__ == "__main__":
    main()
