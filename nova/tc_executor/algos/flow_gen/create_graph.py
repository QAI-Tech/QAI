import json
import anthropic
import math
from graphviz import Digraph
import sys, os
from utils.utils import nova_log

API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
client = anthropic.Anthropic(api_key=API_KEY)
model_name = "claude-3-7-sonnet-20250219"

def claudeCall(prompt):
    response = client.messages.create(
        model=model_name,
        max_tokens=20000,
        messages=[{"role": "user", "content": prompt}]
    )

    response = response.content[0].text
    return response

def getPromptGraph(id_to_meta):
    prompt = (
        "I will provide you test cases. ",
        "The Test cases check functionalities of an app. ",
        "For each id, the meta information is in the following format: ",
        "Preconditions separated by comma [optional]\n\n",
        "Step Description\n",
        "Expected Results separated by comma\n\n",
        "There can be multiple step descriptions and expected result pairs.", 
        "Each test case has its unique id associated with it.\n\n",

        "Consider each test case as a node in a graph. You have to identify ",
        "edges in the graph. There will be a directed edge from node a to b if ",
        "node a's expected output matches with preconditions of node b. ",
        "You have to identify all possible edges in the graph and return adjecency list. ",
        "For all the nodes which are left unassigned to other nodes, re-assess them in the following way: ",
        "edge from a to b is possible even if immediately the preconditions of b and output of a are ",
        "are not matched but instead, after some intermediate hidden steps from a, leads to b\n\n",

        "You have to return in the following json format. Do not return any extra text. ",
        "You have to return only the json object output. Return one dictionary only. ",
        "For nodes that has empty adjecency list, do not include them in the adjecency list\n\n",
        
        '{source_id - integer type: [dest_ids - string type] }\n\n',

        'Following are the test cases in the json format:',
        f'{json.dumps(id_to_meta, indent=1)}\n'
    )
    return ''.join(prompt)

if __name__ == '__main__':
    feat_id_in_directory = sys.argv[1]
    feats_filepath = f"/Users/dwijesh/qai/local_codebase/computer/claude-computer-use-macos/data/spoony/features_{feat_id_in_directory}.json"
    with open(feats_filepath, 'r') as infileobj:
        all_feats = json.load(infileobj)
    nova_log('# Test cases:', len(all_feats['test_cases']))
    testCaseId_to_meta = {}
    testCaseId_to_featId = {}
    for i, feat in enumerate(all_feats['test_cases']):
        feat_id = feat['feature_id']
        tc_id = feat['test_case_id']
        meta = ','.join(feat['preconditions']) + '\n\n'
        for test_case_step in feat['test_case_steps']:
            meta += test_case_step['step_description'] + '\n'
            meta += ','.join(test_case_step['expected_results']) + '\n\n'
        testCaseId_to_meta[i] = meta
        testCaseId_to_featId[i] = tc_id

    prompt = getPromptGraph(testCaseId_to_meta)
    nova_log('Estimated total tokens in the prompt:', math.ceil(len(prompt)/4))
    
    for i in range(5):
        try:
            response = claudeCall(prompt)
            adj_list = json.loads(response)
            break
        except Exception as e:
            nova_log('Exception raised:', e)
            nova_log(f'{i+1}th trial failed...')

    output = {
        "testCaseId_to_meta": testCaseId_to_meta,
        "testCaseId_to_featId": testCaseId_to_featId,
        "adj_list": adj_list
    }
    os.makedirs('adj_lists', exist_ok=True)
    outfilepath = os.path.join('adj_lists', f'adj_list_with_meta_{feat_id_in_directory}.json')
    with open(outfilepath, 'w') as outfileobj:
        json.dump(output, outfileobj, indent=2)
    
    







"""

def getPromptDuplicates(id_to_meta):
    prompt = (
        "I will provide you test cases. ",
        "The Test cases check functionalities of an app. ",
        "For each id, the meta information is in the following format: ",
        "Preconditions separated by comma\n\n",
        "Step Description\n",
        "Expected Results separated by comma\n\n",
        "There can be multiple step descriptions and expected result pairs.", 
        "Each test case has its unique id associated with it.\n\n",

        "Your task is to identify potential duplicates. ",
        "You have to return in the following json format. Do not return any extra text. ",
        "You have to return only the json object output. \n\n",

        '{"test_case_id": [potential duplicate ids of test_case_ids]}\n\n',
        
        "Note that, be very strict with duplicates, if you think two test cases are trying to achive ",
        "exactly the same outcome, only then consider them as duplicates.\n\n",

        'Following are the test cases in the json format:',
        f'{json.dumps(id_to_meta, indent=1)}\n'
    )
    return ''.join(prompt)
"""
