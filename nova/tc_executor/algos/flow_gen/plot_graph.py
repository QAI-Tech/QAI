from graphviz import Digraph
import json, os, sys
from plot_sample_paths import plotSamplePaths
from utils.utils import nova_log

def plotGraph(adj_list, outdirpath, feat_id, node_labels=None):
    dot = Digraph()
    dot.clear()
    
    """ adding nodes """
    if node_labels:
        for node, label in node_labels.items():
            dot.node(str(node), label=label)
    else:
        for node in adj_list:
            dot.node(str(node))

    """ adding edges """
    for node, neighbors in adj_list.items():
        for neighbor in neighbors:
            dot.edge(str(node), str(neighbor))
    
    nova_log('rendering graph...')
    dot.render(os.path.join(outdirpath, f"all_tcs_feat{feat_id}"), format="png", view=True)

def cleanAdjList(adj_list):
    new_adj_list = {}
    for key, values in adj_list.items():
        new_adj_list[str(key)] = [str(v) for v in values]
    adj_list = new_adj_list.copy()
    del_keys = []
    for key, value in adj_list.items():
        if len(value) == 0: del_keys.append(key)
    for del_key in del_keys:
        del adj_list[del_key]
    return adj_list

def padAdjList(adj_list, total_nodes):
    new_adj_list = {}
    for key, values in adj_list.items():
        new_adj_list[str(key)] = [str(v) for v in values]
    adj_list = new_adj_list.copy()
    missing_nodes = [str(i) for i in range(total_nodes) if str(i) not in adj_list]
    nova_log(f'missing node ids: {missing_nodes}')
    for missing_node in missing_nodes:
        adj_list[missing_node] = []
    return adj_list

if __name__ == '__main__':
    feat_id = sys.argv[1]
    outdirpath = f'plots/feature_{feat_id}'
    os.makedirs(outdirpath, exist_ok=True)
    with open(f'./adj_lists/adj_list_with_meta_{feat_id}.json', 'r') as infileobj:
        adj_list_with_meta = json.load(infileobj)
    testCaseId_to_meta = adj_list_with_meta['testCaseId_to_meta']
    testCaseId_to_featId = adj_list_with_meta['testCaseId_to_featId']
    adj_list = adj_list_with_meta['adj_list'] # str key, int values
    #adj_list = cleanAdjList(adj_list) # TODO use this if graph is large
    adj_list = padAdjList(adj_list, len(testCaseId_to_featId))
    plotGraph(adj_list, outdirpath, feat_id)
    with open(os.path.join(outdirpath, 'testCaseId_to_meta.txt'), 'w') as outfileobj:
        for testCaseId, meta in testCaseId_to_meta.items():
            outfileobj.write( str(testCaseId) + ":\n" + meta + '\n\n')
    #plotSamplePaths(adj_list, testCaseId_to_meta, 1, outdirpath)
