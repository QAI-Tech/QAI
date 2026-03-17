"""
Web test executor using browser-use.
Main entry point for web test execution - similar to tc_generator/main.py but for web.
"""
import sys
import os
import json
import time
from utils.utils import nova_log, construct_bucket_name
from .browser_agent import NovaWebAgent
from .prompts import convert_interactions_to_browser_prompt, convert_interactions_to_goal_driven_browser_prompt, convert_goal_to_exploratory_browser_prompt
from .state import WebExecutionState
from .video_utils import uploadWebExecutionVideo, cleanupLocalVideo, uploadBlindRunArtifacts
from utils.gcms_helper import _emit_nodes, _emit_edge, _emit_flow


def execute_web_test(args, auth_status):
    """
    Main entry point for web test execution.
    
    Args:
        args: Parsed arguments containing test case details
        auth_status: Authentication status (LOGGED_IN / LOGGED_OUT)
    
    Returns:
        tuple: (is_tc_pass, status, explanation)
            - is_tc_pass: True/False/None for pass/fail/attempt_failed
            - status: 'pass', 'fail', or 'attempt_failed'
            - explanation: String or list explaining the result
    """
    nova_log("=" * 80)
    nova_log("WEB EXECUTOR: Starting browser-use execution")
    nova_log("=" * 80)
    
    start_time = time.time()
    
    try:
        # Extract test case information
        user_goal_json = json.loads(args.user_goal) if isinstance(args.user_goal, str) else args.user_goal
        precondition_steps = user_goal_json.get('precondition_steps', [])
        interactions = args.interactions if hasattr(args, 'interactions') else {}
        credentials = args.credentials if hasattr(args, 'credentials') else {}
        app_name = args.app_name if hasattr(args, 'app_name') else args.product_name
        base_url = args.executable_url if hasattr(args, 'executable_url') else args.app_link
        
        # Determine if goal-driven mode should be used
        # Goal-driven mode: Single precondition (or none), autonomous navigation
        # Precondition mode: Multiple preconditions, explicit navigation steps
        use_goal_driven_mode = len(precondition_steps) <= 1
        
        nova_log(f"App Name: {app_name}")
        nova_log(f"Base URL: {base_url}")
        nova_log(f"Auth Status: {auth_status}")
        nova_log(f"Precondition Steps: {len(precondition_steps)}")
        nova_log(f"Test Steps: {len(interactions.get('test_case_steps', []))}")
        nova_log(f"Execution Mode: {'GOAL-DRIVEN' if use_goal_driven_mode else 'PRECONDITION-BASED'}")
        
        # Convert test case to browser-use prompt based on mode
        if use_goal_driven_mode:
            nova_log("Using GOAL-DRIVEN MODE: Autonomous navigation without explicit steps")
            goal_context = precondition_steps[0] if precondition_steps else interactions.get('starting_point', '')
            prompt = convert_interactions_to_goal_driven_browser_prompt(
                interactions=interactions,
                credentials=credentials,
                app_name=app_name,
                base_url=base_url,
                goal_context=goal_context
            )
        else:
            nova_log("Using PRECONDITION MODE: Explicit navigation steps provided")
            prompt = convert_interactions_to_browser_prompt(
                interactions=interactions,
                precondition_steps=precondition_steps,
                credentials=credentials,
                app_name=app_name,
                base_url=base_url
            )
        
        nova_log("Generated prompt:")
        nova_log("-" * 80)
        nova_log(prompt)
        nova_log("-" * 80)
        
        # Initialize browser agent with goal-driven mode flag
        nova_log("Initializing browser-use agent...")
        agent = NovaWebAgent(goal_driven_mode=use_goal_driven_mode)
        
        # Adjust max_steps for goal-driven mode (needs more steps for autonomous navigation)
        if use_goal_driven_mode:
            max_steps = min(60, args.time_out_in_mins * 6)  # 60 max for goal-driven
        else:
            max_steps = min(50, args.time_out_in_mins * 5)  # 50 max for precondition-based
        
        # Execute task with video recording
        nova_log(f"Executing web test task... (max_steps={max_steps})")
        result = agent.execute_task_sync(
            task=prompt,
            url=base_url,
            max_steps=max_steps,
            save_recording=True  # Enable video recording
        )
        
        # Create state for logging
        state = WebExecutionState(
            state_id='final',
            root_dirpath=args.tc_dirpath,
            user_goal=prompt,
            start_time=start_time
        )
        state.add_ids(
            test_case_id=123456789,
            test_case_under_execution_id=args.test_case_under_execution_id,
            test_run_id=args.test_run_id,
            product_id=args.product_id
        )
        
        # Process results
        if result['status'] == 'success':
            final_result = result['result']
            steps_taken = result['steps']
            
            nova_log(f"Web test completed successfully in {steps_taken} steps")
            nova_log(f"Final result: {final_result}")
            
            # Upload video to GCP if available
            video_gcp_url = ""
            if result.get('video_path'):
                try:
                    nova_log("Uploading execution video to GCP...")
                    local_video_path, video_gcp_url = uploadWebExecutionVideo(
                        video_src_path=result['video_path'],
                        args=args,
                        bucket_name='nova_assets'
                    )
                    nova_log(f"✅ Video uploaded successfully: {video_gcp_url}")
                    
                    # Keep local video file after upload
                    cleanupLocalVideo(result['video_path'], keep_local=True)
                except Exception as e:
                    nova_log(f"⚠️ Video upload failed: {str(e)}", e)
                    video_gcp_url = ""
            
            # Upload blind run artifacts to GCP if available
            # if result.get('blind_run'):
            #     try:
            #         nova_log("Uploading blind run artifacts to GCP...")
            #         uploadBlindRunArtifacts(
            #             blind_run_result=result['blind_run'],
            #             args=args,
            #             bucket_name='nova_assets'
            #         )
            #     except Exception as e:
            #         nova_log(f"Blind run upload failed (non-fatal): {str(e)}", e)

            # Emit graph data if available
            _emit_graph_data(args)

            # Determine pass/fail from result
            final_result_lower = str(final_result).lower()
            if 'pass' in final_result_lower or 'success' in final_result_lower:
                nova_log("✅ Test case PASSED")
                state.change_status_to_pass()
                state.add_explanation(final_result)
                state.steps_taken = steps_taken
                
                bucket = construct_bucket_name('nova_assets', args.environment)
                state.log(bucket_name=bucket, upload_to_gcp=True, video_url=video_gcp_url)
                
                return True, 'pass', final_result
            else:
                nova_log("❌ Test case FAILED")
                state.change_status_to_fail()
                state.add_explanation(final_result)
                state.steps_taken = steps_taken
                
                bucket = construct_bucket_name('nova_assets', args.environment)
                state.log(bucket_name=bucket, upload_to_gcp=True, video_url=video_gcp_url)
                
                return False, 'fail', final_result
        else:
            # Execution failed
            error = result.get('error', 'Unknown error')
            nova_log(f"❌ Web test execution failed: {error}")
            
            # Try to upload video even on failure (for debugging)
            video_gcp_url = ""
            if result.get('video_path'):
                try:
                    nova_log("Attempting to upload failure video...")
                    local_video_path, video_gcp_url = uploadWebExecutionVideo(
                        video_src_path=result['video_path'],
                        args=args,
                        bucket_name='nova_assets'
                    )
                    nova_log(f"✅ Failure video uploaded: {video_gcp_url}")
                    cleanupLocalVideo(result['video_path'], keep_local=True)
                except Exception as e:
                    nova_log(f"⚠️ Failure video upload failed: {str(e)}", e)
            
            state.change_status_to_attempt_failed()
            state.add_exceptions([error])
            state.add_explanation(f"Browser-use execution failed: {error}")
            
            bucket = construct_bucket_name('nova_assets', args.environment)
            state.log(bucket_name=bucket, upload_to_gcp=True, video_url=video_gcp_url)
            
            return None, 'attempt_failed', [error]
    
    except Exception as e:
        nova_log(f"❌ Exception in web executor: {str(e)}", e)
        
        # Log failure state
        try:
            # Try to find and upload any recorded video
            video_gcp_url = ""
            try:
                # Check if there's a video in the assets directory
                from pathlib import Path
                videos_dir = Path(__file__).parent / "assets" / "videos"
                if videos_dir.exists():
                    videos = sorted(videos_dir.glob("*.mp4"), key=os.path.getmtime, reverse=True)
                    if videos:
                        latest_video = str(videos[0])
                        nova_log(f"Found exception video: {latest_video}")
                        _, video_gcp_url = uploadWebExecutionVideo(
                            video_src_path=latest_video,
                            args=args,
                            bucket_name='nova_assets'
                        )
                        cleanupLocalVideo(latest_video, keep_local=False)
            except Exception as upload_err:
                nova_log(f"Could not upload exception video: {upload_err}")
            
            state = WebExecutionState(
                state_id='final',
                root_dirpath=args.tc_dirpath,
                user_goal=args.user_goal if hasattr(args, 'user_goal') else "Unknown",
                start_time=start_time
            )
            state.add_ids(
                test_case_id=123456789,
                test_case_under_execution_id=args.test_case_under_execution_id,
                test_run_id=args.test_run_id,
                product_id=args.product_id
            )
            state.change_status_to_attempt_failed()
            state.add_exceptions([str(e)])
            
            bucket = construct_bucket_name('nova_assets', args.environment)
            state.log(bucket_name=bucket, upload_to_gcp=True, video_url=video_gcp_url)
        except:
            pass
        
        return None, 'attempt_failed', [str(e)]


