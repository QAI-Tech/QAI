import random
from graphviz import Digraph

def find_starting_nodes(adj_list):
    """Find nodes that have no incoming edges."""
    all_nodes = set(adj_list.keys())
    child_nodes = {child for children in adj_list.values() for child in children}
    return list(all_nodes - child_nodes)

def dfs_find_path(adj_list, start):
    """Finds a single path from start using DFS (avoiding cycles)."""
    print('!!!!!! ---------- Warning ---------- !!!!!!!')
    print('Current DFS method only returns one path')
    print('!!!!!! ----------------------------- !!!!!!!')
    stack = [(start, [start])]
    last_path = [start]
    while stack:
        node, path = stack.pop()
        last_path = path
        print('Processing dfs node:', node)
        # If the node has no outgoing edges, return this path
        if node not in adj_list or not adj_list[node]:
            print('Exit called')
            return path
        
        # Shuffle neighbors for random path selection
        neighbors = list(adj_list[node])
        random.shuffle(neighbors)
        print('Neighbors:', neighbors)
        
        for neighbor in neighbors:
            if neighbor not in path:  # Avoid cycles
                stack.append((neighbor, path + [neighbor]))
    
    return last_path  # No valid path found

def plotGraph(adj_list, path_id, node_labels=None):
    dot = Digraph()
    dot.clear()

    # Add nodes with labels
    if node_labels:
        for node, label in node_labels.items():
            dot.node(str(node), label=label)
    else:
        for node in adj_list:
            dot.node(str(node))

    # Add edges
    for node, neighbors in adj_list.items():
        for neighbor in neighbors:
            dot.edge(str(node), str(neighbor))

    print('Rendering graph...')
    dot.render(f"sample_path_{path_id}", format="png", view=True)

def plotSamplePaths(adj_list, testCaseId_to_meta, path_count, outdirpath):
    start_nodes = find_starting_nodes(adj_list)
    print('Starting nodes:\n', start_nodes)
    
    # For a huge graph, use below line to only consider subset of start nodes
    #selected_starts = random.sample(start_nodes, min(path_count, len(start_nodes)))
    selected_starts = start_nodes
    print(f"Selected starting nodes: {selected_starts}")

    for i, start in enumerate(selected_starts):
        """ Current DFS method only returns 1 path -- update it """
        path = dfs_find_path(adj_list, start)  #TODO
        
        if not path:
            print(f"No valid path found from {start}")
            continue

        print(f"Path {i+1}: {path}")
        # Create adjacency list for this specific path
        path_adj_list = {node: [path[j + 1]] if j + 1 < len(path) else [] for j, node in enumerate(path)}
        print('Adj list:\n', path_adj_list)

        # Map node descriptions
        node_labels = {node: testCaseId_to_meta.get(str(node), str(node)) for node in path}
        print('node labels\n', node_labels)
        
        # Plot this specific path
        plotGraph(path_adj_list, i, node_labels)

