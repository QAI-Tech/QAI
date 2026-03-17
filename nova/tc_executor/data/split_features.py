import os, sys, json

if __name__ == '__main__':
    feats_filepath = sys.argv[1]
    with open(feats_filepath, 'r') as infileobj:
        feats_json = json.load(infileobj)
    tcs = feats_json['test_cases']
    featid_to_tcs = {}
    for tc in tcs:
        feat_id = tc['feature_id']
        if feat_id in featid_to_tcs: featid_to_tcs[feat_id].append(tc)
        else: featid_to_tcs[feat_id] = [tc]
    
    total_tcs = 0
    for featid, _tcs in featid_to_tcs.items():
        total_tcs += len(_tcs)
    print('Total tcs:', total_tcs)
    print('match with:', len(tcs))
    print('#unique feats:', len(featid_to_tcs))

    i = 1
    for featid, tc_list in featid_to_tcs.items():
        outfilename = f'features_{i}.json'
        out_dt = {'test_cases': tc_list}
        with open(outfilename, 'w') as outfileobj:
            json.dump(out_dt, outfileobj, indent=2)
        i += 1
