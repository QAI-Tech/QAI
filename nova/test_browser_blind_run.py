"""
Local test script for browser-use blind run pipeline.

Runs browser-use against Flipkart in goal-driven mode, triggers blind run
post-processing, and saves all artifacts locally for inspection.

Usage:
    cd /Users/aditya/Desktop/nova
    GOOGLE_API_KEY=<your-key> python test_browser_blind_run.py
"""

import asyncio
import json
import os
import sys
from pathlib import Path

# Ensure nova root is on the path
sys.path.insert(0, str(Path(__file__).parent))


async def main():
    # ── 1. Configuration ─────────────────────────────────────────────────
    output_dir = Path("./test_blind_run_output")
    output_dir.mkdir(parents=True, exist_ok=True)

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_API_KEY environment variable is not set.")
        print("Run with: GOOGLE_API_KEY=<key> python test_browser_blind_run.py")
        sys.exit(1)

    print("=" * 80)
    print("LOCAL BLIND RUN TEST - Flipkart")
    print("=" * 80)

    # ── 2. Build test case in nova format ─────────────────────────────────
    interactions = {
        "starting_point": "Flipkart home page",
        "test_case_steps": [
            {
                "step_no": 1,
                "step_description": 'Search for "wireless earbuds" using the search bar',
                "expected_results": [
                    "Search results page displays with wireless earbuds listings"
                ],
            },
            {
                "step_no": 2,
                "step_description": "Click on the first product result from the search results",
                "expected_results": [
                    "Product details page opens for the selected earbuds"
                ],
            },
            {
                "step_no": 3,
                "step_description": "Verify the product details page has loaded correctly",
                "expected_results": [
                    "Product page displays product name, price, and Add to Cart button"
                ],
            },
        ],
    }

    # Generate the goal-driven prompt using nova's prompt builder
    from web_executor.prompts import convert_interactions_to_goal_driven_browser_prompt

    prompt = convert_interactions_to_goal_driven_browser_prompt(
        interactions=interactions,
        credentials={},
        app_name="Flipkart",
        base_url="https://www.flipkart.com",
        goal_context="Flipkart home page",
    )

    print("\n--- Generated Prompt ---")
    print(prompt)
    print("--- End Prompt ---\n")

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

    system_prompt = SystemPrompt(
        max_actions_per_step=3,
        use_thinking=True,
        flash_mode=True,
        is_anthropic=False,
        goal_driven_mode=True,
    )

    agent = Agent(
        task=prompt,
        llm=llm,
        browser=browser,
        max_steps=40,
        system_prompt=system_prompt,
    )

    # ── 4. Run browser-use agent ──────────────────────────────────────────
    print("Starting browser-use agent execution...")
    history = await agent.run()

    final_result = history.final_result()
    action_names = history.action_names()
    print(f"\nExecution complete: {len(action_names)} steps")
    print(f"Final result: {final_result}")

    # ── 5. Blind run post-processing ──────────────────────────────────────
    print("\n--- Blind Run Post-Processing ---")

    from web_executor.blind_run.processor import BlindRunProcessor

    processor = BlindRunProcessor(
        history=history,
        output_folder=output_dir,
        llm=llm,
    )
    blind_run_result = processor.process()

    # ── 6. Summary ────────────────────────────────────────────────────────
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)
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
        "final_result": str(final_result),
        "steps_taken": len(action_names),
        "action_names": action_names,
        "blind_run": blind_run_result,
    }
    summary_path = output_dir / "test_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2, default=str)
    print(f"\nTest summary saved to: {summary_path}")

    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
