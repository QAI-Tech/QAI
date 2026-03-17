gen:
	rm -rf flows/
	python3 run_generator.py \
			--tc_dirpath flows/spoony_signup \
			--user_goal "User wants to create an account. Create a new account. As soon as the user email verification screen appears, the goal is reached. You do not have to enter the verification code. Just terminate in that case" \
			--email_format "agent+spoony_<UID>@qaitech.ai"
	python3 create_executable_tcs.py \
			--tc_dirpath flows/spoony_signup
	rm -rf temp
	python3 run_generator.py \
			--tc_dirpath temp \
			--user_goal "Go back until home page of spoony app appears"\
			--email_format "agent+spoony_<UID>@qaitech.ai"

format:
	python3 create_executable_tcs.py \
			--tc_dirpath flows/spoony_signup
exec:
	rm -rf executor_logs
	python3 run_executor.py \
			--tc_dirpath flows/spoony_signup \
			--log_dirpath executor_logs/ \
			--email_format "agent+spoony_<UID>@qaitech.ai"

test:
	rm -rf temp
	python3 run_generator.py \
			--tc_dirpath temp \
			--user_goal "Go back until home page of spoony app appears" \
			--email_format "agent+spoony_<UID>@qaitech.ai"


