import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from google.cloud import storage
import tempfile
from app.model.graph_models import Feature as CollaborationFeature
from app.model.graph_models import Flow as CollaborationFlow
from app.services.features.feature_service import FeatureService
from app.services.flows.flow_service import FlowService
logger = logging.getLogger(__name__)


class GraphService:
    """Service for handling graph data persistence to Google Cloud Storage"""

    def __init__(self, config, feature_service: FeatureService, flow_service: FlowService = None):
        self.config = config
        self.project_id = os.getenv('GCP_PROJECT_ID')
        self.service_account_path = os.getenv('GCP_SERVICE_ACCOUNT_PATH', 'gcp-service-account.json')
        self.feature_service = feature_service 
        self.flow_service = flow_service
        
        # Determine bucket based on environment
        self.bucket_name = self._get_bucket_name()
        
        # Initialize GCS client
        self.storage_client = self._init_storage_client()

        # Timeout (seconds) for GCS metadata/content calls to avoid long hangs
        try:
            self.gcs_timeout_seconds = int(os.getenv('GCS_TIMEOUT_SECONDS', '15'))
        except Exception:
            self.gcs_timeout_seconds = 15
        logger.debug("GCS timeout seconds set to %s", self.gcs_timeout_seconds)
        
    def _get_bucket_name(self) -> str:
        """Determine bucket name based on environment"""
        env = os.getenv('ENVIRONMENT', 'development')
        if env == 'production':
            return 'graph-editor-prod'
        else:
            return 'graph-editor'
    
    def _init_storage_client(self):
        """Initialize Google Cloud Storage client"""
        try:
            if os.path.exists(self.service_account_path):
                client = storage.Client.from_service_account_json(self.service_account_path)
                logger.info(f"GCS client initialized with service account: {self.service_account_path}")
            else:
                # Use default credentials (useful for deployment environments)
                client = storage.Client()
                logger.info("GCS client initialized with default credentials")
            return client
        except Exception as e:
            logger.error(f"Failed to initialize GCS client: {e}")
            raise e

    def _get_file_path(self, product_id: str, file_type: str) -> str:
        """Generate the GCS file path for a given product and file type"""
        file_mapping = {
            'graph': 'graph-export.json',
            'features': 'features-export.json',
            'flows': 'flows-export.json',
            'comments': 'comments.json'
        }
        
        filename = file_mapping.get(file_type)
        if not filename:
            raise ValueError(f"Invalid file type: {file_type}")
            
        return f"qai-upload-temporary/productId_{product_id}/{filename}"

    def save_graph_data(self, product_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save complete graph data (nodes, edges, features, flows, comments) to GCS
        Features are saved to Datastore, not GCS.
        
        Args:
            product_id: The product identifier
            data: Dictionary containing graph_data, features_data, flows_data, comments_data
            
        Returns:
            Dictionary with save results
        """
        try:
            results = {}
            bucket = self.storage_client.bucket(self.bucket_name)
            
            # Save each data type (skipping features and flows - they go to Datastore)
            for data_type in ['graph', 'comments']:
                data_key = f"{data_type}_data"
                if data_key in data:
                    file_path = self._get_file_path(product_id, data_type)
                    success = self._upload_json_to_gcs(
                        bucket, file_path, data[data_key]
                    )
                    results[data_type] = {
                        'success': success,
                        'path': file_path
                    }

            if 'features_data' in data:
                results['features'] = {
                    'success': True,
                    'message': 'Features saved to Datastore (not GCS)'
                }

            if 'flows_data' in data:
                results['flows'] = {
                    'success': True,
                    'message': 'Flows saved to Datastore (not GCS)'
                }
            
            return {
                'success': True,
                'message': 'Graph data saved successfully',
                'saved_at': datetime.utcnow().isoformat(),
                'results': results
            }
            
        except Exception as e:
            logger.error(f"Error saving graph data for product {product_id}: {e}")
            return {
                'success': False,
                'message': f'Failed to save graph data: {str(e)}',
                'error': str(e)
            }

    def save_individual_data(self, product_id: str, data_type: str, data: Any) -> Dict[str, Any]:
        """
        Save individual data type (graph, features, flows, or comments) to GCS
        Features are saved to Datastore, not GCS.
        
        Args:
            product_id: The product identifier
            data_type: Type of data ('graph', 'features', 'flows', 'comments')
            data: The data to save
            
        Returns:
            Dictionary with save result
        """

        if data_type == 'features':
            return {
                'success': True,
                'message': 'Features saved to Datastore (not GCS)',
                'saved_at': datetime.utcnow().isoformat()
            }
        
        if data_type == 'flows':
            return {
                'success': True,
                'message': 'Flows saved to Datastore (not GCS)',
                'saved_at': datetime.utcnow().isoformat()
            }
        
        try:
            bucket = self.storage_client.bucket(self.bucket_name)
            file_path = self._get_file_path(product_id, data_type)
            
            success = self._upload_json_to_gcs(bucket, file_path, data)
            
            return {
                'success': success,
                'message': f'{data_type.capitalize()} data saved successfully',
                'saved_at': datetime.utcnow().isoformat(),
                'path': file_path
            }
            
        except Exception as e:
            logger.error(f"Error saving {data_type} data for product {product_id}: {e}")
            return {
                'success': False,
                'message': f'Failed to save {data_type} data: {str(e)}',
                'error': str(e)
            }

    def load_graph_data(self, product_id: str) -> Dict[str, Any]:
        """
        Load complete graph data from GCS and Datastore
        Features are loaded from Datastore, not GCS.
        
        Args:
            product_id: The product identifier
            
        Returns:
            Dictionary containing all graph data or error message
        """
        try:
            bucket = self.storage_client.bucket(self.bucket_name)
            data = {}
            
            # Load each data type (skip features and flows - they come from Datastore)
            for data_type in ['graph', 'comments']:
                file_path = self._get_file_path(product_id, data_type)
                try:
                    logger.info("Loading %s data from %s", data_type, file_path)

                    # Create a local Blob object (no RPC). bucket.blob() does not perform network calls
                    blob = bucket.blob(file_path)
                    logger.debug("Created local blob object for %s (no RPC)", file_path)

                    # Attempt to download - _download_json_from_gcs handles NotFound and other errors
                    json_data = self._download_json_from_gcs(bucket, file_path, blob)

                    # Avoid spamming logs with huge payloads; truncate for diagnostics
                    try:
                        payload_preview = json.dumps(json_data)[:500]
                    except Exception:
                        payload_preview = str(type(json_data))
                    logger.info("Loaded %s data (preview): %s", data_type, payload_preview)

                    data[f"{data_type}_data"] = json_data
                except FileNotFoundError as fnf:
                    # Expected when the blob is missing — keep defaults and continue
                    logger.info("No %s data found at %s: %s", data_type, file_path, fnf)
                    data[f"{data_type}_data"] = self._get_default_data(data_type)
                except Exception:
                    logger.exception("Could not load %s data from %s; returning defaults", data_type, file_path)
                    data[f"{data_type}_data"] = self._get_default_data(data_type)

            if self.feature_service:
                try:
                    features = self.feature_service.get_features(product_id)

                    features_data = {
                        'features': [
                            CollaborationFeature(
                                id=f.id,
                                name=f.name,
                                nodeIds=f.nodeIds
                            ).model_dump()
                            for f in features
                        ],
                        'exportedAt': datetime.utcnow().isoformat()
                    }
                    data['features_data'] = features_data
                    logger.info(f"Loaded {len(features)} features from Datastore for product {product_id}")
                except Exception as e:
                    logger.error(f"Error loading features from Datastore: {e}")
                    # Fallback to GCS
                    try:
                        file_path = self._get_file_path(product_id, 'features')
                        blob = bucket.blob(file_path)
                        json_data = self._download_json_from_gcs(bucket, file_path, blob)
                        data['features_data'] = json_data
                    except Exception:
                        data['features_data'] = self._get_default_data('features')
            else:
                # Fallback to GCS if FeatureService not available
                try:
                    file_path = self._get_file_path(product_id, 'features')
                    blob = bucket.blob(file_path)
                    json_data = self._download_json_from_gcs(bucket, file_path, blob)
                    data['features_data'] = json_data
                except Exception:
                    data['features_data'] = self._get_default_data('features')
            
            if self.flow_service:
                try:
                    flows = self.flow_service.get_flows(product_id)
                    flows_list = []
                    for f in flows:
                        # Convert Flow to CollaborationFlow dict
                        flow_dict = f.dict(exclude_none=True)
                        # Ensure compatibility with CollaborationFlow model
                        flows_list.append(CollaboratsionFlow(**flow_dict).model_dump(exclude_none=True))
                    if not flows_list:
                        print("No flows found in Datastore for product", product_id)
                        raise ValueError("No flows found in Datastore for product", product_id)
                    data['flows_data'] = flows_list
                    logger.info(f"Loaded {len(flows)} flows from Datastore for product {product_id}")
                except Exception as e:
                    logger.error(f"Error loading flows from Datastore: {e}")
                    # Fallback to GCS
                    try:
                        file_path = self._get_file_path(product_id, 'flows')
                        blob = bucket.blob(file_path)
                        json_data = self._download_json_from_gcs(bucket, file_path, blob)
                        data['flows_data'] = json_data
                    except Exception:
                        data['flows_data'] = self._get_default_data('flows')
            else:
                 # Fallback to GCS if FlowService not available
                print("FlowService not available, falling back to GCS")
                try:
                    file_path = self._get_file_path(product_id, 'flows')
                    blob = bucket.blob(file_path)
                    json_data = self._download_json_from_gcs(bucket, file_path, blob)
                    data['flows_data'] = json_data
                except Exception:
                    data['flows_data'] = self._get_default_data('flows')
            
            return {
                'success': True,
                'data': data,
                'loaded_at': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error loading graph data for product {product_id}: {e}")
            return {
                'success': False,
                'message': f'Failed to load graph data: {str(e)}',
                'error': str(e)
            }

    def load_individual_data(self, product_id: str, data_type: str) -> Dict[str, Any]:
        """
        Load individual data type from GCS or Datastore
        Features are loaded from Datastore, not GCS.
        
        Args:
            product_id: The product identifier
            data_type: Type of data to load
            
        Returns:
            Dictionary with the requested data or error message
        """

        if data_type == 'features':
            if self.feature_service:
                try:
                    features = self.feature_service.get_features(product_id)

                    features_data = {
                        'features': [
                            CollaborationFeature(
                                id=f.id,
                                name=f.name,
                                nodeIds=f.nodeIds
                            ).model_dump()
                            for f in features
                        ],
                        'exportedAt': datetime.utcnow().isoformat()
                    }
                    return {
                        'success': True,
                        'data': features_data,
                        'loaded_at': datetime.utcnow().isoformat(),
                        'message': 'Features loaded from Datastore'
                    }
                except Exception as e:
                    logger.error(f"Error loading features from Datastore: {e}")

            else:
                # Fallback to GCS if FeatureService not available
                pass
        
        if data_type == 'flows':
            if self.flow_service:
                try:
                    flows = self.flow_service.get_flows(product_id)
                    flows_list = []
                    for f in flows:
                        flow_dict = f.dict(exclude_none=True)
                        flows_list.append(CollaborationFlow(**flow_dict).model_dump(exclude_none=True))
                        
                    return {
                        'success': True,
                        'data': flows_list,
                        'loaded_at': datetime.utcnow().isoformat(),
                        'message': 'Flows loaded from Datastore'
                    }
                except Exception as e:
                    logger.error(f"Error loading flows from Datastore: {e}")
            else:
                 pass
        
        try:
            bucket = self.storage_client.bucket(self.bucket_name)
            file_path = self._get_file_path(product_id, data_type)
            
            blob = bucket.blob(file_path)
            json_data = self._download_json_from_gcs(bucket, file_path, blob)
            
            return {
                'success': True,
                'data': json_data,
                'loaded_at': datetime.utcnow().isoformat(),
                'path': file_path
            }
            
        except Exception as e:
            logger.warning(f"Could not load {data_type} data for product {product_id}: {e}")
            return {
                'success': True,  # Return success with default data
                'data': self._get_default_data(data_type),
                'loaded_at': datetime.utcnow().isoformat(),
                'path': self._get_file_path(product_id, data_type),
                'message': f'No existing {data_type} data found, returning defaults'
            }

    def generate_signed_url(self, product_id: str, data_type: str, expiration_minutes: int = 15) -> Dict[str, Any]:
        """
        Generate a signed URL for direct upload to GCS
        
        Args:
            product_id: The product identifier
            data_type: Type of data ('graph', 'features', 'flows', 'comments')
            expiration_minutes: URL expiration time in minutes
            
        Returns:
            Dictionary containing signed URL and metadata
        """
        try:
            bucket = self.storage_client.bucket(self.bucket_name)
            file_path = self._get_file_path(product_id, data_type)
            blob = bucket.blob(file_path)
            
            # Generate signed URL for PUT operation
            from datetime import timedelta
            url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(minutes=expiration_minutes),
                method="PUT",
                content_type="application/json"
            )
            
            return {
                'success': True,
                'signed_url': url,
                'file_path': file_path,
                'bucket_name': self.bucket_name,
                'expires_in_minutes': expiration_minutes,
                'content_type': 'application/json'
            }
            
        except Exception as e:
            logger.error(f"Error generating signed URL for {data_type} data: {e}")
            return {
                'success': False,
                'message': f'Failed to generate signed URL: {str(e)}',
                'error': str(e)
            }

    def _upload_json_to_gcs(self, bucket, file_path: str, data: Any) -> bool:
        """Upload JSON data to GCS"""
        try:
            blob = bucket.blob(file_path)
            
            # Convert data to JSON string
            json_string = json.dumps(data, indent=2, ensure_ascii=False)
            
            # Upload with proper content type
            blob.upload_from_string(
                json_string,
                content_type='application/json'
            )
            
            logger.info(f"Successfully uploaded to GCS: {file_path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to upload to GCS {file_path}: {e}")
            return False

    def _download_json_from_gcs(self, bucket, file_path: str, blob) -> Any:
        """Download JSON data from GCS with guarded timeouts using a local blob object"""
        try:
            # blob is expected to be a local Blob instance (created via bucket.blob())
            if blob is None:
                blob = bucket.blob(file_path)

            # Try downloading with a timeout where supported
            try:
                json_string = blob.download_as_text(timeout=max(5, self.gcs_timeout_seconds))
            except TypeError:
                # Older google-cloud-storage may not accept timeout on download_as_text; fall back
                logger.debug("download_as_text does not accept timeout param; calling without timeout for %s", file_path)
                try:
                    json_string = blob.download_as_text()
                except Exception as e:
                    # Detect NotFound by class name or message if google.api_core isn't available
                    ename = e.__class__.__name__
                    if 'NotFound' in ename or 'not found' in str(e).lower():
                        logger.debug("Blob not found during download_as_text for %s: %s", file_path, e)
                        raise FileNotFoundError(f"File not found in GCS: {file_path}")
                    logger.exception("Error during download_as_text for %s: %s", file_path, e)
                    raise
            except Exception as e:
                ename = e.__class__.__name__
                if 'NotFound' in ename or 'not found' in str(e).lower():
                    logger.debug("Blob not found for %s: %s", file_path, e)
                    raise FileNotFoundError(f"File not found in GCS: {file_path}")
                logger.exception("Error downloading blob %s: %s", file_path, e)
                raise

            # Parse JSON
            data = json.loads(json_string)

            logger.info("Successfully downloaded from GCS: %s", file_path)
            return data
            
        except FileNotFoundError:
            # propagate missing file to caller so caller can decide to use defaults
            raise
        except Exception as e:
            logger.exception("Failed to download from GCS %s: %s", file_path, e)
            raise

    def _get_default_data(self, data_type: str) -> Dict[str, Any]:
        """Get default data structure for each data type"""
        defaults = {
            'graph': {
                'nodes': [],
                'edges': []
            },
            'features': {
                'features': [],
                'exportedAt': datetime.utcnow().isoformat()
            },
            'flows': [],
            'comments': {
                'comments': [],
                'exportedAt': datetime.utcnow().isoformat()
            }
        }
        return defaults.get(data_type, {})

    def get_bucket_info(self) -> Dict[str, Any]:
        """Get information about the configured bucket"""
        try:
            bucket = self.storage_client.bucket(self.bucket_name)
            exists = bucket.exists()
            
            return {
                'bucket_name': self.bucket_name,
                'exists': exists,
                'project_id': self.project_id,
                'environment': os.getenv('ENVIRONMENT', 'development')
            }
        except Exception as e:
            logger.error(f"Error getting bucket info: {e}")
            return {
                'bucket_name': self.bucket_name,
                'exists': False,
                'error': str(e)
            }
