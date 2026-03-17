from datetime import datetime, timezone
from typing import List
from common.google_cloud_wrappers import GCPDatastoreWrapper
from utils.util import orionis_log
from test_suites.test_suite_models import (
    TestSuite,
    CreateTestSuiteRequestParams,
    UpdateTestSuiteRequestParams,
)


class TestSuiteDatastore:

    ENTITY_KIND_TEST_SUITE = "TestSuite"
    FIELD_PRODUCT_ID = "product_id"
    FIELD_NAME = "name"
    FIELD_TEST_CASE_IDS = "test_case_ids"
    FIELD_CREATED_AT = "created_at"
    FIELD_UPDATED_AT = "updated_at"

    def __init__(self):
        self.db = GCPDatastoreWrapper().get_datastore_client()

    def create_test_suite(self, params: CreateTestSuiteRequestParams) -> TestSuite:
        try:
            orionis_log(f"Creating test suite: {params}")
            key = self.db.key(TestSuiteDatastore.ENTITY_KIND_TEST_SUITE)
            entity = self.db.entity(key=key)

            created_at = datetime.now(timezone.utc)

            entity.update(
                {
                    TestSuiteDatastore.FIELD_PRODUCT_ID: params.product_id,
                    TestSuiteDatastore.FIELD_NAME: params.name,
                    TestSuiteDatastore.FIELD_TEST_CASE_IDS: params.test_case_ids,
                    TestSuiteDatastore.FIELD_CREATED_AT: created_at,
                    TestSuiteDatastore.FIELD_UPDATED_AT: created_at,
                }
            )

            orionis_log(f"Created test suite: {entity}")

            self.db.put(entity)

            if not entity or not entity.key:
                raise ValueError(
                    "Failed to add new test suite to the datastore - no entity/key generated"
                )

            test_suite_id = str(entity.key.id)
            orionis_log(
                f"Added new test suite {params.name} ({test_suite_id}) for product: {params.product_id}"
            )

            return TestSuite(
                test_suite_id=test_suite_id,
                product_id=params.product_id,
                name=params.name,
                test_case_ids=params.test_case_ids,
                created_at=created_at,
                updated_at=created_at,
            )
        except Exception as e:
            orionis_log("Error adding test suite", e)
            raise e

    def get_test_suites_by_product(self, product_id: str) -> List[TestSuite]:
        try:
            orionis_log(f"Getting test suites by product: {product_id}")
            query = self.db.query(kind=TestSuiteDatastore.ENTITY_KIND_TEST_SUITE)
            query.add_filter(TestSuiteDatastore.FIELD_PRODUCT_ID, "=", product_id)
            entities = list(query.fetch())

            suites: List[TestSuite] = []
            for e in entities:
                suites.append(
                    TestSuite(
                        test_suite_id=str(e.key.id),
                        product_id=e.get(TestSuiteDatastore.FIELD_PRODUCT_ID),
                        name=e.get(TestSuiteDatastore.FIELD_NAME),
                        test_case_ids=e.get(TestSuiteDatastore.FIELD_TEST_CASE_IDS),
                        created_at=e.get(TestSuiteDatastore.FIELD_CREATED_AT),
                        updated_at=e.get(TestSuiteDatastore.FIELD_UPDATED_AT),
                    )
                )

            orionis_log(
                f"Fetched {len(suites)} test suites for product_id: {product_id}"
            )
            return suites
        except Exception as e:
            orionis_log("Error getting test suites by product", e)
            raise e

    def update_test_suite(self, params: UpdateTestSuiteRequestParams) -> TestSuite:
        try:
            orionis_log(f"Updating test suite: {params}")
            key = self.db.key(
                TestSuiteDatastore.ENTITY_KIND_TEST_SUITE, int(params.test_suite_id)
            )
            entity = self.db.get(key)
            if not entity:
                raise ValueError(f"Test suite with id {params.test_suite_id} not found")
            update_fields = {
                TestSuiteDatastore.FIELD_UPDATED_AT: datetime.now(timezone.utc),
                TestSuiteDatastore.FIELD_NAME: params.name,
                TestSuiteDatastore.FIELD_TEST_CASE_IDS: params.test_case_ids,
            }
            filtered_update_fields = {
                k: v for k, v in update_fields.items() if v is not None
            }
            entity.update(filtered_update_fields)
            self.db.put(entity)
            orionis_log(f"Updated test suite: {entity}")
            return TestSuite(
                test_suite_id=params.test_suite_id,
                product_id=entity.get(TestSuiteDatastore.FIELD_PRODUCT_ID),
                name=entity.get(TestSuiteDatastore.FIELD_NAME),
                test_case_ids=entity.get(TestSuiteDatastore.FIELD_TEST_CASE_IDS),
                created_at=entity.get(TestSuiteDatastore.FIELD_CREATED_AT),
                updated_at=entity.get(TestSuiteDatastore.FIELD_UPDATED_AT),
            )
        except ValueError as e:
            orionis_log("ValueError in update_test_suite", e)
            raise e
        except Exception as e:
            orionis_log("Error updating test suite", e)
            raise e

    def delete_test_suite(self, test_suite_id: str):
        try:
            key = self.db.key(
                TestSuiteDatastore.ENTITY_KIND_TEST_SUITE, int(test_suite_id)
            )
            entity = self.db.get(key)
            if not entity:
                raise ValueError(f"Test suite with id {test_suite_id} not found")
            self.db.delete(key)
            orionis_log(f"Test suite with id {test_suite_id} deleted successfully")
        except ValueError as e:
            orionis_log("ValueError in delete_test_suite", e)
            raise e
        except Exception as e:
            orionis_log("Error deleting test suite", e)
            raise e
