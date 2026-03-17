from datetime import datetime
import logging
import base64
import sentry_sdk
from constants import Constants, ModeType
import json
from pathlib import Path
import traceback
from google.cloud import pubsub_v1  # type: ignore
from google.api_core import exceptions


class CustomFormatter(logging.Formatter):
    def format(self, record):
        try:
            record.filename = Path(record.pathname).relative_to(Path.cwd()).as_posix()
        except ValueError:
            record.filename = Path(record.pathname).name
        return super().format(record)


logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.handlers = []
handler = logging.StreamHandler()
handler.setFormatter(
    CustomFormatter(
        "%(asctime)s,%(msecs)03d %(levelname)-8s [%(filename)s:%(lineno)d] %(message)s",
        datefmt="%Y-%m-%d:%H:%M:%S",
    )
)
logger.addHandler(handler)


def orionis_log(message: str, error: Exception | None = None):
    # Get the caller's information using stack inspection
    stack = traceback.extract_stack()
    if len(stack) >= 2:  # We need at least 2 frames (current and caller)
        caller_frame = stack[-2]  # -2 because -1 is the current frame
        filename = caller_frame.filename
        lineno = caller_frame.lineno or 0  # Provide default value if None
        function = caller_frame.name
    else:
        # Fallback to basic logging if we can't get stack info
        if error:
            message_to_log = f"{message}\nError: {error}\nStack trace:\n{''.join(traceback.format_tb(error.__traceback__))}"
            logger.error(message_to_log)
        else:
            logger.info(message)
        return

    # Create the full message including error info if present
    full_message = message
    if error:
        full_message = f"{message}\nError: {error}\nStack trace:\n{''.join(traceback.format_tb(error.__traceback__))}"

    # Create a custom record with caller's information
    record = logging.LogRecord(
        name=logger.name,
        level=logging.ERROR if error else logging.INFO,
        pathname=filename,
        lineno=lineno,
        msg=full_message,
        args=(),
        exc_info=(type(error), error, error.__traceback__) if error else None,
        func=function,
    )

    logger.handle(record)

    if error:
        sentry_sdk.capture_exception(error)


def serialize(elements):
    return json.dumps(
        [element.model_dump(mode="json") for element in elements], indent=2
    )


def serialize_element(element):
    return json.dumps(element.model_dump(mode="json"), indent=2)


def uri_to_url(uri: str) -> str:
    if uri.startswith(Constants.GOOGLE_CLOUD_STORAGE_URL_PREFIX):
        return uri

    if uri.startswith(Constants.GOOGLE_CLOUD_STORAGE_URI_PREFIX):
        return uri.replace(
            Constants.GOOGLE_CLOUD_STORAGE_URI_PREFIX,
            Constants.GOOGLE_CLOUD_STORAGE_URL_PREFIX,
        )

    raise ValueError("Invalid GCS URI format.")


def url_to_uri(url: str) -> str:
    if url.startswith(Constants.GOOGLE_CLOUD_STORAGE_URI_PREFIX):
        return url

    if url.startswith(Constants.GOOGLE_CLOUD_STORAGE_URL_PREFIX):
        return url.replace(
            Constants.GOOGLE_CLOUD_STORAGE_URL_PREFIX,
            Constants.GOOGLE_CLOUD_STORAGE_URI_PREFIX,
        )

    raise ValueError("Invalid GCS URL format.")


def serialize_nested_lists(elements):
    return json.dumps(
        [[element.model_dump() for element in sublist] for sublist in elements],
        indent=2,
    )


def publish_to_pubsub(data: dict, project_id: str, topic_id: str) -> str:
    """
    Enhanced version with more debugging information
    """
    orionis_log(f"Project ID: {project_id}")
    orionis_log(f"Topic ID: {topic_id}")
    orionis_log(f"Data: {data}")

    publisher = None
    try:
        # Create publisher client
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(project_id, topic_id)
        orionis_log(f"Topic path: {topic_path}")

        # Check if topic exists (optional, but helps with debugging)
        try:
            topic = publisher.get_topic(request={"topic": topic_path})
            orionis_log(f"Topic exists: {topic.name}")
        except exceptions.NotFound:
            orionis_log(f"WARNING: Topic {topic_path} might not exist")
        except Exception as e:
            orionis_log(f"Could not verify topic existence: {e}", e)

        # Prepare message
        message_data = json.dumps(data, ensure_ascii=False).encode("utf-8")
        orionis_log(f"Message size: {len(message_data)} bytes")

        # Publish with attributes for better tracking
        future = publisher.publish(
            topic_path,
            message_data,
            # Add some attributes for debugging
            source="python_publisher",
        )

        # Get the result
        message_id = future.result(timeout=30)
        orionis_log(f"SUCCESS: Message published with ID: {message_id}")
        orionis_log("=== PUBLISH DEBUG END ===")

        return message_id

    except Exception as e:
        orionis_log(f"ERROR in publish_to_pubsub_debug: {str(e)}", e)
        orionis_log(f"Error type: {type(e)}")
        raise

    finally:
        if publisher:
            publisher.transport.close()


def should_call_vertexai() -> bool:
    return True


def parse_created_at(value):
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value


def video_timestamp_to_milliseconds(timestamp_str: str) -> int:
    """Convert timestamp string in MM:SS:mmm or MM:SS format to milliseconds."""
    parts = timestamp_str.split(":")
    if len(parts) == 2:
        minutes, seconds = parts
        return (int(minutes) * 60 * 1000) + (int(seconds) * 1000)
    elif len(parts) == 3:
        minutes, seconds, milliseconds = parts
        return (int(minutes) * 60 * 1000) + (int(seconds) * 1000) + int(milliseconds)
    else:
        raise ValueError("Timestamp must be in MM:SS or MM:SS:mmm format")


def encode_string(input_string: str) -> str:
    return base64.b64encode(input_string.encode()).decode()


def parse_metadata(metadata_dict) -> str | None:
    """Helper method to parse metadata into string format."""
    if metadata_dict is None:
        return None
    try:
        if isinstance(metadata_dict, dict):
            return json.dumps(metadata_dict)
        elif isinstance(metadata_dict, str):
            return metadata_dict
        return None
    except Exception as e:
        orionis_log(f"Error parsing metadata: {e}", e)
        return None


def should_call_llm(mode: ModeType) -> bool:
    if mode == ModeType.FORMAT_BUSINESS_LOGIC:
        return True
    else:
        return False
