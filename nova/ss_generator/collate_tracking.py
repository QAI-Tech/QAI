import os, sys, json, shutil

def selectClicks(events):
    clicks = []
    for event in events:
        if (event['type']=="click_down") or (event['type'] == 'click_up'):
            clicks.append(event)
        if (event['type'] == "key_down") or (event['type'] == 'key_up'):
            clicks.append(event)
    return clicks

def getCursorPress(events, i):
    press = {}
    press['start_time'] = events[i]['time']
    press['click_duration'] = round(events[i+1]['time'] - events[i]['time'], 2)
    press['x_displacement'] = round(events[i+1]['x'] - events[i]['x'], 2)
    press['y_displacement'] = round(events[i+1]['y'] - events[i]['y'], 2)
    return press

def getKeyPress(events, i):
    press = {}
    press['start_time'] = events[i]['time']
    press['typed_key'] = events[i]['key']
    return press

def combinePairs(events):
    pairs = []
    n = len(events)
    i = 0
    while (i < n):
        if (events[i]['type'] == 'click_down'):
            press = getCursorPress(events, i)
            i += 2
            pairs.append(press)
        elif (events[i]['type'] == 'key_down'):
            press = getKeyPress(events, i)
            i += 1
            pairs.append(press)
        else: i += 1
    return pairs

def mergeTypedKeys(events):
    new_events = []
    typed_key_list = []
    curr_string = ""
    for event in events:
        print('Curr_string - ', curr_string)
        if 'typed_key' in event:
            if len(event['typed_key']) == 1:
                curr_string += event['typed_key']
                continue
            if event['typed_key'] == 'Key.shift':
                continue
            else:
                if len(curr_string) != 0:
                    typed_key_list.append(curr_string)
                    curr_string = ""
                typed_key_list.append(event['typed_key'])
            continue
        else:
            if len(curr_string) != 0:
                typed_key_list.append(curr_string)
                curr_string = ""
            if len(typed_key_list) != 0:
                new_events.append({"typed_key_list": typed_key_list})
                typed_key_list = []
                continue
        new_events.append(event)
    return new_events

def removeLastClick(events):
    last_id = None
    for i, event in enumerate(events):
        if 'x_displacement' in event: #Click
            last_id = i
    if last_id:
        print(f'Removing {last_id} indexed element')
        return events[:i] + events[i+1:]

if __name__ == "__main__":
    filepath = 'cursor_logs/cursor_events.json'
    with open(filepath, 'r') as infileobj:
        events = json.load(infileobj)
    events = selectClicks(events)
    events = combinePairs(events)
    events = mergeTypedKeys(events)
    events = removeLastClick(events)
    with open('cursor_logs/extracted_clicks.json', 'w') as outfileobj:
        json.dump(events, outfileobj, indent=2)
    print('Number of clicks = ', len(events))
