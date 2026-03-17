import google.generativeai as genai
import os
import json
import logging
import re
import time
from datetime import datetime
from typing import List, Dict, Any

import prompts

logger = logging.getLogger(__name__)


class LLMWrapper:
    """Wrapper for Google Gemini API operations"""

    def __init__(self, api_key: str = None, model_name: str = "gemini-2.5-flash"):
        self.api_key = api_key or os.getenv("REMOVED")
        self.model_name = model_name
        self.model = None
        self._configure_api()

    def _configure_api(self):
        """Configure the Gemini API with the provided API key"""
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel(self.model_name)

    def generate_audio_transcription(
        self,
        session_id: str,
        file_path: str,
        save_to_file: bool = True,
    ):
        """
        Generate a transcription of an audio file using Google's Gemini API.

        Args:
            file_path (str): Path to the audio file to analyze
            save_to_file (bool): Whether to save the result to a text file
            session_id (str): Session ID to save transcription in uploads/session_id folder. If None, saves to downloads folder

        Returns:
            str: The generated transcription text

        Raises:
            FileNotFoundError: If the audio file doesn't exist
            Exception: For other API or processing errors
        """
        # Check if file exists
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Audio file not found: {file_path}")

        try:
            # Step 1: Upload the audio file using the Files API
            logger.info(f"Uploading file: {file_path}...")
            uploaded_file = genai.upload_file(path=file_path)
            logger.info(f"File uploaded. File ID: {uploaded_file.name}")

            # Step 3: Call the model to generate the content
            logger.info("Generating transcription...")
            response = self.model.generate_content(
                [prompts.TRANSCRIBE_AUDIO_PROMPT, uploaded_file]
            )

            # Step 4: Get the transcription text
            if hasattr(response, "text"):
                transcription_text = response.text
                logger.info("Transcription successful")
            else:
                logger.info(f"Response content: {response}")
                transcription_text = str(response)

            # Step 5: Clean the transcription text (remove markdown code block syntax)
            transcription_text = self._clean_llm_response_text(transcription_text)

            # Step 6: Clean up by deleting the uploaded file
            genai.delete_file(uploaded_file.name)
            logger.info(f"File {uploaded_file.name} deleted.")

            # Save to file if requested
            if save_to_file:
                self._save_transcription_to_file(
                    transcription_text, session_id, file_path
                )

            return transcription_text

        except Exception as e:
            logger.error(f"An error occurred: {type(e)}")
            raise Exception(f"Error transcribing audio file: {e}")

    def detect_transitions_from_transcripted_intervals(
        self,
        session_id: str,
        intervals_data: List[Dict[str, Any]],
    ):
        """
        Detect transitions from transcripted intervals using LLM analysis.

        Args:
            session_id (str): Session ID for saving results
            intervals_data (List[Dict[str, Any]]): Array of interval data, each containing:
                - transcript_lines: List[str] - Array of transcription lines for the interval
                - before_screenshot: str - Path to screenshot before the interval (optional)
                - after_screenshot: str - Path to screenshot after the interval (optional)

        Returns:
            List[Dict[str, Any]]: Array of transition analysis results
        """
        try:
            # Validate inputs
            if not intervals_data:
                logger.warning("No intervals data provided, returning empty result")
                return []

            all_results = []

            # Process each interval
            for i, interval in enumerate(intervals_data):
                logger.info(f"Processing interval {i+1}/{len(intervals_data)}")

                transcript_lines = interval.get("transcript_lines", [])
                before_screenshot = interval.get("before_screenshot")
                after_screenshot = interval.get("after_screenshot")

                # Validate interval data
                if not transcript_lines:
                    logger.warning(f"No transcript lines for interval {i+1}, skipping")
                    continue

                # Check if screenshots exist (they're optional)
                if before_screenshot and not os.path.exists(before_screenshot):
                    logger.warning(
                        f"Before screenshot not found for interval {i+1}: {before_screenshot}"
                    )
                    before_screenshot = None

                if after_screenshot and not os.path.exists(after_screenshot):
                    logger.warning(
                        f"After screenshot not found for interval {i+1}: {after_screenshot}"
                    )
                    after_screenshot = None

                uploaded_files = []

                try:
                    # Upload screenshots if they exist
                    if before_screenshot:
                        logger.info(
                            f"Uploading before screenshot for interval {i+1}: {before_screenshot}..."
                        )
                        before_file = genai.upload_file(path=before_screenshot)
                        uploaded_files.append(before_file)
                        logger.info(
                            f"Before screenshot uploaded. File ID: {before_file.name}"
                        )

                    if after_screenshot:
                        logger.info(
                            f"Uploading after screenshot for interval {i+1}: {after_screenshot}..."
                        )
                        after_file = genai.upload_file(path=after_screenshot)
                        uploaded_files.append(after_file)
                        logger.info(
                            f"After screenshot uploaded. File ID: {after_file.name}"
                        )

                    # Prepare the prompt with transcript lines
                    transcript_text = "\n".join(transcript_lines)
                    prompt_with_transcript = f"{prompts.ANALYZE_TRANSCRIPTED_INTERVALS_PROMPT}\n\nTranscript lines:\n{transcript_text}"

                    # Prepare LLM input
                    llm_input = [prompt_with_transcript]
                    llm_input.extend(uploaded_files)

                    logger.info(f"Generating transition analysis for interval {i+1}...")
                    response = self.model.generate_content(llm_input)

                    logger.info(
                        f"Transition analysis response received for interval {i+1}"
                    )

                    # Extract text content from response object
                    response_text = (
                        response.text if hasattr(response, "text") else str(response)
                    )

                    # Clean the response
                    cleaned_response = self._clean_llm_response_text(response_text)

                    # Parse the JSON response
                    try:
                        parsed_response = json.loads(cleaned_response)
                        interval_result = {
                            "interval_index": i,
                            "transcript_lines": transcript_lines,
                            "before_screenshot": before_screenshot,
                            "after_screenshot": after_screenshot,
                            "transition_analysis": parsed_response,
                        }
                        all_results.append(interval_result)
                    except json.JSONDecodeError as e:
                        logger.error(
                            f"Failed to parse JSON response for interval {i+1}: {e}"
                        )
                        logger.error(f"Raw response: {cleaned_response}")
                        # Add error result
                        interval_result = {
                            "interval_index": i,
                            "transcript_lines": transcript_lines,
                            "before_screenshot": before_screenshot,
                            "after_screenshot": after_screenshot,
                            "error": f"Failed to parse JSON response: {e}",
                            "raw_response": cleaned_response,
                        }
                        all_results.append(interval_result)

                finally:
                    # Clean up uploaded files
                    for uploaded_file in uploaded_files:
                        try:
                            genai.delete_file(uploaded_file.name)
                            logger.info(f"File {uploaded_file.name} deleted.")
                        except Exception as e:
                            logger.warning(
                                f"Failed to delete file {uploaded_file.name}: {e}"
                            )

            # Save aggregated results to file
            self._save_transcripted_intervals_analysis_to_file(all_results, session_id)

            return all_results

        except Exception as e:
            logger.error(
                f"An error occurred during transcripted intervals analysis: {type(e)}"
            )
            raise Exception(f"Error in transcripted intervals analysis: {e}")

    def generate_transition_analysis(
        self,
        session_id: str,
        video_path: str,
        image_paths: List[str] = [],
    ):

        # Validate inputs
        if not video_path:
            raise ValueError("video_path must be provided")

        # Check if files exist
        uploaded_files = []
        try:
            # Upload video file if provided
            if video_path:
                if not os.path.exists(video_path):
                    raise FileNotFoundError(f"Video file not found: {video_path}")

                logger.info(f"Uploading video file: {video_path}...")
                video_file = genai.upload_file(path=video_path)
                uploaded_files.append(video_file)
                logger.info(
                    f"Video file uploaded. File ID: {video_file.name}, current state: {video_file.state.name}"
                )
                time.sleep(5)

            # Upload image files if provided
            if image_paths and len(image_paths) > 0:
                for i, image_path in enumerate(image_paths):
                    if not os.path.exists(image_path):
                        raise FileNotFoundError(f"Image file not found: {image_path}")
                    logger.info(
                        f"Uploading image file {i+1}/{len(image_paths)}: {image_path}..."
                    )
                    image_file = genai.upload_file(path=image_path)
                    uploaded_files.append(image_file)
                    logger.info(f"Image file uploaded. File ID: {image_file.name}")

            llm_input = [prompts.ANALYZE_TRANSITION_PROMPT]
            llm_input.extend(uploaded_files)

            logger.info("Generating transition analysis...")
            response = self.model.generate_content(llm_input)

            logger.info(f"Transition analysis response received")

            # Extract text content from response object
            response_text = (
                response.text if hasattr(response, "text") else str(response)
            )

            self._save_transition_analysis_to_file(
                self._clean_llm_response_text(response_text), video_path
            )

            return response

        except Exception as e:
            logger.error(f"An error occurred during multimodal analysis: {type(e)}")
            raise Exception(f"Error in multimodal analysis: {e}")

        finally:
            # Clean up uploaded files
            for uploaded_file in uploaded_files:
                try:
                    genai.delete_file(uploaded_file.name)
                    logger.info(f"File {uploaded_file.name} deleted.")
                except Exception as e:
                    logger.warning(f"Failed to delete file {uploaded_file.name}: {e}")

    def call_llm(
        self,
        prompt: str,
        files: List[str] = None,
        uploaded_cache: Dict[str, Any] = None,
    ):
        """
        Generic LLM call function that can handle different types of LLM operations.

        Args:
            prompt (str): The prompt to send to the LLM
            files (List[str]): Optional list of file paths to upload and include
            uploaded_cache (Dict[str, Any]): Optional cache of uploaded files to avoid re-uploading

        Returns:
            The LLM response
        """
        uploaded_files = []
        try:
            # Upload files if provided
            if files:
                for file_path in files:
                    if uploaded_cache and file_path in uploaded_cache:
                        # Reuse cached upload
                        uploaded_file = uploaded_cache[file_path]
                        logger.info(
                            f"Reusing cached upload: {file_path} -> {uploaded_file.name}"
                        )
                    else:
                        # Upload new file
                        if os.path.exists(file_path):
                            uploaded_file = genai.upload_file(path=file_path)
                            logger.info(
                                f"File uploaded: {file_path} -> {uploaded_file.name}"
                            )

                            # Cache the upload if cache is provided
                            if uploaded_cache is not None:
                                uploaded_cache[file_path] = uploaded_file
                        else:
                            logger.warning(f"File not found: {file_path}")
                            continue

                    uploaded_files.append(uploaded_file)

            # Prepare LLM input
            llm_input = [prompt]
            llm_input.extend(uploaded_files)

            # Generate content
            response = self.model.generate_content(llm_input)

            # Extract text content
            response_text = (
                response.text if hasattr(response, "text") else str(response)
            )

            # Clean the response
            cleaned_response = self._clean_llm_response_text(response_text)

            return cleaned_response

        except Exception as e:
            logger.error(f"Error in LLM call: {e}")
            raise Exception(f"LLM call failed: {e}")

        finally:
            # Only clean up files that aren't cached (to avoid deleting cached files prematurely)
            for uploaded_file in uploaded_files:
                # Check if this file is in the cache
                is_cached = uploaded_cache and any(
                    cached_file == uploaded_file
                    for cached_file in uploaded_cache.values()
                )

                if not is_cached:
                    try:
                        genai.delete_file(uploaded_file.name)
                        logger.info(f"File {uploaded_file.name} deleted.")
                    except Exception as e:
                        logger.warning(
                            f"Failed to delete file {uploaded_file.name}: {e}"
                        )

    def _clean_llm_response_text(self, text: str) -> str:
        """Clean LLM response text by removing markdown code block syntax"""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]  # Remove "```json"
        if text.startswith("```"):
            text = text[3:]  # Remove "```"
        if text.endswith("```"):
            text = text[:-3]  # Remove trailing "```"
        return text.strip()

    def cleanup_file(self, file_name: str):
        """Clean up a specific uploaded file"""
        try:
            genai.delete_file(file_name)
            logger.info(f"File {file_name} deleted.")
        except Exception as e:
            logger.warning(f"Failed to delete file {file_name}: {e}")

    def cleanup_cache(self, uploaded_cache: Dict[str, Any]):
        """Clean up all files in the uploaded cache"""
        if not uploaded_cache:
            return

        for file_path, uploaded_file in uploaded_cache.items():
            try:
                genai.delete_file(uploaded_file.name)
                logger.info(f"File {uploaded_file.name} (from {file_path}) deleted.")
            except Exception as e:
                logger.warning(
                    f"Failed to delete file {uploaded_file.name} (from {file_path}): {e}"
                )

        # Clear the cache
        uploaded_cache.clear()

    def _save_transcription_to_file(
        self, transcription: str, session_id: str, file_path: str
    ):
        """Save transcription to a JSON file"""
        # Determine output directory
        if session_id:
            output_dir = os.path.join("uploads", session_id)
            os.makedirs(output_dir, exist_ok=True)
        else:
            # Create downloads directory if it doesn't exist
            output_dir = "downloads"
            os.makedirs(output_dir, exist_ok=True)

        # Generate filename with timestamp
        base_filename = os.path.splitext(os.path.basename(file_path))[0]
        output_filename = f"{base_filename}_transcription.json"
        output_path = os.path.join(output_dir, output_filename)

        # Write transcription JSON to file
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(transcription)

        logger.info(f"Transcription saved to: {output_path}")

    def _save_transition_analysis_to_file(
        self,
        response: str,
        video_path: str,
    ):
        """Save transition analysis to a JSON file"""
        output_dir = os.path.dirname(video_path)
        os.makedirs(output_dir, exist_ok=True)

        video_name = os.path.splitext(os.path.basename(video_path))[0]

        output_filename = f"transition_analysis_{video_name}.json"
        output_path = os.path.join(output_dir, output_filename)

        # Write analysis JSON to file
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(response)

        logger.info(f"Transition analysis saved to: {output_path}")

    def _save_transcripted_intervals_analysis_to_file(
        self,
        results: List[Dict[str, Any]],
        session_id: str,
    ):
        """Save aggregated transcripted intervals analysis to a JSON file"""
        # Determine output directory
        output_dir = os.path.join("uploads", session_id)
        os.makedirs(output_dir, exist_ok=True)

        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = "transitions.json"
        output_path = os.path.join(output_dir, output_filename)

        # Prepare the aggregated result
        aggregated_result = {
            "session_id": session_id,
            "analysis_timestamp": timestamp,
            "total_intervals_processed": len(results),
            "intervals": results,
        }

        # Write analysis JSON to file
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(aggregated_result, f, indent=2, ensure_ascii=False)

        logger.info(
            f"Aggregated transcripted intervals analysis saved to: {output_path}"
        )
        logger.info(f"Processed {len(results)} intervals")

    def describe_transition_action(
        self,
        before_image_path: str,
        after_image_path: str,
        action: Dict[str, Any],
        is_web: bool = False,
    ) -> Dict[str, Any]:
        """
        Generate edge description for a transition between two screens.

        Args:
            before_image_path: Path to annotated before screenshot (with bounding box)
            after_image_path: Path to after screenshot
            action: Action context dict with summary, type, details
            is_web: Whether this is a web recorder capture (True) or BrowserDroid (False)

        Returns:
            Dict with formatted_description and meta_logic
        """
        uploaded_files = []
        try:
            import google.generativeai as genai

            # Upload before screenshot
            if before_image_path and os.path.exists(before_image_path):
                logger.info(f"Uploading before screenshot: {before_image_path}")
                before_file = genai.upload_file(path=before_image_path)
                uploaded_files.append(before_file)

            # Upload after screenshot
            if after_image_path and os.path.exists(after_image_path):
                logger.info(f"Uploading after screenshot: {after_image_path}")
                after_file = genai.upload_file(path=after_image_path)
                uploaded_files.append(after_file)

            if not uploaded_files:
                logger.warning("No screenshots available for LLM analysis")
                return {
                    "formatted_description": "",
                    "meta_logic": "No screenshots available for analysis",
                }

            # Prepare action context for prompt
            action_summary = action.get("summary", "")
            action_type = action.get("type", "")
            action_context = f"{action_type.upper()}: {action_summary}" if action_summary else action_type.upper()

            # Use web-specific prompt for web recorder, mobile prompt for BrowserDroid
            prompt_template = prompts.WEB_EDGE_DESCRIPTION_PROMPT if is_web else prompts.EDGE_DESCRIPTION_PROMPT
            prompt = prompt_template.format(action_context=action_context)

            # Prepare LLM input
            llm_input = [prompt]
            llm_input.extend(uploaded_files)

            logger.info("Generating edge description via LLM...")
            response = self.model.generate_content(llm_input)

            # Parse response
            if hasattr(response, "text"):
                response_text = response.text
                cleaned_response = self._clean_llm_response_text(response_text)

                # Normalize curly/smart quotes to straight quotes for valid JSON
                cleaned_response = cleaned_response.replace('"', '"').replace('"', '"')
                cleaned_response = cleaned_response.replace(''', "'").replace(''', "'")

                try:
                    result = json.loads(cleaned_response)
                    return {
                        "formatted_description": result.get("formatted_description", ""),
                        "meta_logic": result.get("meta_logic", ""),
                    }
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse LLM response as JSON: {e}")
                    # Try to extract description from raw text
                    description = self._extract_description_fallback(cleaned_response)
                    return {
                        "formatted_description": description,
                        "meta_logic": "Auto-generated from LLM response (JSON parse failed)",
                    }

            return {
                "formatted_description": "",
                "meta_logic": "No response from LLM",
            }

        except Exception as e:
            logger.error(f"LLM analysis failed: {e}")
            return {
                "formatted_description": "",
                "meta_logic": f"LLM analysis failed: {str(e)}",
            }

        finally:
            # Clean up uploaded files
            for uploaded_file in uploaded_files:
                try:
                    genai.delete_file(uploaded_file.name)
                    logger.info(f"File {uploaded_file.name} deleted.")
                except Exception as e:
                    logger.warning(f"Failed to delete file {uploaded_file.name}: {e}")

    def _extract_description_fallback(self, text: str) -> str:
        """Try to extract description from malformed JSON or raw text"""
        # Try to find "formatted_description": "..." pattern (new format)
        match = re.search(r'"formatted_description"\s*:\s*"([^"]*)"', text)
        if match:
            return match.group(1).strip()

        # Try to find 'formatted_description': '...' pattern (single quotes)
        match = re.search(r"'formatted_description'\s*:\s*'([^']*)'", text)
        if match:
            return match.group(1).strip()

        # Return first 200 chars as fallback
        return text[:200].strip() if text else ""
