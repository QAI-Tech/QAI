import os, sys, json, shutil, time
from utils.utils import nova_log

temp_monkey_run = {
  "test_run_id": "tr_id",
  "product_id": "p_id",
  "product_name": "Faircado",
  "executable_url": "https://play.google.com/store/apps/details?id=com.faircado",
  "test_case_reference": [],
  "mode": "MONKEY_RUN",

  "monkey_timeout_in_mins": 2,
  "app_installation_time_sec": 60,
  "delay_in_sec": 3,
  "time_out_in_mins": 17,
}

monkey_run = {
  "test_run_id": "5651076850122752",
  "product_id": "5637463045308416",
  "product_name": "Faircado Nova Demo",
  "executable_url": "https://play.google.com/store/apps/details?id=com.faircado&hl=en_IN",
  "test_case_reference": [],
  "mode": "MONKEY_RUN",

  "monkey_timeout_in_mins": 2,
  "app_installation_time_sec": 60,
  "delay_in_sec": 3,
  "time_out_in_mins": 17,
}

stc1 = {
        "test_case": {
          "test_case_id": "5765544271675392",
          "feature_id": "5629651439321088",
          "product_id": "5637463045308416",
          "functionality_id": "5659713039499264",
          "request_id": "5642167561224192",
          "screenshot_url": "https://storage.cloud.google.com/nova_assets/5637463045308416/5676903646101504/5155690523918336/state_final/before_ss.png",
          "preconditions": [
            "User is on the Home screen"
          ],
          "test_case_description": "Verify that the user can perform a search and view the search results.",
          "test_case_steps": [
            {
              "test_step_id": "e8284046-8c55-425c-9259-f3ca7b074880",
              "step_description": "Type the search query in \"What are you looking for?\" field",
              "expected_results": [
                "When the user clicks on the search bar, a dropdown menu appears below the search bar displaying auto-suggestions.",
                "A cancel button appears to the right of the search bar allowing the user to clear the search input.",
                "The placeholder text \"What are you looking for?\" disappears when the search input field is focused/clicked."
              ]
            }
          ],
          "test_case_type": "SMOKE",
          "rationale": "",
          "status": "RAW",
          "review_status": None,
          "review_result": None,
          "sort_index": None,
          "credentials": None,
          "parameters": None,
          "comments": None,
          "criticality": "HIGH"
        },
        "tcue_id": "5191252920238080",
        "test_case_id": "5765544271675392"
      }

plan_and_exec=  {
    "test_run_id": "5745156196139008",
    "product_id": "5637463045308416",
    "product_name": "Faircado Nova Demo",
    "executable_url": "https://play.google.com/store/apps/details?id=com.faircado&hl=en_IN",
    "monkey_run_output": "5637463045308416/5651076850122752/monkey_run_output/20250602_171206",
    "test_case_reference": [
      stc1
    ],
    "mode": "GOAL_FORMULATION_AND_EXECUTION",
    "app_installation_time_sec": 60,
    "delay_in_sec": 3,
    "time_out_in_mins": 17,
}

print('-------- Monkey run - real parameter ------')
nova_log(json.dumps(monkey_run), '\n')

print('-------- Monkey run - fake paramters ------')
nova_log(json.dumps(temp_monkey_run), '\n')

print('-------- Plan and execute ------')
nova_log(json.dumps(plan_and_exec))
