from typing import Dict, Any, List
import instructor
import google.generativeai as genai
import tenacity
import vertexai
from vertexai.generative_models import GenerativeModel, Part, GenerationConfig
from constants import Constants
from utils.util import orionis_log, url_to_uri  # type: ignore
from config import config
import base64


class LLMModelWrapper:
    def __init__(self):
        genai.configure(api_key=config.gemini_api_key)
        self.client = self._configure_client()

        # Initialize Vertex AI
        vertexai.init(project=config.gcp_project_id)
        self.client_v2 = GenerativeModel(Constants.GEMINI_MODEL_NAME_V2)
        self.client_v3 = GenerativeModel(Constants.GEMINI_MODEL_NAME_V3)

    def _configure_client(self):
        return instructor.from_gemini(
            client=genai.GenerativeModel(model_name="models/gemini-1.5-flash-latest"),
            mode=instructor.Mode.GEMINI_JSON,
        )

    @tenacity.retry(
        stop=tenacity.stop_after_attempt(5),
        wait=tenacity.wait_exponential(multiplier=1, min=1, max=10),
        before=lambda retry_state: orionis_log(
            f"Retrying LLM call, attempt: {retry_state.attempt_number}"
        ),
        after=lambda retry_state: orionis_log(
            f"Retry attempt {retry_state.attempt_number} failed with exception: {retry_state.outcome.exception() if retry_state.outcome else 'None'}"
        ),
    )
    def call_llm_v3(
        self,
        prompt: str,
        image_urls: List[str] = [],
        video_urls: List[str] = [],
        response_schema: Dict[str, Any] = {
            "type": "object",
            "properties": {"message": {"type": "string"}},
            "required": ["message"],
        },
    ) -> str:
        # Convert URLs to URIs for internal processing
        image_parts = [
            Part.from_uri(url_to_uri(url), mime_type="image/*") for url in image_urls
        ]
        video_parts = [
            Part.from_uri(url_to_uri(url), mime_type="video/*") for url in video_urls
        ]

        content = [prompt] + image_parts + video_parts

        # TODO: fix the type mismatch
        response = self.client_v3.generate_content(
            content,  # type: ignore
            generation_config=GenerationConfig(
                temperature=0,  # Deterministic output for consistency
                response_mime_type="application/json",
                response_schema=response_schema,
            ),
        )

        return response.text

    @tenacity.retry(
        stop=tenacity.stop_after_attempt(5),
        wait=tenacity.wait_exponential(multiplier=1, min=1, max=10),
        before=lambda retry_state: orionis_log(
            f"Retrying LLM call (base64), attempt: {retry_state.attempt_number}"
        ),
        after=lambda retry_state: orionis_log(
            f"Retry attempt {retry_state.attempt_number} failed with exception: {retry_state.outcome.exception() if retry_state.outcome else 'None'}"
        ),
    )
    def call_llm_v3_base64(
        self,
        prompt: str,
        image_base64_list: List[str] = [],
        response_schema: Dict[str, Any] = {
            "type": "object",
            "properties": {"message": {"type": "string"}},
            "required": ["message"],
        },
    ) -> str:
        """
        Call Gemini LLM with base64-encoded images or data URLs instead of standard URLs.
        Supports entries like "data:image/jpeg;base64,<payload>" or raw base64 payloads.
        """

        def _detect_mime_from_bytes(b: bytes) -> str:
            if b.startswith(b"\xff\xd8\xff"):
                return "image/jpeg"
            if b.startswith(b"\x89PNG\r\n\x1a\n"):
                return "image/png"
            if b.startswith(b"GIF87a") or b.startswith(b"GIF89a"):
                return "image/gif"
            if b.startswith(b"RIFF") and b[8:12] == b"WEBP":
                return "image/webp"
            return "image/*"

        base64_parts: List[Part] = []
        for i, item in enumerate(image_base64_list):
            try:
                mime_type = "image/*"
                payload = item
                if item.startswith("data:"):
                    header, payload = item.split(",", 1)
                    if ";base64" in header:
                        mime_type = header[5 : header.index(";base64")]
                    else:
                        mime_type = header[5:]

                image_bytes = base64.b64decode(payload)
                if mime_type == "image/*":
                    mime_type = _detect_mime_from_bytes(image_bytes)

                base64_parts.append(
                    Part.from_data(data=image_bytes, mime_type=mime_type)
                )
            except Exception as e:
                orionis_log(f"Failed to decode/process base64 image {i}:", e)
                raise e

        content = [prompt] + base64_parts

        response = self.client_v3.generate_content(
            content,  # type: ignore
            generation_config=GenerationConfig(
                temperature=0,  # Deterministic output for consistency
                response_mime_type="application/json",
                response_schema=response_schema,
            ),
        )

        return response.text