def execute_test_based_goal(args):
    nova_log("Starting web test execution...")
    nova_log(f"App Name: {args.app_name}")
    nova_log(f"Base URL: {args.app_link}")
    nova_log(f"User Goal: {args.text_based_goal}")

    prompt = convert_goal_to_exploratory_browser_prompt(
        goal=args.text_based_goal,
        app_name=args.app_name,
        base_url=args.app_link,
    )

    nova_log("Generated prompt:")
    nova_log("-" * 80)
    nova_log(prompt)
    nova_log("-" * 80)

    agent = NovaWebAgent(goal_driven_mode=True)
    
    # Adjust max_steps for goal-driven mode (needs more steps for autonomous navigation)
    max_steps = 60
    
    # Execute task with video recording
    base_url = args.app_link
    nova_log(f"Executing web test task... (max_steps={max_steps})")
    result = agent.execute_task_sync(
        task=prompt,
        url=base_url,
        max_steps=max_steps,
        save_recording=True  # Enable video recording
    )

    # Define paths for graph and flow data
    # Emit graph data if available
    _emit_graph_data(args)
    





def _emit_graph_data(args):
    """
    Helper function to emit graph and flow data if available in the blind_run assets folder.
    """
    if not args:
        nova_log("Args object is None, skipping graph emission.")
        return

    try:
        from pathlib import Path
        import shutil

        blind_run_folder = Path(__file__).parent / "assets" / "blind_run"
        GRAPH_EXPORT_PATH = blind_run_folder / "graph_blind.json"
        FLOW_EXPORT_PATH = blind_run_folder / "flow_blind.json"

        if blind_run_folder.exists() and GRAPH_EXPORT_PATH.exists() and FLOW_EXPORT_PATH.exists():
            nova_log(f"Emitting graph data from {blind_run_folder}...")
            
            with open(GRAPH_EXPORT_PATH, 'r') as f:
                graph_data = json.load(f) or {}
            
            with open(FLOW_EXPORT_PATH, 'r') as f:
                flows_data = json.load(f) or []

            nodes = graph_data.get('nodes', [])
            edges = graph_data.get('edges', [])
            flows = flows_data

            if hasattr(args, 'product_id') and args.product_id:
                if nodes:
                    _emit_nodes(args.product_id, nodes)
                if edges:
                    for edge in edges:
                        _emit_edge(args.product_id, edge)
                if flows:
                    for flow in flows:
                        _emit_flow(args.product_id, flow)
            else:
                nova_log("Product ID not provided, skipping graph emission.")
            
            # Clean up the folder contents after processing
            nova_log(f"Cleaning up contents of {blind_run_folder}...")
            for item in blind_run_folder.glob('*'):
                if item.is_file():
                    item.unlink()
                elif item.is_dir():
                    shutil.rmtree(item)
                    
        else:
            nova_log(f"Blind run artifacts not found at {blind_run_folder}, skipping graph emission.")
            
    except Exception as e:
        nova_log(f"Graph emission failed (non-fatal): {str(e)}", e)
