import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path
from google.cloud import storage
from app.model.graph_models import Feature as CollaborationFeature
from app.model.graph_models import Flow as CollaborationFlow
from app.services.features.feature_service import FeatureService
from app.services.flows.flow_service import FlowService
logger = logging.getLogger(__name__)


class GraphService:
    """Service for handling graph data persistence via GCS or local filesystem."""

    def __init__(self, config, feature_service: FeatureService, flow_service: FlowService = None):
        self.config = config
        self.project_id = os.getenv('GCP_PROJECT_ID')
        self.service_account_path = os.getenv('GCP_SERVICE_ACCOUNT_PATH', 'gcp-service-account.json')
        self.feature_service = feature_service 
        self.flow_service = flow_service

        self.storage_backend = os.getenv('STORAGE_BACKEND', 'gcs').lower()
        
        # Determine bucket based on environment
        self.bucket_name = self._get_bucket_name()

        default_local_storage_root = getattr(config, 'STORAGE_DIR', 'storage')
        self.local_storage_root = Path(
            os.getenv('STORAGE_LOCAL_ROOT', default_local_storage_root)
        ).expanduser().resolve()
        if self.storage_backend == 'local':
            self.local_storage_root.mkdir(parents=True, exist_ok=True)
        

        self.storage_client = None
        if self.storage_backend == 'gcs':
            self.storage_client = self._init_storage_client()

        # Timeout (seconds) for GCS metadata/content calls to avoid long hangs
        try:
            self.gcs_timeout_seconds = int(os.getenv('GCS_TIMEOUT_SECONDS', '15'))
        except Exception:
            self.gcs_timeout_seconds = 15
        logger.debug("GCS timeout seconds set to %s", self.gcs_timeout_seconds)
        logger.info("GraphService storage backend: %s", self.storage_backend)
        
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
        """Generate object-style file path for a given product and file type."""
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

    def _resolve_local_file_path(self, file_path: str) -> Path:
        """Resolve an object path to local storage.
        
        In local mode, we don't need to embed the bucket name in the path.
        The filesystem itself provides the directory structure.
        """
        return self.local_storage_root / file_path

    def _upload_json_to_local(self, file_path: str, data: Any) -> bool:
        """Upload JSON data to local storage path mirroring bucket/object layout."""
        try:
            target_path = self._resolve_local_file_path(file_path)
            target_path.parent.mkdir(parents=True, exist_ok=True)
            json_string = json.dumps(data, indent=2, ensure_ascii=False)
            tmp_path = target_path.with_suffix(target_path.suffix + '.tmp')
            tmp_path.write_text(json_string, encoding='utf-8')
            os.replace(tmp_path, target_path)
            logger.info("Successfully saved to local storage: %s", target_path)
            return True
        except Exception as e:
            logger.error("Failed to save to local storage %s: %s", file_path, e)
            return False

    def _download_json_from_local(self, file_path: str) -> Any:
        """Download JSON data from local storage path mirroring bucket/object layout."""
        target_path = self._resolve_local_file_path(file_path)
        if not target_path.exists():
            raise FileNotFoundError(f"File not found in local storage: {target_path}")
        json_string = target_path.read_text(encoding='utf-8')
        return json.loads(json_string)

    def save_graph_data(self, product_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Save complete graph data (nodes, edges, features, flows, comments).
        Features and flows are saved to Datastore, not object storage.
        
        Args:
            product_id: The product identifier
            data: Dictionary containing graph_data, features_data, flows_data, comments_data
            
        Returns:
            Dictionary with save results
        """
        try:
            results = {}
            bucket = self.storage_client.bucket(self.bucket_name) if self.storage_backend == 'gcs' else None
            
            # Save each data type (skipping features and flows - they go to Datastore)
            for data_type in ['graph', 'comments']:
                data_key = f"{data_type}_data"
                if data_key in data:
                    file_path = self._get_file_path(product_id, data_type)
                    if self.storage_backend == 'gcs':
                        success = self._upload_json_to_gcs(bucket, file_path, data[data_key])
                    else:
                        success = self._upload_json_to_local(file_path, data[data_key])
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
        Save individual data type (graph, features, flows, or comments).
        Features and flows are saved to Datastore, not object storage.
        
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
            bucket = self.storage_client.bucket(self.bucket_name) if self.storage_backend == 'gcs' else None
            file_path = self._get_file_path(product_id, data_type)

            if self.storage_backend == 'gcs':
                success = self._upload_json_to_gcs(bucket, file_path, data)
            else:
                success = self._upload_json_to_local(file_path, data)
            
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
        Load complete graph data from object storage and Datastore.
        Features and flows are loaded from Datastore when available.
        
        Args:
            product_id: The product identifier
            
        Returns:
            Dictionary containing all graph data or error message
        """
        try:
            bucket = self.storage_client.bucket(self.bucket_name) if self.storage_backend == 'gcs' else None
            data = {}
            
            # Load each data type (skip features and flows - they come from Datastore)
            for data_type in ['graph', 'comments']:
                file_path = self._get_file_path(product_id, data_type)
                try:
                    logger.info("Loading %s data from %s", data_type, file_path)

                    if self.storage_backend == 'gcs':

                        blob = bucket.blob(file_path)
                        logger.debug("Created local blob object for %s (no RPC)", file_path)

                        json_data = self._download_json_from_gcs(bucket, file_path, blob)
                    else:
                        json_data = self._download_json_from_local(file_path)

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
                    # Fallback to object storage
                    try:
                        file_path = self._get_file_path(product_id, 'features')
                        if self.storage_backend == 'gcs':
                            blob = bucket.blob(file_path)
                            json_data = self._download_json_from_gcs(bucket, file_path, blob)
                        else:
                            json_data = self._download_json_from_local(file_path)
                        data['features_data'] = json_data
                    except Exception:
                        data['features_data'] = self._get_default_data('features')
            else:
                # Fallback to object storage if FeatureService not available
                try:
                    file_path = self._get_file_path(product_id, 'features')
                    if self.storage_backend == 'gcs':
                        blob = bucket.blob(file_path)
                        json_data = self._download_json_from_gcs(bucket, file_path, blob)
                    else:
                        json_data = self._download_json_from_local(file_path)
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
                        flows_list.append(CollaborationFlow(**flow_dict).model_dump(exclude_none=True))
                    if not flows_list:
                        print("No flows found in Datastore for product", product_id)
                        raise ValueError("No flows found in Datastore for product", product_id)
                    data['flows_data'] = flows_list
                    logger.info(f"Loaded {len(flows)} flows from Datastore for product {product_id}")
                except Exception as e:
                    logger.error(f"Error loading flows from Datastore: {e}")
                    # Fallback to object storage
                    try:
                        file_path = self._get_file_path(product_id, 'flows')
                        if self.storage_backend == 'gcs':
                            blob = bucket.blob(file_path)
                            json_data = self._download_json_from_gcs(bucket, file_path, blob)
                        else:
                            json_data = self._download_json_from_local(file_path)
                        data['flows_data'] = json_data
                    except Exception:
                        data['flows_data'] = self._get_default_data('flows')
            else:
                 # Fallback to object storage if FlowService not available
                print("FlowService not available, falling back to object storage")
                try:
                    file_path = self._get_file_path(product_id, 'flows')
                    if self.storage_backend == 'gcs':
                        blob = bucket.blob(file_path)
                        json_data = self._download_json_from_gcs(bucket, file_path, blob)
                    else:
                        json_data = self._download_json_from_local(file_path)
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
        Load individual data type from object storage or Datastore.
        Features and flows are loaded from Datastore when available.
        
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
            # Fallback to object storage path below
        
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
            # Fallback to object storage path below
        
        try:
            file_path = self._get_file_path(product_id, data_type)

            if self.storage_backend == 'gcs':
                bucket = self.storage_client.bucket(self.bucket_name)
                blob = bucket.blob(file_path)
                json_data = self._download_json_from_gcs(bucket, file_path, blob)
            else:
                json_data = self._download_json_from_local(file_path)
            
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
        Generate a signed URL for direct upload to GCS.
        In local mode, returns a file URI target instead.
        
        Args:
            product_id: The product identifier
            data_type: Type of data ('graph', 'features', 'flows', 'comments')
            expiration_minutes: URL expiration time in minutes
            
        Returns:
            Dictionary containing signed URL and metadata
        """
        try:
            if self.storage_backend == 'local':
                file_path = self._get_file_path(product_id, data_type)
                target_path = self._resolve_local_file_path(file_path)
                target_path.parent.mkdir(parents=True, exist_ok=True)
                return {
                    'success': True,
                    'signed_url': target_path.as_uri(),
                    'file_path': file_path,
                    'bucket_name': self.bucket_name,
                    'expires_in_minutes': expiration_minutes,
                    'content_type': 'application/json',
                    'backend': 'local'
                }

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
                'content_type': 'application/json',
                'backend': 'gcs'
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
        """Get information about the configured object storage backend."""
        try:
            if self.storage_backend == 'local':
                root_exists = self.local_storage_root.exists()
                return {
                    'bucket_name': self.bucket_name,
                    'exists': root_exists,
                    'project_id': self.project_id,
                    'environment': os.getenv('ENVIRONMENT', 'development'),
                    'backend': 'local',
                    'local_storage_root': str(self.local_storage_root),
                }

            bucket = self.storage_client.bucket(self.bucket_name)
            exists = bucket.exists()
            
            return {
                'bucket_name': self.bucket_name,
                'exists': exists,
                'project_id': self.project_id,
                'environment': os.getenv('ENVIRONMENT', 'development'),
                'backend': 'gcs'
            }
        except Exception as e:
            logger.error(f"Error getting bucket info: {e}")
            return {
                'bucket_name': self.bucket_name,
                'exists': False,
                'error': str(e)
            }
