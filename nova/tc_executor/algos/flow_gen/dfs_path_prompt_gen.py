"""
    This file reads adj_list as an input and generates all possible paths.
    for each path, it stores corresponding prompt in a text file. 
    The prompt file will be used by a "computer" which will emulate the app test case execution.
"""

import json, os, sys
from utils.utils import nova_log

all_paths = []

def dfs(root, adj_list, path):
    if root not in adj_list:
        all_paths.append(path + [root])
        return
    else:    
        valid_neighbors = []
        for nei in adj_list[root]:
            if nei not in path: valid_neighbors.append(nei)
        if len(valid_neighbors) == 0: 
            all_paths.append(path + [root])
            return
    for nei in valid_neighbors:
        dfs(nei, adj_list, path + [root])

def getAllStartNodes(adj_list, total_nodes):
    all_nodes = {str(i) for i in range(total_nodes)}
    child_nodes = {child for node in adj_list for child in adj_list[node]}
    start_nodes = all_nodes - child_nodes
    return list(start_nodes)

def storePathPromptForComputer(path, id_to_tcid, tcid_to_meta, outdir, path_idx):
    exec_id = 1
    for node_id in path:
        nova_log('Processing node id:', node_id)
        tc_id = id_to_tcid[node_id]
        meta = tcid_to_meta[tc_id]
        preconditions = meta['preconditions']
        tc_description = meta['test_case_description']
        tc_steps_n_results = meta['test_case_steps']
        for tc_step_n_result in tc_steps_n_results:
            step_description = tc_step_n_result['step_description']
            expected_results = tc_step_n_result['expected_results']
            tc_obj = {
                'test_case_description': tc_description,
                'preconditions':preconditions,
                'step_description':step_description,
                'expected_results':expected_results
            }
            tc_string = json.dumps(tc_obj, indent=2)
            
            prompt = (
                '<instruction>\n',
                "You will see an emulator, on the left. You will be given instructions regarding, ",
                'executing a test case. you have to execute the instructions on the emulator. \n',
                '</instruction>\n\n',

                '<test_case_format>\n',
                'test_case_description - only for reference\n',
                'preconditions - only for reference\n',
                'Step description - meant to execute\n',
                'Expected outcome\n',
                'preconditions represents the state on the app. The steps must be executed only if the ',
                'preconditions are met. You do not have to execute any preconditions. They are only ',
                'meant to check. If you see that the preconditions are not matched then only execute ',
                'necessary steps by your own intelligance to meet the preconditions\n',
                '</test_case_format>\n\n',

                '<task>\n',
                'Given the test case, execute the steps on the emulator, ',
                'see if the outcome is matched. If the outcome does not match ',
                'then stop the execution. ',
                'After the execution, you have to generate a report mentioning status ',
                'of the test case execution. Return the following json output:\n',
                '{"Status": Either "Pass" or "Fail", "Rationale": short explaination behind the status}\n',
                'Note that do not return any extra text, only return the JSON output\n',
                '</task>\n\n',

                '<credentials>\n',
                'Depending upon the test cases, you can use the following informations:\n',
                '- Email id: agent+spoony_20250308_0938@qaitech.ai\n',
                '- Password: passwordpassword\n',
                '- Date of Birth: 01-01-1999\n',
                '</credentials>\n\n',

                '<mobile_usage_guidelines>\n',
                '1 - A check box is considered as clicked if it turns pink.\n',
                '2 - If you want to scroll, first click the left mouse key and drag the mouse down/up to scroll down/up on the mobile screen\n',
                '</mobile_usage_guidelines>\n\n',

                '<strict_instructions>\n',
                '1 - Always double check the cursor coordinates twice\n',
                '2 - Some actions might introduce loading, if you see any loading symbol on button or ',
                'somewhere else, introduce wait for 2 seconds until loading is finished and then ',
                'take the screenshot.\n',
                '</strict_instructions>\n\n',

                'Following is the test case details:\n',
                f'{tc_string}'
            )
            prompt = ''.join(prompt)
            outfilepath = os.path.join(outdir, 'path_'+str(path_idx)+'_'+'execId_'+str(exec_id)+'.txt')
            exec_id += 1
            with open(outfilepath, 'w') as outfileobj:
                outfileobj.write(prompt)
            nova_log('Prompt updated in', outfilepath, '...')

if __name__ == '__main__':
    tcid_to_meta = {}
    feat_id_from_directory = sys.argv[1]
    feats_filepath = f"/Users/dwijesh/qai/local_codebase/computer/claude-computer-use-macos/data/spoony/features_{feat_id_from_directory}.json"
    with open(feats_filepath, 'r') as infileobj:
        all_tcs = json.load(infileobj)['test_cases']
        for tc in all_tcs:
            feat_id = tc['test_case_id']
            tcid_to_meta[feat_id] = tc

    outdir = f'path_prompts/feature_{feat_id_from_directory}'
    os.makedirs(outdir, exist_ok = True)

    with open(f'./adj_lists/adj_list_with_meta_{feat_id_from_directory}.json', 'r') as infileobj:
        adj_list_with_meta = json.load(infileobj)
        adj_list = adj_list_with_meta['adj_list']
        id_to_tcid = adj_list_with_meta['testCaseId_to_featId']
    
    start_nodes = getAllStartNodes(adj_list, len(id_to_tcid))
    for start_node in start_nodes:
        nova_log('Doing dfs from node:', start_node)
        dfs(start_node, adj_list, [])
    nova_log(f'Total dfs paths found: {len(all_paths)}')
    nova_log('DFS paths:')
    for i, path in enumerate(all_paths):
        nova_log(path)
        storePathPromptForComputer(path, id_to_tcid, tcid_to_meta, outdir, i+1)


