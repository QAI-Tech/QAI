import os, sys, json
from claude_computer import claudeComputer

def getPrompt(dt):
    prompt = (
        'Execute the following sequence of step. ',
        'Do not take any screenshot. do not think. Just execute the command. ',
        'No need to justify the steps. No verification needed\n\n',
        'Execute the following\n',
        f'{json.dumps(dt, indent=1)}'
    )
    prompt = ''.join(prompt)
    return prompt

def addSleep(dts, pattern_dt):
    new_dts = []
    for dt in dts:
        new_dts.append(dt)
        new_dts.append(pattern_dt)
    new_dts = new_dts[:-1]
    return new_dts

if __name__ == '__main__':
    with open('onboarding_atomic_steps.json', 'r') as infileobj:
        d = json.load(infileobj)
        all_tc_steps = d['all_steps']
        half_sleep = d['sleep_0.5']
    for tc_steps in all_tc_steps:
        slow_tc_steps = addSleep(tc_steps, half_sleep)
        print('-------------- Executing the following tc -----------------')
        print(json.dumps(slow_tc_steps, indent=2))
        print('-----------------------------------------------------------')
        prompt = getPrompt(slow_tc_steps)
        claudeComputer(prompt)
