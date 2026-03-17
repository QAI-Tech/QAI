from google.cloud import tasks_v2
import json
import logging
from constants import Constants
from config import config
from utils.util import orionis_log


class CloudTaskService:
    def __init__(self):
        self.project_id = config.gcp_project_id
        self.queue_name = Constants.TASK_QUEUE_NAME
        self.smoke_tests_planning_queue_name = Constants.SMOKE_TESTS_TASK_QUEUE_NAME
        self.location = Constants.GCP_REGION
        self.base_url = f"https://{self.location}-{self.project_id}.cloudfunctions.net"

        self.client = tasks_v2.CloudTasksClient()

    def enqueue_task_v1(
        self,
        payload: dict,
        handler_function_name: str,
        queue_name: str = Constants.SMOKE_TESTS_TASK_QUEUE_NAME,
    ):

        try:
            parent = self.client.queue_path(
                self.project_id, self.location, queue_name  # type: ignore #TODO: fix this type error
            )

            handler_url = f"{self.base_url}/{handler_function_name}"

            task = {
                "http_request": {
                    "http_method": tasks_v2.HttpMethod.POST,
                    "url": handler_url,
                    "headers": {"Content-Type": "application/json"},
                    "body": json.dumps(payload).encode(),
                },
                "dispatch_deadline": {"seconds": 1800},
            }

            response = self.client.create_task(request={"parent": parent, "task": task})
            logging.info(f"Created Cloud Task: {response.name}")
            return response
        except Exception as e:
            orionis_log(f"Failed to create Cloud Task: {e}", e)
            raise
