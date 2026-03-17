from tc_executor.vision import getSS
import os, sys, json, shutil
from tc_generator.state import State 
from gcp_upload.log_states import uploadVideoToGCP
import cv2
import subprocess, time
import imageio
import logging
from pathlib import Path
import sentry_sdk
import traceback
from tc_executor.constants import BUCKET_NAME
import base64

class CustomFormatter(logging.Formatter):
    def format(self, record):
        try:
            record.filename = Path(record.pathname).relative_to(Path.cwd()).as_posix()
        except ValueError:
            record.filename = Path(record.pathname).name
        return super().format(record)


logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.handlers = []
handler = logging.StreamHandler()
handler.setFormatter(
    CustomFormatter(
        "%(asctime)s,%(msecs)03d %(levelname)-8s [%(filename)s:%(lineno)d] %(message)s",
        datefmt="%Y-%m-%d:%H:%M:%S",
    )
)
logger.addHandler(handler)


# precon_actions, tc_actions, ss_paths
def fetchPreconFromKG(root_kg_path, precon_flowids, kg, flows):
    precon_actions, tc_actions, ss_paths, tc_ss_paths, tc_node_ids = [], [], [], [], []
    flowid_to_nodeids = {}
    for flow in flows:
        flowid_to_nodeids[flow['id']] = flow['pathNodeIds']

    edge_to_action = {}
    for edge in kg['edges']:
        source, target = edge["source"], edge["target"]
        edge_to_action[f'{source}_{target}'] = edge['data']['description']

    precon_node_ids = []
    if len(precon_flowids) >= 2:
        precon_node_ids = [flowid_to_nodeids[precon_flowids[0]][0]]
        for i in range(0, len(precon_flowids)-1, 1):
            precon_node_ids += flowid_to_nodeids[precon_flowids[i]][1:]
        tc_node_ids = flowid_to_nodeids[precon_flowids[-1]]
        
    for i in range(0, len(precon_node_ids) - 1, 1):
        source, target = precon_node_ids[i], precon_node_ids[i + 1]
        precon_actions.append(edge_to_action[f'{source}_{target}'])
    for i in range(0, len(tc_node_ids)-1, 1):
        source, target = tc_node_ids[i], tc_node_ids[i + 1]
        tc_actions.append(edge_to_action[f'{source}_{target}'])
    for node_id in (precon_node_ids + tc_node_ids[1:]):
        ss_paths.append(os.path.join(root_kg_path, f'{node_id}.png'))
    for node_id in tc_node_ids:
        tc_ss_paths.append(os.path.join(root_kg_path, f'{node_id}.png'))
    return precon_actions, tc_actions, ss_paths, tc_ss_paths

"""
    root_kg_path(upto product_id) -> version -> [ node_id.png ]
    for every product id, maintain one latest kg version. delete old one, store new one
    if version aldready exists, return with path to it
    
    Now fetches graph data from collaboration API instead of GCS.
"""
def storeKGSSs(args):
    from utils.collaboration_client import collaboration_manager

    tc_flowid = args.tc_flowid

    root_local_kg_path = os.path.join('kg_logs', str(args.product_id))
    version_local_path = os.path.join(root_local_kg_path, args.kg_version)
    graph_local_path = os.path.join(version_local_path, 'graph-export.json')
    flows_local_path = os.path.join(version_local_path, 'flow-export.json')

    if os.path.exists(graph_local_path) and os.path.exists(flows_local_path):
        print(f'{graph_local_path} already exists...')
        with open(graph_local_path, 'r') as infileobj:
            kg = json.load(infileobj)
        with open(flows_local_path, 'r') as infileobj:
            flows = json.load(infileobj)
        #TODO - apply check if all the node screenshots are also present
        return version_local_path, kg, flows
    
    print(f'{args.product_id}, {args.app_name} does not exist for the latest version of kg')
    if os.path.exists(root_local_kg_path):
        shutil.rmtree(root_local_kg_path)
    os.makedirs(version_local_path, exist_ok=True)

    # Fetch graph data from collaboration API
    artifacts = collaboration_manager.get_graph_data(args.product_id)
    kg = artifacts.get("graph") or {}
    flows = artifacts.get("flows") or []

    # Cache locally for future use
    with open(graph_local_path, 'w') as outfileobj:
        json.dump(kg, outfileobj)
    with open(flows_local_path, 'w') as outfileobj:
        json.dump(flows, outfileobj)
    print(f'Fetched graph data from collaboration API and cached locally')

    for node in kg.get('nodes', []):
        node_id = node['id']
        base64_string = node.get('data', {}).get('image', '')
        if not base64_string:
            continue
        if base64_string.startswith("data:image"):
            base64_string = base64_string.split(",")[1]
        image_data = base64.b64decode(base64_string)
        with open(os.path.join(version_local_path, f'{node_id}.png'), "wb") as f:
            f.write(image_data)
    print(f'Stored the sss in {version_local_path} directory')
    return version_local_path, kg, flows
    

