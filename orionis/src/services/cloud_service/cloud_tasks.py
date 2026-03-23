from google.cloud import tasks_v2
import json
import logging
import os
import threading
import requests
from constants import Constants
from config import config
from utils.util import orionis_log


class CloudTaskService:
    def __init__(self):
        self._is_local_mode = (
            os.getenv("STORAGE_BACKEND", os.getenv("ORIONIS_BACKEND", "")).lower()
            == "local"
        )
        self.project_id = config.gcp_project_id
        self.queue_name = Constants.TASK_QUEUE_NAME
        self.smoke_tests_planning_queue_name = Constants.SMOKE_TESTS_TASK_QUEUE_NAME
        self.location = Constants.GCP_REGION
        if self._is_local_mode:
            self.base_url = os.getenv("ORIONIS_LOCAL_BASE_URL", "http://127.0.0.1:8080")
            self.client = None
        else:
            self.base_url = f"https://{self.location}-{self.project_id}.cloudfunctions.net"
            self.client = tasks_v2.CloudTasksClient()

    def _dispatch_local_task(self, handler_url: str, payload: dict):
        try:
            response = requests.post(
                handler_url,
                headers={"Content-Type": "application/json"},
                data=json.dumps(payload),
                timeout=1800,
            )
            if response.status_code >= 400:
                orionis_log(
                    (
                        "Local fire-and-forget task returned non-success "
                        f"status={response.status_code} url={handler_url} "
                        f"body={response.text[:500]}"
                    )
                )
        except Exception as e:
            orionis_log(f"Local fire-and-forget task failed for {handler_url}: {e}", e)

    def enqueue_task_v1(
        self,
        payload: dict,
        handler_function_name: str,
        queue_name: str = Constants.SMOKE_TESTS_TASK_QUEUE_NAME,
    ):

        try:
            handler_url = f"{self.base_url}/{handler_function_name}"

            if self._is_local_mode:
                thread = threading.Thread(
                    target=self._dispatch_local_task,
                    args=(handler_url, payload),
                    daemon=True,
                )
                thread.start()
                logging.info(
                    "Dispatched local fire-and-forget task: handler=%s queue=%s",
                    handler_function_name,
                    queue_name,
                )
                return {
                    "name": f"local/{queue_name}/{handler_function_name}",
                    "url": handler_url,
                }

            parent = self.client.queue_path(
                self.project_id, self.location, queue_name  # type: ignore #TODO: fix this type error
            )

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
