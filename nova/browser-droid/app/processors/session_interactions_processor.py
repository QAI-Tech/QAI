import os
import json
import logging
import re
import glob
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Dict, Any

import prompts

logger = logging.getLogger(__name__)


class SessionInteractionsProcessor:
    """Processor for analyzing session interactions with screenshots using LLM"""

    def __init__(self, llm_wrapper, graph_service=None):
        self.llm_wrapper = llm_wrapper
        self.graph_service = graph_service

    def process_interactions_with_screenshots(
        self,
        session_id: str,
        product_id: str,
        reset_cache: bool = False,
        session_dir: str = None,
    ) -> Dict[str, Any]:
        """
        Process each interaction with before screenshots using LLM.

        Args:
            session_id (str): Session ID for the interactions
            product_id (str): Product ID for the interactions
            reset_cache (bool): Whether to ignore cached results and reprocess
            session_dir (str): Optional session directory path, defaults to uploads/session_id

        Returns:
            Dict[str, Any]: Processing results with status and data
        """
        if not session_dir:
            session_dir = os.path.join("uploads", session_id)

        # Check if interactions.json exists
        interactions_file = os.path.join(session_dir, "interactions.json")
        if not os.path.exists(interactions_file):
            return {
                "error": f"Interactions file not found: {interactions_file}",
                "status": "error",
            }

        # Check if we should skip processing due to cache
        analysis_file_path = os.path.join(session_dir, "interaction_analysis.json")

        if os.path.exists(analysis_file_path) and not reset_cache:
            # Return existing results
            with open(analysis_file_path, "r") as f:
                existing_results = json.load(f)

            # Create graph from cached session interactions
            self._create_graph_from_session(session_id, product_id)

            return {
                "status": "completed",
                "session_id": session_id,
                "message": "Using cached interaction analysis results",
                "results_file": analysis_file_path,
                "results": existing_results,
            }

        # Load interactions
        with open(interactions_file, "r", encoding="utf-8") as f:
            interactions = json.load(f)

        screenshots_dir = os.path.join(session_dir, "screenshots")

        # Get all available screenshots for this session
        available_screenshots = []
        if os.path.exists(screenshots_dir):
            available_screenshots = [
                f for f in os.listdir(screenshots_dir) if f.endswith(".png")
            ]
            available_screenshots.sort()  # Sort by filename to maintain chronological order

        logger.info(
            f"\n\nFound {len(available_screenshots)} screenshots and {len(interactions)} interactions for session {session_id}\n\n"
        )

        # Step 1: Compress consecutive input interactions
        compressed_interactions = self._compress_consecutive_input_interactions(
            interactions
        )
        logger.info(
            f"Compressed {len(interactions)} interactions to {len(compressed_interactions)} interactions"
        )

        # Step 2: Find UI elements for compressed interactions
        results = []
        uploaded_cache: Dict[str, Any] = {}

        try:
            for i, interaction in enumerate(compressed_interactions):
                logger.info(
                    f"\n\nProcessing interaction {i+1}/{len(compressed_interactions)}"
                )

                # Extract interaction data
                interaction_type = interaction.get("interaction_type")
                pre_screenshot_path = interaction.get("pre_screenshot_path")
                coordinates = interaction.get("coordinates")

                # Prepare file paths
                before_screenshot_path = None

                if pre_screenshot_path:
                    # Convert relative path to absolute path
                    before_screenshot_path = os.path.join(
                        session_dir, pre_screenshot_path
                    )
                    if not os.path.exists(before_screenshot_path):
                        logger.warning(
                            f"Before screenshot not found: {before_screenshot_path}"
                        )
                        before_screenshot_path = None

                # Create interaction data structure
                interaction_data = {
                    "interaction_type": interaction_type,
                    "coordinates": coordinates,
                    "before_screenshot_path": before_screenshot_path,
                }

                # Detect UI element that contains the interaction coordinates
                ui_element = self._detect_ui_elements_for_interaction(
                    session_id, interaction, session_dir
                )
                interaction_data["ui_element"] = ui_element

                # Compute after_screenshot_path: next pre_screenshot or session_id_last.png
                after_ss_path = None
                if i + 1 < len(compressed_interactions):
                    candidate_path = compressed_interactions[i + 1].get(
                        "pre_screenshot_path"
                    )
                    if candidate_path:
                        # Convert relative path to absolute path
                        after_ss_path = os.path.join(session_dir, candidate_path)
                        # Check if file exists
                        if not os.path.exists(after_ss_path):
                            after_ss_path = None
                else:
                    # For the last interaction, try to use session_id_last.png
                    last_ss_path = os.path.join(
                        screenshots_dir, f"{session_id}_last.png"
                    )
                    if os.path.exists(last_ss_path):
                        after_ss_path = last_ss_path

                interaction_data["after_screenshot_path"] = after_ss_path

                results.append(interaction_data)

                logger.info(f"UI element for interaction {i+1} detected")

            # Step 3: Create interactions_ui_elements.json with UI elements data
            ui_elements_file_path = os.path.join(
                session_dir, "interactions_ui_elements.json"
            )
            try:
                # Preload all screenshot filenames
                screenshots_present = set()
                if os.path.isdir(screenshots_dir):
                    for fname in os.listdir(screenshots_dir):
                        if fname.endswith(".png"):
                            screenshots_present.add(fname)

                last_ss_name = f"{session_id}_last.png"
                last_ss_available = last_ss_name in screenshots_present

                # Create interactions_with_ui_elements from compressed interactions
                interactions_with_ui_elements = []
                for i, interaction in enumerate(compressed_interactions):
                    interaction_copy = interaction.copy()

                    # Add UI element from the results
                    if i < len(results) and "ui_element" in results[i]:
                        interaction_copy["ui_element"] = results[i]["ui_element"]
                    else:
                        interaction_copy["ui_element"] = None

                    # Compute after_screenshot_path: next pre_screenshot or session_id_last.png
                    after_ss_path = None
                    if i + 1 < len(compressed_interactions):
                        candidate_path = compressed_interactions[i + 1].get(
                            "pre_screenshot_path"
                        )
                        if candidate_path:
                            # Extract filename from path for checking existence
                            candidate_filename = os.path.basename(candidate_path)
                            if candidate_filename in screenshots_present:
                                after_ss_path = os.path.join(
                                    session_dir, candidate_path
                                )
                    else:
                        if last_ss_available:
                            after_ss_path = os.path.join(screenshots_dir, last_ss_name)

                    interaction_copy["after_screenshot_path"] = after_ss_path

                    interactions_with_ui_elements.append(interaction_copy)

                with open(ui_elements_file_path, "w", encoding="utf-8") as f:
                    json.dump(
                        interactions_with_ui_elements, f, indent=2, ensure_ascii=False
                    )
                logger.info(
                    f"Interactions with UI elements saved to: {ui_elements_file_path}"
                )
            except Exception as e:
                logger.error(f"Failed to save interactions with UI elements: {e}")

            # Step 4: Process LLM analysis for all compressed interactions
            logger.info("\n\nStarting LLM analysis for all interactions...")
            for i, interaction_data in enumerate(results):
                logger.info(f"\nProcessing LLM for interaction {i+1}/{len(results)}")
                # Skip if before screenshot missing
                if not interaction_data.get("before_screenshot_path"):
                    logger.warning(
                        f"Skipping LLM for interaction {i+1}: before screenshot missing"
                    )
                    continue
                # Call LLM for analysis using the detected UI element
                llm_result = self._call_llm_for_interaction(
                    interaction_data, i + 1, uploaded_cache
                )
                interaction_data["llm_analysis"] = llm_result

            # Save complete results to file
            self._save_interaction_analysis_to_file(results, session_id)

            # Create graph from session interactions
            self._create_graph_from_session(session_id, product_id)

            return {
                "status": "completed",
                "session_id": session_id,
                "message": f"Successfully processed {len(results)} interactions",
                "total_interactions_processed": len(results),
                "results": results,
            }

        finally:
            # Clean up all uploaded files after full processing
            self.llm_wrapper.cleanup_cache(uploaded_cache)

    def _detect_ui_elements_for_interaction(
        self,
        session_id: str,
        interaction: Dict[str, Any],
        session_dir: str = None,
    ) -> List[Dict[str, Any]]:
        """
        Detect UI elements that contain the interaction coordinates from XML hierarchy.

        Args:
            session_id (str): Session ID
            interaction (Dict[str, Any]): Interaction data from interactions.json
            session_dir (str): Optional session directory path

        Returns:
            List[Dict[str, Any]]: List of UI elements that contain the coordinates
        """
        if not session_dir:
            session_dir = os.path.join("uploads", session_id)

        try:
            # Get coordinates from interaction
            coordinates = interaction.get("coordinates")
            if not coordinates or len(coordinates) < 2:
                logger.warning(
                    f"No valid coordinates found in interaction: {coordinates}"
                )
                return []

            click_x, click_y = coordinates[0], coordinates[1]

            # Get XML hierarchy path from interaction
            xml_hierarchy_path = interaction.get("xml_hierarchy_path")
            if not xml_hierarchy_path:
                logger.warning(f"No XML hierarchy path found in interaction")
                return []

            # Load XML hierarchy file
            xml_filepath = os.path.join(session_dir, xml_hierarchy_path)
            if not os.path.exists(xml_filepath):
                logger.warning(f"XML hierarchy file not found: {xml_filepath}")
                return []

            # Parse XML and find elements containing coordinates
            with open(xml_filepath, "r", encoding="utf-8") as f:
                xml_content = f.read()

            root = ET.fromstring(xml_content)
            containing_elements = []

            def find_all_containing_elements(node, path=""):
                """Recursively find all elements that contain the click coordinates"""
                elements = []

                # Check this node first
                bounds_attr = node.get("bounds")
                if bounds_attr:
                    # Parse bounds: [x1,y1][x2,y2]
                    bounds_match = re.match(
                        r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds_attr
                    )
                    if bounds_match:
                        x1, y1, x2, y2 = map(int, bounds_match.groups())

                        # Check if coordinates are within this element's bounds
                        if x1 <= click_x <= x2 and y1 <= click_y <= y2:
                            # Create element data with all attributes
                            element_data = {
                                "path": path,
                                "bounds": {
                                    "x1": x1,
                                    "y1": y1,
                                    "x2": x2,
                                    "y2": y2,
                                },
                            }

                            # Add only relevant attributes from the XML node
                            # Note: Compressed mode may have fewer attributes available
                            relevant_attrs = [
                                "text",
                                "class",
                                "content-desc",
                                "clickable",
                                "enabled",
                                "visible",
                                "focusable",
                                "scrollable",
                                "long-clickable",
                                "checkable",
                                "checked",
                                "password",
                                "selected",
                                "hint",
                                "index",  # Add index for tie-breaking
                            ]
                            for attr_name, attr_value in node.attrib.items():
                                if attr_name in relevant_attrs:
                                    element_data[attr_name] = attr_value

                            elements.append(element_data)

                # Then check all children
                for i, child in enumerate(node):
                    child_path = (
                        f"{path}/{child.tag}[{i}]" if path else f"{child.tag}[{i}]"
                    )
                    child_elements = find_all_containing_elements(child, child_path)
                    elements.extend(child_elements)

                return elements

            # Start recursive search
            all_elements = find_all_containing_elements(root)

            if all_elements:
                # Find the element with the longest path (deepest nesting)
                max_depth = max(
                    len(elem.get("path", "").split("/")) for elem in all_elements
                )
                deepest_elements = [
                    elem
                    for elem in all_elements
                    if len(elem.get("path", "").split("/")) == max_depth
                ]

                if len(deepest_elements) > 1:
                    # If tie, pick the one with highest index
                    logger.info(
                        f"Tie detected between {len(deepest_elements)} elements, using index-based tie-breaking"
                    )
                    for elem in deepest_elements:
                        index = int(elem.get("index", -1))
                        logger.info(
                            f"  Element: {elem.get('class', 'Unknown')} - Index: {index}"
                        )

                    deepest_element = max(
                        deepest_elements,
                        key=lambda x: int(x.get("index", -1)),
                    )
                    logger.info(
                        f"Selected element: {deepest_element.get('class', 'Unknown')} with index {deepest_element.get('index', 'Unknown')}"
                    )
                else:
                    deepest_element = deepest_elements[0]

                # Remove path from final output since it's only needed for computation
                if "path" in deepest_element:
                    del deepest_element["path"]
                return deepest_element  # Return as single object
            else:
                logger.error(
                    f"No elements found containing coordinates ({click_x}, {click_y})"
                )
                return []

        except Exception as e:
            logger.error(f"Error detecting UI elements for interaction: {e}")
            return []

    def _call_llm_for_interaction(
        self,
        interaction_data: Dict[str, Any],
        interaction_number: int,
        uploaded_cache: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Call LLM for a single interaction analysis.

        Args:
            interaction_data: The interaction data containing coordinates, UI element, etc.
            interaction_number: The interaction number for logging
            uploaded_cache: Cache of uploaded files to avoid re-uploading

        Returns:
            Dict containing the LLM analysis result or error
        """
        try:
            # Extract data from interaction_data
            interaction_type = interaction_data.get("interaction_type")
            coordinates = interaction_data.get("coordinates")
            ui_element = interaction_data.get("ui_element")
            before_screenshot_path = interaction_data.get("before_screenshot_path")
            after_screenshot_path = interaction_data.get("after_screenshot_path")

            # Check if we have valid coordinates
            has_valid_data = coordinates and len(coordinates) >= 2

            # Construct input data JSON object only if all conditions are met
            if has_valid_data:
                input_data = {
                    "interaction_type": interaction_type,
                    "interaction_coordinates": coordinates,
                }
                # Add UI element if available
                if ui_element:
                    input_data["ui_element"] = ui_element
            else:
                logger.warning(
                    f"Invalid coordinates for interaction {interaction_number}: Coordinates: {coordinates}"
                )
                input_data = None

            # Prepare the prompt with input data
            prompt_with_interaction = (
                prompts.ANALYZE_INTERACTIONS_WITH_SCREENSHOTS_PROMPT.replace(
                    "{{input_data}}", json.dumps(input_data, indent=2)
                )
            )

            # Prepare files list for LLM wrapper
            files = []
            if before_screenshot_path and os.path.exists(before_screenshot_path):
                files.append(before_screenshot_path)
            if after_screenshot_path and os.path.exists(after_screenshot_path):
                files.append(after_screenshot_path)

            logger.info(
                f"\n{'='*80}\nGenerating analysis for interaction {interaction_number}...\n{'='*80}"
            )

            # Use LLM wrapper to make the call with caching
            response = self.llm_wrapper.call_llm(
                prompt=prompt_with_interaction,
                files=files,
                uploaded_cache=uploaded_cache,
            )

            logger.info(
                f"Analysis response received for interaction {interaction_number}"
            )

            # Parse the JSON response
            try:
                parsed_response = json.loads(response)
                return parsed_response
            except json.JSONDecodeError as e:
                logger.error(
                    f"Failed to parse JSON response for interaction {interaction_number}: {e}"
                )
                logger.error(f"Raw response: {response}")
                # Return error result
                return {
                    "error": f"Failed to parse JSON response: {e}",
                    "raw_response": response,
                }

        except Exception as e:
            logger.error(
                f"Error during LLM analysis for interaction {interaction_number}: {e}"
            )
            return {
                "error": f"LLM analysis failed: {str(e)}",
            }

    def _save_interaction_analysis_to_file(
        self,
        results: List[Dict[str, Any]],
        session_id: str,
    ):
        """Save interaction analysis results to a JSON file"""
        # Determine output directory
        output_dir = os.path.join("uploads", session_id)
        os.makedirs(output_dir, exist_ok=True)

        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"interaction_analysis.json"
        output_path = os.path.join(output_dir, output_filename)

        # Prepare the aggregated result
        aggregated_result = {
            "session_id": session_id,
            "analysis_timestamp": timestamp,
            "total_interactions_processed": len(results),
            "interactions": results,
        }

        # Write analysis JSON to file
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(aggregated_result, f, indent=2, ensure_ascii=False)

        logger.info(f"Interaction analysis saved to: {output_path}")
        logger.info(f"Processed {len(results)} interactions")

    def _compress_consecutive_input_interactions(
        self, interactions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Compress consecutive input interactions into single interactions.

        Args:
            interactions: List of interaction dictionaries

        Returns:
            List of interactions with consecutive inputs compressed
        """
        compressed_interactions = []
        i = 0
        while i < len(interactions):
            current_interaction = interactions[i]

            # If this is an input interaction, check for consecutive inputs
            if current_interaction.get("interaction_type") == "input":
                # Find all consecutive input interactions with the same XML hierarchy
                consecutive_inputs = [current_interaction]
                j = i + 1
                while (
                    j < len(interactions)
                    and interactions[j].get("interaction_type") == "input"
                    and interactions[j].get("xml_hierarchy_path")
                    == current_interaction.get("xml_hierarchy_path")
                ):
                    consecutive_inputs.append(interactions[j])
                    j += 1

                # Compress consecutive inputs into a single interaction
                if len(consecutive_inputs) > 1:
                    compressed_interaction = consecutive_inputs[0].copy()

                    # Combine text and handle backspace
                    combined_text = ""
                    for input_interaction in consecutive_inputs:
                        text = input_interaction.get("text", "")
                        keycode = input_interaction.get("keycode")

                        if keycode == 67:  # Backspace keycode
                            combined_text = combined_text[:-1] if combined_text else ""
                        else:
                            combined_text += text

                    compressed_interaction["text"] = combined_text
                    compressed_interaction["compression_metadata"] = {
                        "original_count": len(consecutive_inputs),
                        "original_indices": list(range(i, j)),
                    }

                    compressed_interactions.append(compressed_interaction)
                    i = j  # Skip the processed consecutive inputs
                else:
                    # Single input interaction, no compression needed
                    compressed_interactions.append(current_interaction)
                    i += 1
            else:
                # Non-input interaction, add as-is
                compressed_interactions.append(current_interaction)
                i += 1

        return compressed_interactions

    def _create_graph_from_session(self, session_id: str, product_id: str) -> None:
        """Create a graph from session interactions if graph service is available"""
        if self.graph_service:
            try:
                logger.info(
                    f"Creating graph from session interactions for {session_id}"
                )

                graph_result = self.graph_service.create_graph_json_from_session(
                    session_id, product_id
                )

                if graph_result.get("status") != "success":
                    logger.warning(
                        f"Graph creation failed: {graph_result.get('error', 'Unknown error')}"
                    )

            except Exception as e:
                logger.error(f"Error creating graph from session: {e}")
        else:
            logger.info("Graph service not provided, skipping graph creation")
