from common.google_cloud_wrappers import GCPDatastoreWrapper
from utils.util import orionis_log
from test_build.test_build_models import TestBuild


class TestBuildDatastore:

    ENTITY_KIND_TEST_BUILD = "TestBuild"
    FIELD_EXECUTABLE_URL = "executable_url"
    FIELD_PLATFORM = "platform"
    FIELD_BUILD_NUMBER = "build_number"
    FIELD_PRODUCT_ID = "product_id"

    def __init__(self):
        self.db = GCPDatastoreWrapper().get_datastore_client()

    def get_test_build_details(self, test_build_id: str) -> TestBuild:
        try:
            key = self.db.key(
                TestBuildDatastore.ENTITY_KIND_TEST_BUILD, int(test_build_id)
            )
            entity = self.db.get(key)
            if not entity:
                raise ValueError(f"TestBuild not found for id {test_build_id}")

            return TestBuild(
                executable_url=entity.get(TestBuildDatastore.FIELD_EXECUTABLE_URL),
                platform=entity.get(TestBuildDatastore.FIELD_PLATFORM),
                build_number=entity.get(TestBuildDatastore.FIELD_BUILD_NUMBER),
                product_id=entity.get(TestBuildDatastore.FIELD_PRODUCT_ID),
            )
        except ValueError as e:
            orionis_log(f"Invalid test_build_id format: {test_build_id}", e)
            raise ValueError(f"Invalid test_build_id format: {test_build_id}") from e
        except Exception as e:
            orionis_log("Error fetching test build details", e)
            raise
