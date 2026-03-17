"""
GraphAgent for blind run post-processing (browser-use version).

Produces graph_blind.json with nodes (screen states) and edges (actions)
from blind run log data and screenshots.

Uses browser-use's LLM interface (BaseChatModel with UserMessage/ContentPartImageParam).
"""

import asyncio
import base64
import io
import json
import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("nova")

INITIAL_SCREEN_PROMPT = """You are analyzing a web browser screenshot. This is the initial screen state before any test actions were performed.

Provide a concise 1-3 word name for this screen.
Examples: "Home Page", "Login", "Dashboard", "Search", "Settings"

Respond in this exact JSON format:
{"screen_name": "<1-3 word screen name>"}"""

STEP_ANALYSIS_PROMPT = """You are analyzing a UI test step on a web application.

You are given:
1. BEFORE screenshot: the screen state before the action
2. AFTER screenshot: the screen state after the action
3. The action that was executed
4. The agent's reasoning

Action executed:
{action}

Agent reasoning:
{reasoning}

Provide:
- screen_name: A concise 1-3 word name for the AFTER screen (e.g. "Home Page", "Settings", "Login Form", "Search Results")
- edge_description: A short professional description (max 10-15 words) of the action performed (e.g. "Click on Settings button", "Enter email in login field", "Scroll down to view results")

Respond in this exact JSON format:
{{"screen_name": "<1-3 word screen name>", "edge_description": "<10-15 word action description>"}}"""

STEP_ANALYSIS_NO_IMAGES_PROMPT = """You are analyzing a UI test step on a web application.

Action executed:
{action}

Agent reasoning:
{reasoning}

Provide:
- screen_name: A concise 1-3 word name for the screen after this action (e.g. "Home Page", "Settings", "Login Form", "Search Results")
- edge_description: A short professional description (max 10-15 words) of the action performed (e.g. "Click on Settings button", "Enter email in login field", "Scroll down to view results")

Respond in this exact JSON format:
{{"screen_name": "<1-3 word screen name>", "edge_description": "<10-15 word action description>"}}"""


