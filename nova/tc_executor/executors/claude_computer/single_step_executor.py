import os, sys, json
from claude_computer import claudeComputer

if __name__ == "__main__":

    tc = {
        "test_case_description": "",
        "preconditions": [],
        "test_case_steps": {
            "step_description": "",
            "expected_results": []
        }
    }

    tc['test_case_description'] = "verify that the user can not continue in the signup process without entering the phone number"
    tc['preconditions'] = ['User is on the create account screen']
    step1 = {'step_description' : "Enter a valid Email in the 'Email' input field",
             'expected_results': ['The email is shown']
             }
    step2 = {'step_description' : 'Enter a password in "Password" input field',
             'expected_results': ['The password is masked']
             }
    step3 = {'step_description': "Enter the same password in the 'Confirm Password' input field",
             'expected_results': ['The password is masked']
             }
    step4 = {'step_description': 'Tap on the create account button',
             'expected_results': ['An error message is desplayed indicating to enter a phone number']
             }
    tc['test_case_steps'] = [step1, step2, step3, step4]

    def getPrompt():
        global tc
        prompt = (
            '<TASK>\n'
            'You have to execute and verify following test case on the emulator. ',
            'You will be given the following in the test case: \n',
            '1 - test_case_description - which is about test case\n',
            '2 - preconditions - execute the test case only if the preconditions are met already\n',
            '3 - step_description - the step that you have to execute on the emulator\n',
            '4 - expected_results - verify if the expected output matches with ',
            'the state of the screen after execution.\n',
            '</TASK>\n\n',

            '<OUTPUT_FORMAT>\n',
            'Return a json output in the following format:\n',
            '{"Status": either "pass" or "fail" depending upon verifying with expected_results, ',
            '"rationale": "rationale behind the status"}\n',
            'Note that, do not return any extra text or explaination other than the output json object\n',
            '</OUTPUT_FORMAT>\n\n',

            '<PARAMETERS>\n',
            'Use email: agent+spoony_20250325_1813@qaitech.ai\n',
            'Use password: YrScLn5u@@\n',
            '</PARAMETERS>\n\n',

            '<TEST_CASE>\n',
            f'{json.dumps(tc, indent=1)}\n',
            '</TEST_CASE>\n\n'
        )
        prompt = ''.join(prompt)
        return prompt

    prompt = getPrompt()
    print('---------------- Executing the following prompt ----------------')
    print(prompt)
    print('----------------------------------------------------------------')

    response, atomic_steps = claudeComputer(prompt)
    print('------------ Claude response ------------')
    print(response)
    print('-----------------------------------------')
