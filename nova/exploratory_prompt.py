"""
Local test script for browser-use exploratory prompt mode.

Tests the new exploratory prompt functionality against Airbnb, where the agent
autonomously infers test steps and expected results based on a high-level goal.

Usage:
    cd /Users/aditya/Desktop/nova
    GOOGLE_API_KEY=<your-key> python test_exploratory_prompt.py
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from utils.gcms_helper import _emit_nodes, _emit_edge, _emit_flow

# Ensure nova root is on the path
sys.path.insert(0, str(Path(__file__).parent))


async def main():
    # ── 1. Configuration ─────────────────────────────────────────────────
    output_dir = Path("./test_exploratory_output")
    output_dir.mkdir(parents=True, exist_ok=True)
    product_id = "1234"
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_API_KEY environment variable is not set.")
        print("Run with: GOOGLE_API_KEY=<key> python test_exploratory_prompt.py")
        sys.exit(1)

    print("=" * 80)
    print("EXPLORATORY PROMPT TEST - Airbnb")
    print("=" * 80)

    # ── 2. Build exploratory test goal ───────────────────────────────────
    # No specific test steps or expected results - agent infers everything
    test_goal = "Search for accommodations in Paris for 2 guests and verify the search results display correctly"

    # Optional credentials (empty for this test - no login required for search)
    credentials = {}

    # Generate the exploratory prompt using nova's new prompt builder
    from web_executor.prompts import convert_goal_to_exploratory_browser_prompt

    prompt = convert_goal_to_exploratory_browser_prompt(
        goal=test_goal,
        app_name="Airbnb",
        base_url="https://www.airbnb.com",
        additional_context="Travel accommodation booking platform",
    )

    print("\n--- Generated Exploratory Prompt ---")
    print(prompt)
    print("--- End Prompt ---\n")

    # Save the prompt for reference
    prompt_path = output_dir / "generated_prompt.txt"
    with open(prompt_path, "w") as f:
        f.write(prompt)
    print(f"Prompt saved to: {prompt_path}")

    # ── 3. Initialize browser-use ─────────────────────────────────────────
    from browser_use import Agent, Browser
    from browser_use.agent.prompts import SystemPrompt
    from browser_use.browser.profile import ViewportSize
    from browser_use.llm.google import ChatGoogle

    llm = ChatGoogle(
        model="gemini-2.5-flash",
        api_key=api_key,
        temperature=0.0,
    )

    # Video recording directory
    video_dir = output_dir / "videos"
    video_dir.mkdir(parents=True, exist_ok=True)

    browser = Browser(
        headless=False,
        disable_security=True,
        record_video_dir=video_dir,
        window_size=ViewportSize(width=1920, height=1080),
        args=[
            "--password-store=basic",
            "--disable-features=DbusSecretPortal",
        ],
    )

    # Use goal-driven system prompt for exploratory mode
    system_prompt = SystemPrompt(
        max_actions_per_step=3,
        use_thinking=True,
        flash_mode=True,
        is_anthropic=False,  # Exploratory uses goal-driven navigation
    )

    agent = Agent(
        task=prompt,
        llm=llm,
        browser=browser,
        max_steps=50,  # More steps for exploratory testing
        system_prompt=system_prompt,
    )

    # ── 4. Run browser-use agent ──────────────────────────────────────────
    print("\nStarting browser-use agent execution (exploratory mode)...")
    print(f"Goal: {test_goal}")
    print()

    history = await agent.run()

    final_result = history.final_result()
    action_names = history.action_names()
    print(f"\nExecution complete: {len(action_names)} steps")
    print(f"Final result: {final_result}")

    # ── 5. Post-processing (screenshots, log, graph) ─────────────────────
    print("\n--- Post-Processing ---")

    from web_executor.blind_run.processor import BlindRunProcessor

    processor = BlindRunProcessor(
        history=history,
        output_folder=output_dir,
        llm=llm,
    )
    post_process_result = processor.process()

    # ── 6. Summary ────────────────────────────────────────────────────────
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)
    print(f"Test Goal:    {test_goal}")
    print(f"Status:       {'SUCCESS' if final_result else 'NO RESULT'}")
    print(f"Steps taken:  {len(action_names)}")
    print(f"Output dir:   {output_dir.resolve()}")
    print()

    # List generated artifacts
    print("Artifacts:")
    for artifact_path in sorted(output_dir.rglob("*")):
        if artifact_path.is_file():
            size_kb = artifact_path.stat().st_size / 1024
            rel = artifact_path.relative_to(output_dir)
            print(f"  {rel}  ({size_kb:.1f} KB)")

    # Save a test summary
    summary = {
        "test_type": "exploratory",
        "goal": test_goal,
        "app": "Airbnb",
        "url": "https://www.airbnb.com",
        "final_result": str(final_result),
        "steps_taken": len(action_names),
        "action_names": action_names,
        "post_processing": post_process_result,
    }
    summary_path = output_dir / "test_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(f"\nTest summary saved to: {summary_path}")

    # ── 7. Display Final Result ───────────────────────────────────────────
    print("\n" + "=" * 80)
    print("FINAL VERDICT FROM AGENT")
    print("=" * 80)
    if final_result:
        print(final_result)
    else:
        print("No final result returned by agent")

    print("\nDone with execution, emitting graph now")


    GRAPH_EXPORT_PATH = "test_exploratory_output/graph_blind.json"
    FLOW_EXPORT_PATH = "test_exploratory_output/flow_blind.json"

    with open(GRAPH_EXPORT_PATH, 'r') as f:
        graph_data = json.load(f)
    
    print(f"Loading flows from {FLOW_EXPORT_PATH}...")
    with open(FLOW_EXPORT_PATH, 'r') as f:
        flows_data = json.load(f)

    # Extracting the requested variables
    nodes = graph_data.get('nodes', [])
    edges = graph_data.get('edges', [])
    flows = flows_data

    # Emit nodes
    _emit_nodes(product_id, nodes)

    # Emit edges
    for edge in edges:
        _emit_edge(product_id, edge)

    # Emit flows
    for flow in flows:
        _emit_flow(product_id, flow)


if __name__ == "__main__":
    asyncio.run(main())
