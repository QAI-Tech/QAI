"""
Browser-use agent wrapper for Nova integration.
Handles web automation using browser-use library with Gemini.
"""
import asyncio
import os
from pathlib import Path
from typing import Optional, Dict, Any
from utils.utils import nova_log


class NovaWebAgent:
    """Wrapper around browser-use for Nova integration."""
    
    def __init__(self, gemini_api_key: str = None, goal_driven_mode: bool = False):
        """
        Initialize web agent with Gemini API key.
        
        Args:
            gemini_api_key: Google Gemini API key (reads from env if not provided)
            goal_driven_mode: Enable goal-driven mode (autonomous navigation)
        """
        self.gemini_api_key = gemini_api_key or os.getenv('GOOGLE_API_KEY')
        if not self.gemini_api_key:
            raise ValueError(
                "Gemini API key not found. Set GOOGLE_API_KEY environment variable "
                "or pass gemini_api_key parameter."
            )
        self.goal_driven_mode = goal_driven_mode
        
    async def execute_task(
        self,
        task: str,
        url: str = None,
        max_steps: int = 20,
        save_recording: bool = True
    ) -> Dict[str, Any]:
        """
        Execute web automation task using browser-use.
        
        Args:
            task: Natural language task description
            url: Optional starting URL
            max_steps: Maximum number of steps to execute
            save_recording: Whether to save browser recording
        
        Returns:
            dict with keys:
                - status: 'success' or 'failed'
                - result: Final answer from agent
                - steps: Number of steps taken
                - video_path: Path to recorded video (if save_recording=True)
                - history: Full execution history
        """
        video_path = None
        browser = None
        agent = None
        history = None
        
        try:
            # Import browser-use here to avoid import errors if not installed
            from browser_use import Agent, Browser
            from browser_use.llm.google import ChatGoogle
            from browser_use.browser.profile import ViewportSize
            from browser_use.agent.prompts import SystemPrompt
            
            nova_log("Initializing browser-use agent with Gemini...")
            
            # Setup video recording directory if enabled
            record_video_dir = None
            if save_recording:
                # Create assets directory in web_executor
                assets_dir = Path(__file__).parent / "assets" / "videos"
                assets_dir.mkdir(parents=True, exist_ok=True)
                record_video_dir = assets_dir
                
                nova_log(f"Video recording will be saved to: {assets_dir}/")
            
            # Configure browser for local execution with video recording
            browser = Browser(
                headless=False,  # Show browser for debugging
                disable_security=True,  # Disable CORS for testing
                record_video_dir=record_video_dir,  # Enable video recording
                window_size=ViewportSize(width=1920, height=1080),  # Set window size to 1920x1080
                args=[
                    '--password-store=basic',  # Disable keyring/password store
                    '--disable-features=DbusSecretPortal',  # Disable D-Bus secret portal
                ],
            )
            
            # Create Gemini LLM using browser-use's native ChatGoogle
            # This is fully compatible with browser-use and avoids LangChain conflicts
            llm = ChatGoogle(
                model="gemini-2.5-flash",
                api_key=self.gemini_api_key,
                temperature=0.0,
            )
            
            # Create system prompt with goal-driven mode if enabled
            if self.goal_driven_mode:
                nova_log("Using GOAL-DRIVEN MODE: Enabling autonomous navigation system prompt")
                system_prompt = SystemPrompt(
                    max_actions_per_step=3,
                    use_thinking=True,
                    flash_mode=True,  # Gemini 2.0 Flash
                    is_anthropic=False,
                )
            else:
                nova_log("Using PRECONDITION MODE: Standard system prompt")
                system_prompt = SystemPrompt(
                    max_actions_per_step=3,
                    use_thinking=True,
                    flash_mode=True,
                    is_anthropic=False,
                    goal_driven_mode=False
                )
            
            nova_log(f"Creating agent with task: {task[:100]}...")
            
            # Create agent with custom system prompt
            agent = Agent(
                task=task,
                llm=llm,
                browser=browser,
                max_steps=max_steps,
                system_prompt=system_prompt,  # Use custom system prompt
            )
            
            nova_log("Starting browser agent execution...")
            
            # Run agent
            history = await agent.run()
            
            # Extract results before cleanup
            final_result = history.final_result()
            action_names = history.action_names()
            
            nova_log(f"Execution completed: {len(action_names)} steps taken")
            nova_log(f"Final result: {final_result}")
            
            # Find the actual video file (browser-use uses UUID naming)
            if save_recording and record_video_dir:
                # Get the most recent .mp4 file in the recording directory
                video_files = sorted(
                    record_video_dir.glob("*.mp4"),
                    key=lambda p: p.stat().st_mtime,
                    reverse=True
                )
                if video_files:
                    video_path = video_files[0]
                    video_size_mb = video_path.stat().st_size / (1024 * 1024)
                    nova_log(f"📹 Video recording saved: {video_path.name} ({video_size_mb:.2f} MB)")
                else:
                    nova_log("⚠️ Warning: Video recording was enabled but no video file found")
                    video_path = None
            
            # Post-processing: generate screenshots, log, graph, and flow for all runs
            blind_run_result = None
            try:
                from web_executor.blind_run.processor import BlindRunProcessor

                # Use static path for blind run output
                # This makes it easy to find artifacts for any test run
                blind_run_folder = Path(__file__).parent / "assets" / "blind_run"
                blind_run_folder.mkdir(parents=True, exist_ok=True)

                nova_log(f"Running post-processing (screenshots, log, graph, flow) in {blind_run_folder}...")
                blind_processor = BlindRunProcessor(
                    history=history,
                    output_folder=blind_run_folder,
                    llm=llm,
                    flow_name=f"Web Test: {task[:50]}..." if len(task) > 50 else f"Web Test: {task}",
                    precondition=url or "",
                    video_url=str(video_path) if video_path else None,
                )
                blind_run_result = blind_processor.process()
                nova_log(f"Post-processing artifacts: {blind_run_result}")
            except Exception as e:
                nova_log(f"Post-processing failed (non-fatal): {str(e)}", e)

            # Return results with history available for caller
            return {
                'status': 'success',
                'result': final_result,
                'steps': len(action_names),
                'video_path': str(video_path) if video_path else None,
                'history': history,
                'action_names': action_names,
                'blind_run': blind_run_result,
            }
            
        except ImportError as e:
            error_msg = (
                f"Browser-use not installed: {e}\n"
                "Install with: pip install browser-use google-genai"
            )
            nova_log(error_msg, Exception(error_msg))
            return {
                'status': 'failed',
                'error': error_msg,
                'steps': 0,
            }
        except Exception as e:
            error_msg = f"Web agent execution failed: {str(e)}"
            nova_log(error_msg, e)
            return {
                'status': 'failed',
                'error': error_msg,
                'steps': 0,
            }
    
    def execute_task_sync(
        self, 
        task: str, 
        url: str = None, 
        max_steps: int = 20,
        save_recording: bool = True
    ) -> Dict[str, Any]:
        """
        Synchronous wrapper for execute_task.
        
        Args:
            task: Natural language task description
            url: Optional starting URL
            max_steps: Maximum number of steps
            save_recording: Whether to save browser recording
        
        Returns:
            dict: Execution results
        """
        return asyncio.run(self.execute_task(task, url, max_steps, save_recording))
