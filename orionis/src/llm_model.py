from typing import Dict, Any, List
import instructor
import google.generativeai as genai
from google.generativeai.types import content_types
import tenacity
import os
import mimetypes
from pathlib import Path
from constants import Constants
from utils.util import orionis_log, url_to_uri  # type: ignore
from config import config
import base64

# Alias genai classes to match the old vertexai names used throughout this file
GenerativeModel = genai.GenerativeModel
GenerationConfig = genai.GenerationConfig
Part = genai.protos.Part


class LLMModelWrapper:
    def __init__(self):
        self._is_local_storage_mode = (
            os.getenv("STORAGE_BACKEND", os.getenv("ORIONIS_BACKEND", "")).lower()
            == "local"
        )
        genai.configure(api_key=config.gemini_api_key)
        self.client = self._configure_client()
        self._max_inline_video_bytes = int(
            os.getenv("ORIONIS_MAX_INLINE_VIDEO_BYTES", "450000000")
        )

        # Use Gemini API key — no GCP project ID needed
        self.client_v2 = GenerativeModel(Constants.GEMINI_MODEL_NAME_V2)
        self.client_v3 = GenerativeModel(Constants.GEMINI_MODEL_NAME_V3)

    @staticmethod
    def _get_qai_root() -> Path:
        current = Path(__file__).resolve()
        for parent in current.parents:
            if (parent / "orionis").exists() and (parent / "pulsar").exists():
                return parent
        return current.parents[2]

    def _get_local_storage_root(self) -> Path:
        configured = os.getenv("STORAGE_LOCAL_ROOT", "")
        if configured:
            path = Path(configured).expanduser()
            return path if path.is_absolute() else (self._get_qai_root() / path)
        return self._get_qai_root() / ".qai" / "storage"

    def _resolve_local_file_for_media(self, url: str) -> Path | None:

        if url.startswith("file://"):
            file_path = Path(url[len("file://") :]).expanduser()
            return file_path if file_path.exists() else None

        direct_path = Path(url).expanduser()
        if direct_path.exists():
            return direct_path

        try:
            media_uri = url_to_uri(url)
        except Exception:
            return None

        if not media_uri.startswith("gs://"):
            return None

        uri_without_scheme = media_uri[len("gs://") :]
        if "/" not in uri_without_scheme:
            return None

        bucket_name, blob_name = uri_without_scheme.split("/", 1)
        local_path = self._get_local_storage_root() / bucket_name / blob_name
        return local_path if local_path.exists() else None

    def _build_media_part(self, url: str, default_mime_type: str) -> Part:
        if self._is_local_storage_mode:
            local_file = self._resolve_local_file_for_media(url)
            if local_file is not None:
                if default_mime_type.startswith("video/"):
                    file_size = local_file.stat().st_size
                    if file_size > self._max_inline_video_bytes:
                        raise ValueError(
                            (
                                "Local video is too large for inline Gemini request: "
                                f"{file_size} bytes (limit {self._max_inline_video_bytes}). "
                                "Trim/compress the video or use a cloud-accessible URI for LLM video input."
                            )
                        )
                mime_type = mimetypes.guess_type(str(local_file))[0] or default_mime_type
                return {"mime_type": mime_type, "data": local_file.read_bytes()}

        return {"file_data": {"mime_type": default_mime_type, "file_uri": url_to_uri(url)}}

    def _configure_client(self):
        return instructor.from_gemini(
            client=genai.GenerativeModel(model_name="models/gemini-1.5-flash-latest"),
            mode=instructor.Mode.GEMINI_JSON,
        )

    @tenacity.retry(
        stop=tenacity.stop_after_attempt(5),
        wait=tenacity.wait_exponential(multiplier=1, min=1, max=10),
        retry=tenacity.retry_if_not_exception_type(ValueError),
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
        image_parts = [self._build_media_part(url, "image/*") for url in image_urls]
        video_parts = [self._build_media_part(url, "video/*") for url in video_urls]

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
        retry=tenacity.retry_if_not_exception_type(ValueError),
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
                    {"mime_type": mime_type, "data": image_bytes}
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
