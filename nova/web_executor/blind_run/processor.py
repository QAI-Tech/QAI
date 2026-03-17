"""
Blind Run post-processor for browser-use web execution.

Generates blind_run_ss/ screenshots, blind_run_data.json, and graph_blind.json
from AgentHistoryList data after a web test execution completes.
"""

import base64
import json
import logging
import re
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("nova")


class BlindRunProcessor:
    """
    Post-execution processor that generates blind run artifacts from browser-use history:
    - blind_run_ss/: Screenshots for each step
    - blind_run_data.json: Log mapping each step to screenshot, action, interaction, reasoning
    - graph_blind.json: Graph with nodes (screen states) and edges (actions)
    - flow_blind.json: Flow structure representing the linear test path
    """

    def __init__(
        self,
        history,
        output_folder: Path,
        llm=None,
        flow_name: str = "Blind Run Flow",
        precondition: str = "",
        credentials: Optional[List[Dict[str, str]]] = None,
        video_url: Optional[str] = None,
    ):
        """
        Args:
            history: AgentHistoryList from browser-use agent execution.
            output_folder: Directory to write blind run artifacts into.
            llm: browser-use BaseChatModel instance for graph generation (e.g. ChatGoogle).
            flow_name: Human-readable name for the flow.
            precondition: Starting precondition/context for the flow.
            credentials: List of credential dicts used in the flow.
            video_url: URL to the execution video (if available).
        """
        self.history = history
        self.output_folder = Path(output_folder)
        self.llm = llm
        self.flow_name = flow_name
        self.precondition = precondition
        self.credentials = credentials or []
        self.video_url = video_url

        self.blind_run_ss_folder = self.output_folder / "blind_run_ss"
        self.blind_run_log_path = self.output_folder / "blind_run_data.json"
        self.graph_blind_path = self.output_folder / "graph_blind.json"
        self.flow_blind_path = self.output_folder / "flow_blind.json"

        self._blind_run_log: List[Dict[str, Any]] = []
        self._screenshot_bytes_map: Dict[int, bytes] = {}
        self._graph_data: Dict[str, Any] = {}

    def process(self) -> dict:
        """Run all blind run post-processing. Returns paths to generated files."""
        result = {
            "blind_run_ss_folder": None,
            "blind_run_log": None,
            "graph_blind": None,
            "flow_blind": None,
        }

        try:
            self._save_blind_run_screenshots()
            result["blind_run_ss_folder"] = str(self.blind_run_ss_folder)
        except Exception as e:
            logger.error(f"Failed to save blind run screenshots: {e}")

        try:
            self._generate_blind_run_log()
            result["blind_run_log"] = str(self.blind_run_log_path)
        except Exception as e:
            logger.error(f"Failed to generate blind run log: {e}")

        try:
            self._generate_graph()
            result["graph_blind"] = str(self.graph_blind_path)
        except Exception as e:
            logger.error(f"Failed to generate graph_blind.json: {e}")

        try:
            self._generate_flow()
            result["flow_blind"] = str(self.flow_blind_path)
        except Exception as e:
            logger.error(f"Failed to generate flow_blind.json: {e}")

        return result

    def _save_blind_run_screenshots(self):
        """
        Save screenshots to blind_run_ss/ folder from history.

        browser-use stores screenshots per step at screenshot_path (e.g. step_1.png).
        Each history item's screenshot represents the browser state AT that step
        (after the action was taken).
        """
        self.blind_run_ss_folder.mkdir(parents=True, exist_ok=True)

        copied = 0
        for i, item in enumerate(self.history.history):
            src_path = item.state.screenshot_path
            if src_path and Path(src_path).exists():
                dst = self.blind_run_ss_folder / f"{i:04d}.png"
                shutil.copy2(src_path, str(dst))
                # Cache bytes for graph generation
                self._screenshot_bytes_map[i] = Path(src_path).read_bytes()
                copied += 1
            else:
                logger.warning(f"Screenshot for step {i} not found, skipping")

        logger.info(f"Saved {copied} blind run screenshots to {self.blind_run_ss_folder}")

    def _extract_interaction_summary(self, actions: list, reasoning: Optional[str]) -> str:
        """
        Extract a concise, professional action label from the actions and reasoning.

        Uses next_goal from reasoning (describes intent) when available,
        falls back to action details, then memory.
        """
        # Prefer next_goal from reasoning - it describes what the agent is about to do
        if reasoning:
            for line in reasoning.strip().split("\n"):
                line = line.strip()
                if line.startswith("Next goal:"):
                    goal = line[len("Next goal:"):].strip()
                    if goal and len(goal) > 5:
                        # Take first sentence only
                        goal = goal.split(".")[0].strip()
                        if len(goal) > 80:
                            goal = goal[:77] + "..."
                        return goal

        # Build description from actions
        if actions:
            descriptions = []
            for action in actions:
                action_dict = action.model_dump(exclude_none=True, mode='json') if hasattr(action, 'model_dump') else action
                # Get the action type (first key that's not metadata)
                for key, value in action_dict.items():
                    if key in ('interacted_element', 'result'):
                        continue
                    # Handle both full names and short names from browser-use
                    if key in ('click_element', 'click'):
                        idx = value.get('index', '?') if isinstance(value, dict) else value
                        descriptions.append(f"Click element {idx}")
                    elif key in ('input_text', 'input'):
                        if isinstance(value, dict):
                            text = value.get('text', '')
                            if len(text) > 30:
                                text = text[:27] + "..."
                            descriptions.append(f'Type "{text}"')
                        else:
                            descriptions.append("Type text")
                    elif key in ('go_to_url', 'navigate'):
                        if isinstance(value, dict):
                            url = value.get('url', '')
                        else:
                            url = str(value)
                        if len(url) > 50:
                            url = url[:47] + "..."
                        descriptions.append(f"Navigate to {url}")
                    elif key in ('scroll_down', 'scroll'):
                        if isinstance(value, dict):
                            direction = "down" if value.get('down', True) else "up"
                        else:
                            direction = "down"
                        descriptions.append(f"Scroll {direction}")
                    elif key == 'scroll_up':
                        descriptions.append("Scroll up")
                    elif key in ('go_back', 'back'):
                        descriptions.append("Go back")
                    elif key == 'done':
                        if isinstance(value, dict):
                            text = value.get('text', 'Done')
                        else:
                            text = 'Done'
                        if len(text) > 60:
                            text = text[:57] + "..."
                        descriptions.append(f"Done: {text}")
                    elif key in ('extract_content', 'extract'):
                        descriptions.append("Extract page content")
                    elif key in ('switch_tab', 'switch'):
                        descriptions.append("Switch tab")
                    elif key in ('open_tab',):
                        descriptions.append("Open new tab")
                    elif key in ('close_tab',):
                        descriptions.append("Close tab")
                    elif key == 'wait':
                        secs = value.get('seconds', '') if isinstance(value, dict) else value
                        descriptions.append(f"Wait {secs}s")
                    elif isinstance(value, dict) and value:
                        descriptions.append(f"{key.replace('_', ' ').title()}")
                    break  # Only first action key per action

            if descriptions:
                return "; ".join(descriptions)

        # Fallback to memory
        if reasoning:
            for line in reasoning.strip().split("\n"):
                line = line.strip()
                if line.startswith("Memory:"):
                    mem = line[len("Memory:"):].strip()
                    if mem and len(mem) > 5:
                        if len(mem) > 80:
                            mem = mem[:77] + "..."
                        return mem

        return "Unknown interaction"

    def _generate_blind_run_log(self):
        """
        Generate blind_run_data.json from browser-use history.

        Each entry maps:
        - step: step index
        - screenshot: relative path to blind_run_ss/XXXX.png
        - action: serialized action data
        - interaction: human-readable summary
        - reasoning: model's evaluation/memory/next_goal
        """
        self._blind_run_log = []

        for i, item in enumerate(self.history.history):
            # Screenshot for this step
            screenshot_path = f"blind_run_ss/{i:04d}.png"
            if not (self.blind_run_ss_folder / f"{i:04d}.png").exists():
                screenshot_path = None

            # Get action data
            actions = item.model_output.action if item.model_output else []
            action_str = json.dumps(
                [a.model_dump(exclude_none=True, mode='json') for a in actions],
                indent=1
            ) if actions else ""

            # Get reasoning from model output
            reasoning_parts = []
            if item.model_output:
                if item.model_output.evaluation_previous_goal:
                    reasoning_parts.append(f"Evaluation: {item.model_output.evaluation_previous_goal}")
                if item.model_output.memory:
                    reasoning_parts.append(f"Memory: {item.model_output.memory}")
                if item.model_output.next_goal:
                    reasoning_parts.append(f"Next goal: {item.model_output.next_goal}")
                if item.model_output.thinking:
                    reasoning_parts.append(f"Thinking: {item.model_output.thinking}")
            reasoning = "\n".join(reasoning_parts)

            # Get interaction summary
            interaction = self._extract_interaction_summary(actions, reasoning)

            # Get results
            results = []
            for r in item.result:
                if r.extracted_content:
                    results.append(r.extracted_content)
                if r.error:
                    results.append(f"Error: {r.error}")

            entry = {
                "step": i,
                "screenshot": screenshot_path,
                "action": action_str,
                "interaction": interaction,
                "reasoning": reasoning,
                "url": item.state.url,
                "results": results if results else None,
            }
            self._blind_run_log.append(entry)

        # Write to disk
        with open(self.blind_run_log_path, "w", encoding="utf-8") as f:
            json.dump(self._blind_run_log, f, indent=2, ensure_ascii=False)

        logger.info(
            f"Generated blind_run_data.json with {len(self._blind_run_log)} entries"
        )

    def _generate_graph(self):
        """Generate graph_blind.json using GraphAgent."""
        from web_executor.blind_run.graph_agent import GraphAgent

        # Build screenshot bytes list for graph agent
        # Index i = screenshot for step i
        num_steps = len(self.history.history)
        screenshot_bytes_list = []
        for i in range(num_steps):
            screenshot_bytes_list.append(self._screenshot_bytes_map.get(i))

        # Pass LLM config as dict so GraphAgent can create a fresh instance
        # in a new event loop (avoids aiohttp loop mismatch)
        llm_arg = None
        if self.llm is not None:
            try:
                llm_arg = {
                    "model": self.llm.model,
                    "api_key": self.llm.api_key,
                    "temperature": self.llm.temperature,
                }
            except AttributeError:
                # If LLM doesn't expose these attrs, pass it directly
                llm_arg = self.llm

        graph_agent = GraphAgent(
            llm=llm_arg,
            blind_run_log=self._blind_run_log,
            screenshot_bytes_list=screenshot_bytes_list,
        )
        self._graph_data = graph_agent.generate_graph()

        # Write to disk
        with open(self.graph_blind_path, "w", encoding="utf-8") as f:
            json.dump(self._graph_data, f, indent=2, ensure_ascii=False)

        logger.info(
            f"Generated graph_blind.json with {len(self._graph_data.get('nodes', []))} nodes "
            f"and {len(self._graph_data.get('edges', []))} edges"
        )

    def _generate_flow(self):
        """Generate flow_blind.json from graph data using FlowGenerator."""
        from web_executor.blind_run.flow_generator import FlowGenerator

        flow_generator = FlowGenerator(
            graph_data=self._graph_data,
            flow_name=self.flow_name,
            precondition=self.precondition,
            credentials=self.credentials,
            video_url=self.video_url,
        )
        flow_data = flow_generator.generate_flow()

        # Write to disk
        with open(self.flow_blind_path, "w", encoding="utf-8") as f:
            json.dump(flow_data, f, indent=2, ensure_ascii=False)

        # flow_data is an array of flows
        num_flows = len(flow_data)
        total_nodes = sum(len(f.get('pathNodeIds', [])) for f in flow_data)
        logger.info(
            f"Generated flow_blind.json with {num_flows} flow(s), {total_nodes} total path nodes"
        )