class GraphAgent:
    """
    Post-execution agent that generates a graph representation of a blind run.

    Each node represents a screen state (with screenshot + LLM-generated description).
    Each edge represents an action transitioning between screen states.

    Uses browser-use's LLM interface (BaseChatModel) with UserMessage for multimodal.
    """

    def __init__(
        self,
        llm,
        blind_run_log: List[Dict[str, Any]],
        screenshot_bytes_list: List[Optional[bytes]],
    ):
        """
        Args:
            llm: browser-use BaseChatModel instance (e.g. ChatGoogle),
                 or a dict with {model, api_key, temperature} to create a fresh instance.
            blind_run_log: List of blind run log entries.
            screenshot_bytes_list: List of screenshot PNG bytes, one per step.
        """
        self._llm_config = None
        if isinstance(llm, dict):
            # Store config to create fresh LLM in new event loop
            self._llm_config = llm
            self.llm = None
        else:
            self.llm = llm
        self.blind_run_log = blind_run_log
        self.screenshot_bytes_list = screenshot_bytes_list
        self._run_id = str(uuid.uuid4())[:8]

    def _create_fresh_llm(self):
        """Create a fresh ChatGoogle instance for use in a new event loop."""
        if self._llm_config:
            from browser_use.llm.google import ChatGoogle
            return ChatGoogle(**self._llm_config)
        return None

    def generate_graph(self) -> dict:
        """
        Produce the graph_blind.json structure.

        First attempts LLM-based descriptions via async calls.
        Falls back to extracting descriptions from blind_run_log data
        (interaction + reasoning fields) if LLM is unavailable or fails.

        Returns:
            Dict with "nodes" and "edges" lists matching the graph export schema.
        """
        # Try LLM-based generation first
        if self.llm is not None or self._llm_config is not None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            try:
                if loop and loop.is_running():
                    # Running inside an existing loop (e.g. after agent.run()).
                    # The original LLM's aiohttp session is tied to the outer loop,
                    # so we must create a fresh LLM in the new thread's loop.
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor() as pool:
                        future = pool.submit(self._run_async_in_new_loop)
                        return future.result()
                else:
                    # No running loop - create fresh LLM if needed
                    if self.llm is None:
                        self.llm = self._create_fresh_llm()
                    return asyncio.run(self._async_generate_graph())
            except Exception as e:
                logger.warning(f"LLM-based graph generation failed, using fallback: {e}")

        # Fallback: build graph from blind_run_log data without LLM
        return self._generate_graph_from_log()

    def _run_async_in_new_loop(self) -> dict:
        """Run async graph generation in a new event loop with a fresh LLM."""
        # Create fresh LLM for this new loop
        if self._llm_config:
            self.llm = self._create_fresh_llm()
        elif self.llm is not None:
            # Try to extract config from existing LLM to create fresh one
            try:
                from browser_use.llm.google import ChatGoogle
                if isinstance(self.llm, ChatGoogle):
                    self.llm = ChatGoogle(
                        model=self.llm.model,
                        api_key=self.llm.api_key,
                        temperature=self.llm.temperature,
                    )
            except Exception:
                logger.warning("Could not create fresh LLM, falling back to log-based graph")
                return self._generate_graph_from_log()

        return asyncio.run(self._async_generate_graph())

    def _generate_graph_from_log(self) -> dict:
        """
        Build graph using blind_run_log data (interaction + reasoning) without LLM.

        Each step in the log becomes a node. Edges connect consecutive nodes
        with the interaction description as the edge label.
        """
        nodes = []
        edges = []

        if not self.blind_run_log:
            return {"nodes": nodes, "edges": edges}

        for i, entry in enumerate(self.blind_run_log):
            node_id = f"node-{self._run_id}-{i}"
            screen_name = self._extract_screen_name_from_entry(entry)
            screenshot_bytes = self.screenshot_bytes_list[i] if i < len(self.screenshot_bytes_list) else None

            node = self._build_node(
                node_id=node_id,
                index=i,
                description=screen_name,
                screenshot_bytes=screenshot_bytes,
            )
            nodes.append(node)

            # Edge from previous node to this node
            if i > 0:
                edge_desc = entry.get("interaction", "Perform action")
                edge = self._build_edge(
                    edge_id=f"edge-{self._run_id}-{i}",
                    source_id=nodes[-2]["id"],
                    target_id=node_id,
                    entry=entry,
                    description=edge_desc,
                )
                edges.append(edge)

        return {"nodes": nodes, "edges": edges}

    def _extract_screen_name_from_entry(self, entry: dict) -> str:
        """Extract a screen name from a blind_run_log entry using reasoning and URL."""
        # Prefer memory from reasoning - describes current state
        reasoning = entry.get("reasoning", "")
        if reasoning:
            for line in reasoning.split("\n"):
                line = line.strip()
                if line.startswith("Memory:"):
                    mem = line[len("Memory:"):].strip()
                    if mem and len(mem) > 3:
                        # Take first phrase/clause as screen name
                        phrase = mem.split(".")[0].split(",")[0].strip()
                        if len(phrase) > 30:
                            phrase = phrase[:27] + "..."
                        if phrase:
                            return phrase

        # Fall back to URL path
        url = entry.get("url", "")
        if url:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            path = parsed.path.strip("/")
            if path:
                segments = [s for s in path.split("/") if s and not s.isdigit() and len(s) < 30]
                if segments:
                    name = segments[-1].replace("-", " ").replace("_", " ").title()
                    if len(name) <= 30:
                        return name
            domain = parsed.netloc.replace("www.", "")
            if domain:
                return domain.split(".")[0].title() + " Page"

        return f"Screen {entry.get('step', '?')}"

    async def _async_generate_graph(self) -> dict:
        """Async implementation of graph generation.

        Runs all LLM calls concurrently using asyncio.gather for speed.
        Falls back to log-based descriptions for any individual failures.
        """
        nodes = []
        edges = []

        if not self.blind_run_log:
            return {"nodes": nodes, "edges": edges}

        # Prepare LLM tasks: one per step
        # Task i analyzes step i's screenshot + action to get screen_name + edge_description
        tasks = [self._get_initial_screen_description()]

        for i in range(1, len(self.blind_run_log)):
            entry = self.blind_run_log[i]
            before_bytes = self.screenshot_bytes_list[i - 1] if (i - 1) < len(self.screenshot_bytes_list) else None
            after_bytes = self.screenshot_bytes_list[i] if i < len(self.screenshot_bytes_list) else None

            tasks.append(
                self._analyze_step(
                    entry=entry,
                    before_screenshot=before_bytes,
                    after_screenshot=after_bytes,
                )
            )

        logger.info(f"Running {len(tasks)} LLM calls concurrently for graph generation...")
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Build nodes and edges
        for i, entry in enumerate(self.blind_run_log):
            node_id = f"node-{self._run_id}-{i}"
            screenshot_bytes = self.screenshot_bytes_list[i] if i < len(self.screenshot_bytes_list) else None

            if i == 0:
                # Initial node - use LLM result or fallback
                if not isinstance(results[0], Exception):
                    screen_name = results[0]
                else:
                    logger.warning(f"Initial screen LLM failed: {results[0]}")
                    screen_name = self._extract_screen_name_from_entry(entry)
            else:
                # Subsequent nodes - LLM returns (screen_name, edge_description)
                if i < len(results) and not isinstance(results[i], Exception):
                    screen_name, edge_description = results[i]
                else:
                    if i < len(results):
                        logger.warning(f"Step {i} LLM failed: {results[i]}")
                    screen_name = self._extract_screen_name_from_entry(entry)
                    edge_description = entry.get("interaction", "Perform action")

            node = self._build_node(
                node_id=node_id,
                index=i,
                description=screen_name,
                screenshot_bytes=screenshot_bytes,
            )
            nodes.append(node)

            # Edge from previous node to this node (skip for first node)
            if i > 0:
                # Use LLM edge_description if available (set above), otherwise use interaction
                if i >= len(results) or isinstance(results[i], Exception):
                    edge_description = entry.get("interaction", "Perform action")

                edge = self._build_edge(
                    edge_id=f"edge-{self._run_id}-{i}",
                    source_id=nodes[-2]["id"],
                    target_id=node_id,
                    entry=entry,
                    description=edge_description,
                )
                edges.append(edge)

        return {"nodes": nodes, "edges": edges}

    async def _get_initial_screen_description(self) -> str:
        """Get LLM description for the initial screen."""
        if self.llm is None:
            return "Initial Screen"

        try:
            from browser_use.llm.messages import (
                ContentPartImageParam,
                ContentPartTextParam,
                ImageURL,
                UserMessage,
            )

            content = [ContentPartTextParam(text=INITIAL_SCREEN_PROMPT)]

            # Add screenshot if available
            screenshot_bytes = self.screenshot_bytes_list[0] if self.screenshot_bytes_list else None
            if screenshot_bytes:
                b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
                content.append(
                    ContentPartImageParam(
                        image_url=ImageURL(
                            url=f"data:image/png;base64,{b64}",
                            detail="low",
                        )
                    )
                )

            messages = [UserMessage(content=content)]

            response = await asyncio.wait_for(
                self.llm.ainvoke(messages=messages),
                timeout=30,
            )

            if response and response.completion:
                return self._parse_screen_name(response.completion)

        except asyncio.TimeoutError:
            logger.warning("LLM timeout for initial screen description")
        except Exception as e:
            logger.warning(f"LLM failed for initial screen description: {e}")

        return "Initial Screen"

    async def _analyze_step(
        self,
        entry: Dict[str, Any],
        before_screenshot: Optional[bytes],
        after_screenshot: Optional[bytes],
    ) -> Tuple[str, str]:
        """
        Analyze a single step using LLM with before/after screenshots + action + reasoning.

        Returns:
            Tuple of (screen_name, edge_description)
        """
        if self.llm is None:
            return self._fallback_step(entry)

        try:
            from browser_use.llm.messages import (
                ContentPartImageParam,
                ContentPartTextParam,
                ImageURL,
                UserMessage,
            )

            action = entry.get("interaction", "Unknown")
            reasoning = entry.get("reasoning", "")[:500]

            has_images = before_screenshot is not None or after_screenshot is not None

            if has_images:
                prompt_text = STEP_ANALYSIS_PROMPT.format(
                    action=action,
                    reasoning=reasoning,
                )
                content = []

                # Add before screenshot
                if before_screenshot:
                    content.append(ContentPartTextParam(text="BEFORE screenshot:"))
                    b64 = base64.b64encode(before_screenshot).decode("utf-8")
                    content.append(
                        ContentPartImageParam(
                            image_url=ImageURL(
                                url=f"data:image/png;base64,{b64}",
                                detail="low",
                            )
                        )
                    )
                else:
                    content.append(ContentPartTextParam(text="BEFORE screenshot: (not available)"))

                # Add after screenshot
                if after_screenshot:
                    content.append(ContentPartTextParam(text="AFTER screenshot:"))
                    b64 = base64.b64encode(after_screenshot).decode("utf-8")
                    content.append(
                        ContentPartImageParam(
                            image_url=ImageURL(
                                url=f"data:image/png;base64,{b64}",
                                detail="low",
                            )
                        )
                    )
                else:
                    content.append(ContentPartTextParam(text="AFTER screenshot: (not available)"))

                # Add the analysis prompt
                content.append(ContentPartTextParam(text=prompt_text))
            else:
                # No images available, use text-only prompt
                prompt_text = STEP_ANALYSIS_NO_IMAGES_PROMPT.format(
                    action=action,
                    reasoning=reasoning,
                )
                content = [ContentPartTextParam(text=prompt_text)]

            messages = [UserMessage(content=content)]

            response = await asyncio.wait_for(
                self.llm.ainvoke(messages=messages),
                timeout=30,
            )

            if response and response.completion:
                return self._parse_step_response(response.completion, entry)

        except asyncio.TimeoutError:
            logger.warning(f"LLM timeout for step {entry.get('step', '?')}")
        except Exception as e:
            logger.warning(f"LLM failed for step {entry.get('step', '?')}: {e}")

        return self._fallback_step(entry)

    def _parse_screen_name(self, response_text: str) -> str:
        """Parse screen name from LLM JSON response."""
        try:
            text = response_text.strip()
            if "```" in text:
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()

            data = json.loads(text)
            name = data.get("screen_name", "").strip().strip("\"'")
            if name and len(name) <= 50:
                return name
        except (json.JSONDecodeError, AttributeError, KeyError):
            text = response_text.strip().strip("\"'").strip()
            if text and len(text) <= 50:
                return text

        return "Initial Screen"

    def _parse_step_response(
        self, response_text: str, entry: Dict[str, Any]
    ) -> Tuple[str, str]:
        """Parse screen_name and edge_description from LLM JSON response."""
        try:
            text = response_text.strip()
            if "```" in text:
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()

            data = json.loads(text)
            screen_name = data.get("screen_name", "").strip().strip("\"'")
            edge_desc = data.get("edge_description", "").strip().strip("\"'").rstrip(".")

            if not screen_name:
                screen_name = self._fallback_step(entry)[0]
            if not edge_desc:
                edge_desc = self._fallback_step(entry)[1]

            if len(screen_name) > 50:
                screen_name = screen_name[:47] + "..."
            if len(edge_desc) > 80:
                edge_desc = edge_desc[:77] + "..."

            return screen_name, edge_desc

        except (json.JSONDecodeError, AttributeError, KeyError):
            logger.warning(
                f"Failed to parse LLM JSON for step {entry.get('step', '?')}, "
                f"raw response: {response_text[:200]}"
            )

        return self._fallback_step(entry)

    def _fallback_step(self, entry: Dict[str, Any]) -> Tuple[str, str]:
        """Generate fallback descriptions without LLM."""
        screen_name = self._extract_screen_name_from_entry(entry)
        edge_desc = entry.get("interaction", "Perform action")
        return screen_name, edge_desc

    def _build_node(
        self,
        node_id: str,
        index: int,
        description: str,
        screenshot_bytes: Optional[bytes],
    ) -> dict:
        """Build a node dict matching the graph export schema."""
        image_data = None
        if screenshot_bytes:
            image_data = self._encode_screenshot(screenshot_bytes)

        return {
            "id": node_id,
            "type": "customNode",
            "position": {"x": index * 500, "y": 0},
            "data": {
                "description": description,
                "image": image_data,
            },
        }

    def _build_edge(
        self,
        edge_id: str,
        source_id: str,
        target_id: str,
        entry: Dict[str, Any],
        description: str,
    ) -> dict:
        """Build an edge dict matching the graph export schema."""
        return {
            "id": edge_id,
            "source": source_id,
            "target": target_id,
            "sourceHandle": "right-source",
            "targetHandle": "left-target",
            "type": "customEdge",
            "data": {
                "business_logic": entry.get("action", ""),
                "curvature": 0,
                "description": description,
                "source_anchor": "right-source",
                "target_anchor": "left-target",
            },
        }

    def _encode_screenshot(self, screenshot_bytes: bytes) -> str:
        """Encode screenshot bytes to base64 JPEG data URI."""
        try:
            from PIL import Image

            img = Image.open(io.BytesIO(screenshot_bytes))
            jpeg_buffer = io.BytesIO()
            img.convert("RGB").save(jpeg_buffer, format="JPEG", quality=75)
            jpeg_bytes = jpeg_buffer.getvalue()
            b64 = base64.b64encode(jpeg_bytes).decode("utf-8")
            return f"data:image/jpeg;base64,{b64}"
        except Exception as e:
            logger.warning(f"Failed to encode screenshot as JPEG, using PNG: {e}")
            b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            return f"data:image/png;base64,{b64}"
