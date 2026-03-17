import os, sys, json

def createExecutableTCs(dirpath):
    # collect all states
    states = os.listdir(dirpath)
    n = 0
    for state in states:
        if os.path.isdir(os.path.join(dirpath, state)):
            if os.path.exists(os.path.join(dirpath, state, 'log.json')):
                n += 1

    # iterate states and collect tcs
    tcs = []
    for i in range(n):
        state = f'state_{i}'
        if state not in states: 
            raise Exception(f'state_{i} not present')
        state_path = os.path.join(dirpath, state)

        log_filepath = os.path.join(state_path, 'log.json')
        with open(log_filepath, 'r') as infileobj:
            logs = json.load(infileobj)
            tc = logs['test_case']
            tcs.append(tc)

    # write to tcs.json
    outfilepath = os.path.join(dirpath, 'tcs.json')
    with open(outfilepath, 'w') as outfileobj:
        json.dump(tcs, outfileobj, indent=2)
