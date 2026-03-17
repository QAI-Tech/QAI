import time
import logging
import json
import subprocess
import os
from google.cloud import pubsub_v1
from google.api_core import exceptions
from concurrent.futures import ThreadPoolExecutor

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

class SyncPubSubListener:
    def __init__(self, project_id, subscription_name, max_messages=1):
        """
        Initialize the synchronous Pub/Sub listener
        
        Args:
            project_id (str): GCP project ID
            subscription_name (str): Name of the subscription
            max_messages (int): Maximum messages to pull at once (keep as 1 for your use case)
        """
        self.project_id = project_id
        self.subscription_name = subscription_name
        self.max_messages = max_messages
        
        # Initialize the subscriber client
        self.subscriber = pubsub_v1.SubscriberClient()
        self.subscription_path = self.subscriber.subscription_path(
            project_id, subscription_name
        )
        
        # Configure pull request settings
        self.pull_request = {
            "subscription": self.subscription_path,
            "max_messages": self.max_messages
        }
        
        # Set acknowledgment deadline to prevent message redelivery during processing
        # Adjust this based on your expected processing time
        self.ack_deadline_seconds = 600  # 10 minutes
        
        logger.info(f"Initialized listener for subscription: {self.subscription_path}")
    
    def process_message(self, message):
        """
        Process a single message - replace this with your actual processing logic
        
        Args:
            message: The received Pub/Sub message
        """
        try:
            # Your message processing logic goes here
            message_data = message.data.decode('utf-8')
            message_id = message.message_id
            
            logger.info(f"Processing message ID: {message_id}")
            logger.info(f"Message data: {message_data}")
            
            data = json.loads(message_data)
            param = data.get("nova_execution_params", None)
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
            
            logger.info(f"Successfully processed message ID: {message_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error processing message {message.message_id}: {str(e)}")
            return False
    
    def listen_for_messages(self):
        """
        Main listening loop - pulls and processes messages one at a time
        """
        logger.info("Starting message listener...")
        
        while True:
            try:
                # Wait for emulator to be healthy before pulling messages
                wait_for_healthy_emulator()
                
                # Pull messages (one at a time)
                response = self.subscriber.pull(
                    request=self.pull_request,
                    timeout=60  # Wait up to 60 seconds for messages
                )
                
                if not response.received_messages:
                    logger.info("No messages received, continuing to poll...")
                    continue
                
                # Process each message (should be only one due to max_messages=1)
                for received_message in response.received_messages:
                    message = received_message.message
                    ack_id = received_message.ack_id
                    
                    logger.info(f"Received message: {message.message_id}")
                    
                    # Check health again before processing
                    wait_for_healthy_emulator()
                    
                    # Acknowledge the message immediately to prevent redelivery
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
                    
                    # Now process the message synchronously
                    success = self.process_message(message)
                    
                    if success:
                        logger.info(f"Message {message.message_id} processed successfully")
                    else:
                        logger.error(f"Message {message.message_id} processing failed")
                        # Message is already acknowledged, so it won't be redelivered
                        # You might want to send it to a dead letter queue or log for manual review
                    
                    # Add a small delay before processing next message if needed
                    time.sleep(0.1)
                
            except exceptions.DeadlineExceeded:
                logger.info("Pull request timed out, continuing...")
                continue
                
            except Exception as e:
                logger.error(f"Error in message listener: {str(e)}")
                time.sleep(5)  # Wait before retrying
                continue
    
    def stop_listener(self):
        """
        Gracefully stop the listener
        """
        logger.info("Stopping message listener...")
        self.subscriber.close()

def main():
    # Configuration - replace with your actual values
    PROJECT_ID = "qai-tech-staging"
    SUBSCRIPTION_NAME = "nova-execution-sub"
    
    # Create and start the listener
    listener = SyncPubSubListener(PROJECT_ID, SUBSCRIPTION_NAME)
    
    try:
        listener.listen_for_messages()
    except KeyboardInterrupt:
        logger.info("Received interrupt signal")
    finally:
        listener.stop_listener()

if __name__ == "__main__":
    main()
