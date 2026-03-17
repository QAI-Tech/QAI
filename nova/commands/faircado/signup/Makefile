gen:
	rm -rf flows/
	python3 run_generator.py \
			--tc_dirpath flows/faircado_signup \
			--user_goal "User wants to create an account. Create an account and terminate when you reach to home screen of the faircado app." \
			--email_format "qai_agent_<UID>@yopmain.com"
	python3 create_executable_tcs.py \
			--tc_dirpath flows/faircado_signup
exec:
	rm -rf executor_logs
	python3 run_executor.py \
			--tc_dirpath flows/faircado_signup \
			--log_dirpath executor_logs/ \
			--email_format "qai_agent_<UID>@yopmain.com"
