from google.cloud import pubsub_v1
import time
import subprocess
import json
import threading
from google.auth import default
import google.auth.exceptions
PROJECT_ID = "qai-tech-staging"
SUBSCRIPTION_ID = "nova-execution-requests-sub"
subscriber = pubsub_v1.SubscriberClient()
subscription_path = subscriber.subscription_path(PROJECT_ID, SUBSCRIPTION_ID)
def extend_ack_deadline(subscriber, subscription_path, ack_id, stop_event):
    while not stop_event.is_set():
        try:
            print("Extending message deadline")
            subscriber.modify_ack_deadline(
                request={
                    "subscription": subscription_path,
                    "ack_ids": [ack_id],
                    "ack_deadline_seconds": 600,
                }
            )
        except Exception as e:
            print(f"Error extending ack deadline: {e}")
        time.sleep(300)  # Refresh before the 60s expires
def process_message(subscriber, subscription_path, received_message):
    ack_id = received_message.ack_id
    message_data = received_message.message.data.decode("utf-8")
    print(f"Received message: {message_data}")
    # Start background thread to extend ack deadline
    stop_event = threading.Event()
    extender_thread = threading.Thread(
        target=extend_ack_deadline,
        args=(subscriber, subscription_path, ack_id, stop_event)
    )
    extender_thread.start()
    try:
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
            ]
            print(f"\nExecuting command: {' '.join(cmd)}")
            result = subprocess.run(cmd)
            print(f"Command completed with return code: {result.returncode}")
        else:
            print("No execution parameters found in the message.")
        

        # Stop ack extender, then acknowledge
        stop_event.set()
        extender_thread.join()
        subscriber.acknowledge(
            request={
                "subscription": subscription_path,
                "ack_ids": [ack_id],
            }
        )
        print("Message acknowledged.")
    except subprocess.CalledProcessError as e:
        print(f"`main.py` execution failed: {e}")
        stop_event.set()
        extender_thread.join()
        # Message will be retried
    except Exception as e:
        print(f"Unexpected error: {e}")
        stop_event.set()
        extender_thread.join()
def main():
    try:
        creds, project = default()
    	
        if hasattr(creds, 'service_account_email'):
           print("auth level 1:" , creds.service_account_email)
    except google.auth.exceptions.DefaultCredentialsError as e:
    	print(":x: ADC failed:", e)
    print(f"Listening to subscription: {subscription_path}")
    
    while True:
        try:
            response = subscriber.pull(
                request={
                    "subscription": subscription_path,
                    "max_messages": 1,
                },
                timeout=30
            )
            for received_message in response.received_messages:
                process_message(subscriber, subscription_path, received_message)
        except Exception as e:
            print(f"Error during pull: {e}")
        time.sleep(1)
if __name__ == "__main__":
    main()