def processFlowDir(flow_dirpath):
    # check if the flow is already correct
    dirnames = os.listdir(flow_dirpath)
    dirnames = [d for d in dirnames if os.path.isdir(os.path.join(flow_dirpath, d))]
    unsuccessful_dirnames = [d for d in dirnames if 'unsuccessful' in d]
    if len(unsuccessful_dirnames) == 0:
        print(f'No unsuccessful state present. {flow_dirpath} is ready to use.')
    else:
        print(f'Unseccessful states are present in {flow_dirpath}. Cleaning it up')
    
    # flow is incorrect
    raw_dirpath = f'{flow_dirpath}_raw'
    shutil.move(flow_dirpath, raw_dirpath)
    os.makedirs(flow_dirpath)
    index = 0
    for raw_index in range(len(dirnames)):
        c_state, w_state = f'state_{raw_index}', f'state_{raw_index}_unsuccessful'
        if c_state in dirnames:
            source_path = os.path.join(raw_dirpath, c_state)
            dest_path = os.path.join(flow_dirpath, f'state_{index}')
            index += 1
            if os.path.exists(os.path.join(source_path, 'log.json')):
                shutil.copytree(source_path, dest_path)
        else:
            assert (w_state in dirnames), f"{w_state} not present in the logged directories"
    print(f'{index} states are written in {flow_dirpath}')
    return

def printJudgement(msg):
    for i in range(3): print('----------------------------------------')
    print(f'-------------- {msg} ---------------')
    for i in range(3): print('----------------------------------------')

def logFinalState(status, args, exceptions=[], explanation="", video_url=""):
    ss = getSS()
    adb_ss = getSS(is_adb=True)
    state = State('final', args.tc_dirpath, ss, ss, ss, adb_ss, adb_ss, {}, None, {'status':True}, args.user_goal, time.time())

    if len(exceptions)!= 0: state.addExceptions(exceptions)
    if len(explanation) != 0: state.addExplanation(explanation)
    if status == 'retry': state.changeStatusToRetrying()
    if status == 'pass': state.changeStatusToPass()
    if status == 'fail': state.changeStatusToFail()
    if status == "attempt_failed": state.changeStateToAttemptFailed()
    state.addIds(123456789, args.test_case_under_execution_id, args.test_run_id, args.product_id)
    bucket = construct_bucket_name('nova_assets', args.environment)
    state.log(bucket, upload_to_gcp=True, video_url=video_url)

def nova_log(message: str, error: Exception | None = None):
    # Get the caller's information using stack inspection
    stack = traceback.extract_stack()
    if len(stack) >= 2:  # We need at least 2 frames (current and caller)
        caller_frame = stack[-2]  # -2 because -1 is the current frame
        filename = caller_frame.filename
        lineno = caller_frame.lineno or 0  # Provide default value if None
        function = caller_frame.name
    else:
        # Fallback to basic logging if we can't get stack info
        if error:
            message_to_log = f"{message}\nError: {error}\nStack trace:\n{''.join(traceback.format_tb(error.__traceback__))}"
            logger.error(message_to_log)
        else:
            logger.info(message)
        return

    # Create the full message including error info if present
    full_message = message
    if error:
        full_message = f"{message}\nError: {error}\nStack trace:\n{''.join(traceback.format_tb(error.__traceback__))}"

    # Create a custom record with caller's information
    record = logging.LogRecord(
        name=logger.name,
        level=logging.ERROR if error else logging.INFO,
        pathname=filename,
        lineno=lineno,
        msg=full_message,
        args=(),
        exc_info=(type(error), error, error.__traceback__) if error else None,
        func=function,
    )

    logger.handle(record)

    if error:
        sentry_sdk.capture_exception(error)

def saveVideoLocally(image_paths, outfilepath, duration_per_image, fps):
    # Read first image to get resolution
    writer = imageio.get_writer(outfilepath, fps=fps, codec='libx264', format='mp4')

    for path in image_paths:
        img = cv2.imread(path)
        if img is None:
            raise FileNotFoundError(f"Cannot read image: {path}")
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        for _ in range(int(duration_per_image * fps)):
            writer.append_data(img_rgb)

    writer.close()
    print(f"Video saved to: {outfilepath}")

def createNUploadVideo(args):
    src_outpath = os.path.join(args.tc_dirpath, 'execution_video.mp4')
    dst_outpath=f"{args.product_id}/{args.test_run_id}/{args.test_case_under_execution_id}/execution_video.mp4"
    
    image_paths, state_counter = [], 0
    dirs = [d for d in os.listdir(args.tc_dirpath) if os.path.isdir(os.path.join(args.tc_dirpath, d))]
    last_after_ss_path = ""
    while True:
        dir1, dir2 = f'state_{state_counter}', f'state_{state_counter}_unsuccessful'
        if dir1 in dirs:
            image_paths.append(os.path.join(args.tc_dirpath, dir1, 'before_ss_adb.png'))
            last_after_ss_path = os.path.join(args.tc_dirpath, dir1, 'after_ss_adb.png')
        elif dir2 in dirs:
            image_paths.append(os.path.join(args.tc_dirpath, dir2, 'before_ss_adb.png'))
            last_after_ss_path = os.path.join(args.tc_dirpath, dir2, 'after_ss_adb.png')
        else:
            break
        state_counter += 1
    
    image_paths.append(last_after_ss_path)
    saveVideoLocally(image_paths, src_outpath, args.duration_per_image, args.fps)
    bucket = construct_bucket_name(BUCKET_NAME, args.environment)
    uploadVideoToGCP(src_outpath, bucket, dst_outpath)

def construct_bucket_name(bucket_name: str, environment: str) -> str:
    """
    Constructs the full GCS bucket name along with the environment prefix if applicable.
    """
    print(f"Constructing bucket name for environment: {environment} and bucket: {bucket_name}")
    if environment == "production":
        return f"{bucket_name}-prod"

    return bucket_name
    
