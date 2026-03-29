from typing import List, Dict
from utils.util import orionis_log
from features.feature_models import AddFeatureRequestParams
from features.feature_datastore import FeatureDatastore
from pydantic import BaseModel


def get_feature_id(features: List[Dict], start_node_id: str) -> str | None:
    """Get KG feature ID from start node ID."""
    for feature in features:
        if not isinstance(feature, dict):
            continue
        if start_node_id in feature.get("nodeIds", []):
            # Use kg_feature_id if available, otherwise fall back to name
            return feature.get("kg_feature_id") or feature.get("name")

    orionis_log(f"Node {start_node_id} not found in any feature")
    return None


def get_db_feature_id(
    feature_datastore: FeatureDatastore, kg_feature_id: str, product_id: str
) -> str | None:
    """Get DB Feature ID."""
    orionis_log("Getting DB Feature ID")
    try:
        db_feature = feature_datastore.get_feature_by_kg_feature_id(
            kg_feature_id, product_id
        )
        return db_feature.id
    except ValueError:
        orionis_log(f"Feature with kg_feature_id {kg_feature_id} not found in db")
        return None


def feature_processing(
    feature_datastore: FeatureDatastore, features: List[Dict], product_id: str
) -> Dict[str, str]:
    """Process features and return a map of KG feature ID to DB feature ID."""
    kg2db_feature_id_map: Dict[str, str] = {}
    orionis_log("Starting to process features")
    for feature in features:
        if not isinstance(feature, dict):
            orionis_log(f"Skipping non-dict feature: {feature}")
            continue
        # Use kg_feature_id if available, otherwise fall back to name
        kg_feature_id = feature.get("kg_feature_id") or feature.get("name")
        # Use the utility function for getting db_feature_id
        db_feature_id = get_db_feature_id(feature_datastore, kg_feature_id, product_id)

        if db_feature_id is None:
            orionis_log(
                f"Feature with kg_feature_id {kg_feature_id} not found in db, creating new feature"
            )
            # Use the passed feature_datastore instance
            db_feature = feature_datastore.add_feature(
                AddFeatureRequestParams(
                    product_id=product_id,
                    name=feature["name"],
                    kg_feature_id=kg_feature_id,
                )
            )
            db_feature_id = db_feature.id

        kg2db_feature_id_map[kg_feature_id] = db_feature_id
    orionis_log("Returning kg2db feature map")
    return kg2db_feature_id_map


def extract_credentials_from_flow(flow_json: dict) -> List[str]:
    """
    Extract credentials from flow JSON.

    Args:
        flow_json: The flow JSON object containing potential credentials

    Returns:
        List of credential IDs from the flow
    """
    credentials = []

    flow_credentials = flow_json.get("credentials", [])

    if isinstance(flow_credentials, list):
        for credential in flow_credentials:
            if isinstance(credential, str) and credential.strip():
                credentials.append(credential.strip())

    orionis_log(f"Extracted {len(credentials)} credentials from flow: {credentials}")
    return credentials


def replace_param_recursive(obj, parameter_name: str, parameter_value: str):
    try:

        if isinstance(obj, BaseModel):
            obj_dict = obj.model_dump() if hasattr(obj, "model_dump") else obj.dict()
            replaced_dict = {
                k: replace_param_recursive(v, parameter_name, parameter_value)
                for k, v in obj_dict.items()
            }
            try:
                return obj.__class__(**replaced_dict)
            except Exception:
                return replaced_dict
    except Exception as e:
        orionis_log(f"Error replacing parameter recursively: {e}", e)
        return obj

    if isinstance(obj, str):
        return obj.replace(parameter_name, parameter_value)
    elif isinstance(obj, list):
        return [
            replace_param_recursive(item, parameter_name, parameter_value)
            for item in obj
        ]
    elif isinstance(obj, dict):
        return {
            k: replace_param_recursive(v, parameter_name, parameter_value)
            for k, v in obj.items()
        }
    else:
        return obj
