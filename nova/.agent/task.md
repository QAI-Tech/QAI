# Task: Implement Precondition User Goal Generation

- [x] Implement `create_precondition_user_goal` in `tc_generator/main.py` <!-- id: 0 -->
- [x] Update `convert_interactions_to_prompt` in `tc_generator/main.py` to match new structure <!-- id: 1 -->
- [x] Fix `video_url` format in `main.py` <!-- id: 2 -->
- [x] Handle `anthropic.NotFoundError` in `claudeComputer` <!-- id: 3 -->
- [x] Update tool definitions (`computer`, `bash`, `text_editor`) to 2025 versions for compatibility with `claude-opus-4-5` <!-- id: 4 -->
- [x] Revert tool definitions to 2024 versions as 2025 versions are not yet supported in the SDK's expected tags <!-- id: 5 -->
- [x] Configure hybrid tool versions (Computer: 2024, Bash: 2025, Editor: 2025) to satisfy Opus 4.5 requirements <!-- id: 6 -->
- [x] Integrate `geminiTwoImageQuery` in `tc_generator/main.py` to infer expected results from `tc_ss_paths` images <!-- id: 7 -->
- [x] Add and use `EXPECTED_RESULTS_FROM_IMAGES_PROMPT` in `tc_generator/prompts.py` and `tc_generator/main.py` <!-- id: 8 -->
- [x] Create `verification_agent.py` in `droidrun/agent/oneflows/` <!-- id: 9 -->
- [x] Update `system.jinja2` with keyboard handling instructions <!-- id: 10 -->
- [x] Correct `input_keyevent` to `press_key` in `system.jinja2` <!-- id: 11 -->
