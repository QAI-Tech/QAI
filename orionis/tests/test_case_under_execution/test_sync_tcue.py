from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from gateway.gateway_models import ApiRequestEntity
from test_case_under_execution.test_case_under_exec_models import (
    ExecutionStatus,
    TestCaseUnderExecution,
    TestCaseStep,
)
from test_case_under_execution.test_case_under_exec_service import (
    TestCaseUnderExecutionService,
)
from test_cases.test_case_models import (
    RawTestCase,
    RawTestCaseStep,
    Scenario,
    TestCaseParameter,
    TestCaseCriticality,
    TestCaseStatus,
)


def _make_step(step_id: str = "s1") -> TestCaseStep:
    return TestCaseStep(
        test_step_id=step_id,
        step_description="desc",
        expected_results=["ok"],
        type=None,
        http_method=None,
        url=None,
        request_body=None,
        headers=None,
        edge_id=None,
    )


def _make_raw_test_case(
    test_case_id: str,
    flow_id: str | None = "flow-1",
    scenarios: list[Scenario] | None = None,
) -> RawTestCase:
    return RawTestCase(
        test_case_id=test_case_id,
        feature_id="feat-1",
        product_id="prod-1",
        functionality_id="func-1",
        request_id="req-1",
        title="TC",
        screenshot_url="img",
        preconditions=["p"],
        test_case_description="desc",
        test_case_steps=[
            RawTestCaseStep(
                test_step_id="s1", step_description="d", expected_results=["e"]
            )
        ],
        test_case_type="SMOKE",
        rationale="",
        created_at=datetime.now(timezone.utc),
        status=TestCaseStatus.RAW,
        scenarios=scenarios,
        metadata=None,
        flow_id=flow_id,
    )


def _make_tcue(
    tcue_id: str,
    test_case_id: str,
    test_run_id: str,
    flow_id: str | None = "flow-1",
    scenario_parameters: dict | None = None,
) -> TestCaseUnderExecution:
    now = datetime.now(timezone.utc)
    return TestCaseUnderExecution(
        id=tcue_id,
        test_case_id=test_case_id,
        test_run_id=test_run_id,
        product_id="prod-1",
        feature_id="feat-1",
        functionality_id="func-1",
        request_id="req-1",
        assignee_user_id=None,
        status=ExecutionStatus.UNTESTED,
        notes="",
        rationale="",
        screenshot_url="",
        execution_video_url="",
        title="",
        test_case_description="desc",
        test_case_steps=[_make_step("s1")],
        test_case_type="SMOKE",
        preconditions=["p"],
        comments="",
        created_at=now,
        updated_at=now,
        execution_started_at=now,
        execution_completed_at=now,
        test_case_created_at=now,
        criticality=TestCaseCriticality.HIGH,
        metadata=None,
        annotations=[],
        flow_id=flow_id,
        scenario_parameters=scenario_parameters or {},
    )


def _service_with_mocks():
    req_validator = MagicMock()
    datastore = MagicMock()
    storage_client = MagicMock()
    test_case_datastore = MagicMock()
    test_run_datastore = MagicMock()
    product_service = MagicMock()
    test_case_service = MagicMock()
    user_service = MagicMock()
    cloud_task_service = MagicMock()
    test_build_datastore = MagicMock()
    product_datastore = MagicMock()

    with patch(
        "test_case_under_execution.test_case_under_exec_service.NotificationService"
    ) as mock_notification_service, patch(
        "test_case_under_execution.test_case_under_exec_service.OrganisationDatastore"
    ) as mock_org_datastore, patch(
        "test_case_under_execution.test_case_under_exec_service.PurchaseDatastore"
    ) as mock_purchase_datastore:
        mock_notification_service.return_value = MagicMock()
        mock_org_datastore.return_value = MagicMock()
        mock_purchase_datastore.return_value = MagicMock()

        service = TestCaseUnderExecutionService(
            request_validator=req_validator,
            datastore=datastore,
            storage_client=storage_client,
            test_case_datastore=test_case_datastore,
            test_run_datastore=test_run_datastore,
            product_service=product_service,
            test_case_service=test_case_service,
            user_service=user_service,
            cloud_task_service=cloud_task_service,
            test_build_datastore=test_build_datastore,
            product_datastore=product_datastore,
        )
        return service, datastore, test_case_datastore


def test_sync_requires_post():
    service, _, _ = _service_with_mocks()
    req = ApiRequestEntity(data={}, method=ApiRequestEntity.API_METHOD_GET)
    resp = service.sync_tcue_in_test_run(req)
    assert resp.status_code == 405


def test_sync_missing_test_run_id_returns_500():
    service, _, _ = _service_with_mocks()
    req = ApiRequestEntity(data={}, method=ApiRequestEntity.API_METHOD_POST)
    resp = service.sync_tcue_in_test_run(req)
    assert resp.status_code == 500
    assert "Test run ID is required" in str(resp.response.get("error", ""))


def test_sync_marks_tcues_without_flow_for_deletion_no_ops():
    service, datastore, test_case_datastore_mock = _service_with_mocks()
    tcue = _make_tcue("1", test_case_id="tc1", test_run_id="tr1", flow_id=None)
    datastore.get_test_cases_under_execution.return_value = [tcue]

    req = ApiRequestEntity(
        data={"test_run_id": "tr1"}, method=ApiRequestEntity.API_METHOD_POST
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200
    assert resp.response["count_of_synced_test_cases_under_execution"] == 1
    datastore.update_test_cases_under_execution_batch.assert_not_called()
    datastore.add_test_case_under_execution.assert_not_called()
    test_case_datastore_mock.fetch_test_cases_by_ids.assert_not_called()
    datastore.delete_test_cases_under_execution.assert_called_once_with(["1"])


def test_sync_updates_existing_tcues_when_test_case_found_by_id():
    service, datastore, test_case_datastore_mock = _service_with_mocks()

    tcue1 = _make_tcue(
        "1", test_case_id="tc1", test_run_id="tr1", scenario_parameters={"A": "1"}
    )
    tcue2 = _make_tcue(
        "2", test_case_id="tc1", test_run_id="tr1", scenario_parameters={"B": "2"}
    )
    datastore.get_test_cases_under_execution.return_value = [tcue1, tcue2]

    scenarios = [
        Scenario(
            id="sc1",
            description="d1",
            params=[TestCaseParameter(parameter_name="A", parameter_value="1")],
        ),
        Scenario(
            id="sc2",
            description="d2",
            params=[TestCaseParameter(parameter_name="B", parameter_value="2")],
        ),
    ]
    raw_tc = _make_raw_test_case("tc1", flow_id="flow-1", scenarios=scenarios)
    test_case_datastore_mock.fetch_test_cases_by_ids.return_value = [raw_tc]

    req = ApiRequestEntity(
        data={"test_run_id": "tr1"}, method=ApiRequestEntity.API_METHOD_POST
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200

    assert resp.response["count_of_synced_test_cases_under_execution"] == 2
    assert datastore.update_test_cases_under_execution_batch.call_count == 1
    args, _ = datastore.update_test_cases_under_execution_batch.call_args
    assert len(args[0]) == 2
    datastore.add_test_case_under_execution.assert_not_called()


def test_sync_creates_missing_scenario_tcues():
    service, datastore, test_case_datastore_mock = _service_with_mocks()

    existing = _make_tcue(
        "1", test_case_id="tc1", test_run_id="tr1", scenario_parameters={"A": "1"}
    )
    datastore.get_test_cases_under_execution.return_value = [existing]

    scenarios = [
        Scenario(
            id="sc1",
            description="d1",
            params=[TestCaseParameter(parameter_name="A", parameter_value="1")],
        ),
        Scenario(
            id="sc2",
            description="d2",
            params=[TestCaseParameter(parameter_name="B", parameter_value="2")],
        ),
    ]
    raw_tc = _make_raw_test_case("tc1", flow_id="flow-1", scenarios=scenarios)
    test_case_datastore_mock.fetch_test_cases_by_ids.return_value = [raw_tc]

    req = ApiRequestEntity(
        data={"test_run_id": "tr1"}, method=ApiRequestEntity.API_METHOD_POST
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200

    assert resp.response["count_of_synced_test_cases_under_execution"] == 2
    datastore.add_test_case_under_execution.assert_called_once()
    args, _ = datastore.update_test_cases_under_execution_batch.call_args
    assert len(args[0]) == 1


def test_sync_falls_back_to_flow_id_search():
    service, datastore, test_case_datastore_mock = _service_with_mocks()

    tcue = _make_tcue(
        "1", test_case_id="tc_missing", test_run_id="tr1", scenario_parameters={}
    )
    datastore.get_test_cases_under_execution.return_value = [tcue]

    test_case_datastore_mock.fetch_test_cases_by_ids.return_value = []

    raw_tc = _make_raw_test_case("tc2", flow_id="flow-1", scenarios=None)
    test_case_datastore_mock.get_test_cases_by_flow_id.return_value = [raw_tc]

    req = ApiRequestEntity(
        data={"test_run_id": "tr1"}, method=ApiRequestEntity.API_METHOD_POST
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200

    assert resp.response["count_of_synced_test_cases_under_execution"] == 1
    datastore.update_test_cases_under_execution_batch.assert_called_once()
    datastore.delete_test_cases_under_execution.assert_not_called()


def test_sync_marks_for_deletion_when_no_test_case_anywhere():
    service, datastore, test_case_datastore_mock = _service_with_mocks()

    tcue = _make_tcue(
        "1", test_case_id="tc_missing", test_run_id="tr1", scenario_parameters={}
    )
    datastore.get_test_cases_under_execution.return_value = [tcue]
    test_case_datastore_mock.fetch_test_cases_by_ids.return_value = []
    test_case_datastore_mock.get_test_cases_by_flow_id.return_value = []

    req = ApiRequestEntity(
        data={"test_run_id": "tr1"}, method=ApiRequestEntity.API_METHOD_POST
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200
    assert resp.response["count_of_synced_test_cases_under_execution"] == 1
    datastore.update_test_cases_under_execution_batch.assert_not_called()
    datastore.add_test_case_under_execution.assert_not_called()
    datastore.delete_test_cases_under_execution.assert_called_once_with(["1"])


def test_check_delete_scenario_cases():
    service, _, _ = _service_with_mocks()

    tcue = _make_tcue(
        "1", test_case_id="tc1", test_run_id="tr1", scenario_parameters={}
    )

    assert (
        service.check_delete_test_case_under_execution_scenario(
            tcue=tcue,
            test_case_param_dicts=[],
        )
        is None
    )

    tcue_missing = _make_tcue(
        "2", test_case_id="tc1", test_run_id="tr1", scenario_parameters={"X": "Y"}
    )
    assert (
        service.check_delete_test_case_under_execution_scenario(
            tcue=tcue_missing,
            test_case_param_dicts=[{"A": "1"}],
        )
        == tcue_missing.id
    )

    tcue_present = _make_tcue(
        "3", test_case_id="tc1", test_run_id="tr1", scenario_parameters={"A": "1"}
    )
    assert (
        service.check_delete_test_case_under_execution_scenario(
            tcue=tcue_present,
            test_case_param_dicts=[{"A": "1"}],
        )
        is None
    )


def test_sync_flow_search_error_continues_without_deletion():
    service, datastore, test_case_datastore_mock = _service_with_mocks()

    tcue = _make_tcue(
        "1", test_case_id="tc_missing", test_run_id="tr1", scenario_parameters={}
    )
    datastore.get_test_cases_under_execution.return_value = [tcue]
    test_case_datastore_mock.fetch_test_cases_by_ids.return_value = []
    test_case_datastore_mock.get_test_cases_by_flow_id.side_effect = Exception("boom")

    req = ApiRequestEntity(
        data={"test_run_id": "tr1"}, method=ApiRequestEntity.API_METHOD_POST
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200
    assert resp.response["count_of_synced_test_cases_under_execution"] == 0
    datastore.update_test_cases_under_execution_batch.assert_not_called()
    datastore.add_test_case_under_execution.assert_not_called()
    datastore.delete_test_cases_under_execution.assert_not_called()


def test_sync_deletes_tcues_with_removed_scenarios():
    service, datastore, test_case_datastore_mock = _service_with_mocks()

    tcue_keep = _make_tcue(
        "1", test_case_id="tc1", test_run_id="tr1", scenario_parameters={"A": "1"}
    )
    tcue_delete = _make_tcue(
        "2", test_case_id="tc1", test_run_id="tr1", scenario_parameters={"B": "2"}
    )
    datastore.get_test_cases_under_execution.return_value = [tcue_keep, tcue_delete]

    scenarios = [
        Scenario(
            id="sc1",
            description="only A",
            params=[TestCaseParameter(parameter_name="A", parameter_value="1")],
        )
    ]
    raw_tc = _make_raw_test_case("tc1", flow_id="flow-1", scenarios=scenarios)
    test_case_datastore_mock.fetch_test_cases_by_ids.return_value = [raw_tc]

    req = ApiRequestEntity(
        data={"test_run_id": "tr1"}, method=ApiRequestEntity.API_METHOD_POST
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200
    assert resp.response["count_of_synced_test_cases_under_execution"] == 2
    datastore.update_test_cases_under_execution_batch.assert_called_once()
    args, _ = datastore.update_test_cases_under_execution_batch.call_args
    assert len(args[0]) == 1
    datastore.delete_test_cases_under_execution.assert_called_once_with(["2"])


def test_sync_comprehensive_scenario_changes():
    service, datastore, test_case_datastore_mock = _service_with_mocks()

    service.test_run_datastore._replace_param_recursive = MagicMock(
        side_effect=lambda value, param, replacement: value
    )

    tcue_tc1_keep = _make_tcue(
        "1",
        test_case_id="tc1",
        test_run_id="tr1",
        scenario_parameters={"A": "1"},
        flow_id="flow-1",
    )
    tcue_tc1_delete = _make_tcue(
        "2",
        test_case_id="tc1",
        test_run_id="tr1",
        scenario_parameters={"B": "2"},
        flow_id="flow-1",
    )

    tcue_tc2_no_scenario = _make_tcue(
        "3",
        test_case_id="tc2",
        test_run_id="tr1",
        scenario_parameters={},
        flow_id="flow-2",
    )

    tcue_tc3_delete = _make_tcue(
        "4",
        test_case_id="tc3",
        test_run_id="tr1",
        scenario_parameters={"E": "5"},
        flow_id="flow-3",
    )

    datastore.get_test_cases_under_execution.return_value = [
        tcue_tc1_keep,
        tcue_tc1_delete,
        tcue_tc2_no_scenario,
        tcue_tc3_delete,
    ]

    raw_tc1 = _make_raw_test_case(
        "tc1",
        flow_id="flow-1",
        scenarios=[
            Scenario(
                id="sc1",
                description="A scenario",
                params=[TestCaseParameter(parameter_name="A", parameter_value="1")],
            ),
            Scenario(
                id="sc2",
                description="C scenario",
                params=[TestCaseParameter(parameter_name="C", parameter_value="3")],
            ),
        ],
    )

    raw_tc2 = _make_raw_test_case(
        "tc2",
        flow_id="flow-2",
        scenarios=[
            Scenario(
                id="sc3",
                description="D scenario",
                params=[TestCaseParameter(parameter_name="D", parameter_value="4")],
            )
        ],
    )

    raw_tc3 = _make_raw_test_case("tc3", flow_id="flow-3", scenarios=None)

    def mock_fetch_test_cases_by_ids(test_case_ids):
        result = []
        for tc_id in test_case_ids:
            if tc_id == "tc1":
                result.append(raw_tc1)
            elif tc_id == "tc2":
                result.append(raw_tc2)
            elif tc_id == "tc3":
                result.append(raw_tc3)
        return result

    test_case_datastore_mock.fetch_test_cases_by_ids.side_effect = (
        mock_fetch_test_cases_by_ids
    )

    req = ApiRequestEntity(
        data={"test_run_id": "tr1"}, method=ApiRequestEntity.API_METHOD_POST
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200

    assert resp.response["count_of_synced_test_cases_under_execution"] == 6

    assert datastore.update_test_cases_under_execution_batch.call_count == 1

    assert datastore.add_test_case_under_execution.call_count == 2

    assert datastore.delete_test_cases_under_execution.call_count == 1
    delete_calls = datastore.delete_test_cases_under_execution.call_args_list
    deleted_ids = [call[0][0] for call in delete_calls]
    assert ["2", "3", "4"] in deleted_ids


def test_sync_preview_mode_returns_counts_without_executing():

    service, datastore, test_case_datastore_mock = _service_with_mocks()

    tcue_keep = _make_tcue(
        "1", test_case_id="tc1", test_run_id="tr1", scenario_parameters={"A": "1"}
    )
    tcue_delete = _make_tcue(
        "2", test_case_id="tc1", test_run_id="tr1", scenario_parameters={"B": "2"}
    )
    datastore.get_test_cases_under_execution.return_value = [tcue_keep, tcue_delete]

    scenarios = [
        Scenario(
            id="sc1",
            description="only A",
            params=[TestCaseParameter(parameter_name="A", parameter_value="1")],
        ),
        Scenario(
            id="sc2",
            description="new C",
            params=[TestCaseParameter(parameter_name="C", parameter_value="3")],
        ),
    ]
    raw_tc = _make_raw_test_case("tc1", flow_id="flow-1", scenarios=scenarios)
    test_case_datastore_mock.fetch_test_cases_by_ids.return_value = [raw_tc]

    req = ApiRequestEntity(
        data={"test_run_id": "tr1", "preview": True},
        method=ApiRequestEntity.API_METHOD_POST,
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200
    assert resp.response["preview"] is True
    assert resp.response["message"] == "Preview of sync operations"

    operations = resp.response["operations"]
    assert operations["will_create"] == 1
    assert operations["will_update"] == 1
    assert operations["will_delete"] == 1
    assert operations["total_affected"] == 3

    datastore.update_test_cases_under_execution_batch.assert_not_called()
    datastore.add_test_case_under_execution.assert_not_called()
    datastore.delete_test_cases_under_execution.assert_not_called()


def test_sync_preview_mode_with_no_flow_id_tcues():

    service, datastore, test_case_datastore_mock = _service_with_mocks()

    tcue_no_flow = _make_tcue("1", test_case_id="tc1", test_run_id="tr1", flow_id=None)
    datastore.get_test_cases_under_execution.return_value = [tcue_no_flow]

    req = ApiRequestEntity(
        data={"test_run_id": "tr1", "preview": True},
        method=ApiRequestEntity.API_METHOD_POST,
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200
    assert resp.response["preview"] is True

    operations = resp.response["operations"]
    assert operations["will_create"] == 0
    assert operations["will_update"] == 0
    assert operations["will_delete"] == 1
    assert operations["total_affected"] == 1

    datastore.update_test_cases_under_execution_batch.assert_not_called()
    datastore.add_test_case_under_execution.assert_not_called()
    datastore.delete_test_cases_under_execution.assert_not_called()


def test_sync_normal_mode_still_works():
    """Test that normal sync mode (without preview) still works as before."""
    service, datastore, test_case_datastore_mock = _service_with_mocks()

    tcue = _make_tcue(
        "1", test_case_id="tc1", test_run_id="tr1", scenario_parameters={"A": "1"}
    )
    datastore.get_test_cases_under_execution.return_value = [tcue]

    scenarios = [
        Scenario(
            id="sc1",
            description="A scenario",
            params=[TestCaseParameter(parameter_name="A", parameter_value="1")],
        )
    ]
    raw_tc = _make_raw_test_case("tc1", flow_id="flow-1", scenarios=scenarios)
    test_case_datastore_mock.fetch_test_cases_by_ids.return_value = [raw_tc]

    req = ApiRequestEntity(
        data={"test_run_id": "tr1"}, method=ApiRequestEntity.API_METHOD_POST
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200
    assert "preview" not in resp.response
    assert resp.response["message"] == "Test cases under executions synced successfully"
    assert resp.response["count_of_synced_test_cases_under_execution"] == 1

    datastore.update_test_cases_under_execution_batch.assert_called_once()
    datastore.add_test_case_under_execution.assert_not_called()
    datastore.delete_test_cases_under_execution.assert_not_called()


def test_sync_preview_falls_back_to_flow_id_search():
    service, datastore, test_case_datastore_mock = _service_with_mocks()

    tcue = _make_tcue(
        "1",
        test_case_id="tc_missing",
        test_run_id="tr1",
        scenario_parameters={},
        flow_id="flow-1",
    )
    datastore.get_test_cases_under_execution.return_value = [tcue]

    test_case_datastore_mock.fetch_test_cases_by_ids.return_value = []
    raw_tc = _make_raw_test_case("tc2", flow_id="flow-1", scenarios=None)
    test_case_datastore_mock.get_test_cases_by_flow_id.return_value = [raw_tc]

    req = ApiRequestEntity(
        data={"test_run_id": "tr1", "preview": True},
        method=ApiRequestEntity.API_METHOD_POST,
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200
    assert resp.response["preview"] is True
    ops = resp.response["operations"]

    assert ops["will_create"] == 0
    assert ops["will_update"] == 1
    assert ops["will_delete"] == 0
    assert ops["total_affected"] == 1
    datastore.delete_test_cases_under_execution.assert_not_called()


def test_sync_preview_flow_search_error_does_not_delete():
    service, datastore, test_case_datastore_mock = _service_with_mocks()

    tcue = _make_tcue(
        "1",
        test_case_id="tc_missing",
        test_run_id="tr1",
        scenario_parameters={},
        flow_id="flow-1",
    )
    datastore.get_test_cases_under_execution.return_value = [tcue]

    test_case_datastore_mock.fetch_test_cases_by_ids.return_value = []
    test_case_datastore_mock.get_test_cases_by_flow_id.side_effect = Exception("boom")

    req = ApiRequestEntity(
        data={"test_run_id": "tr1", "preview": True},
        method=ApiRequestEntity.API_METHOD_POST,
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200
    assert resp.response["preview"] is True
    ops = resp.response["operations"]

    assert ops["will_create"] == 0
    assert ops["will_update"] == 0
    assert ops["will_delete"] == 0
    assert ops["total_affected"] == 0
    datastore.delete_test_cases_under_execution.assert_not_called()


def test_sync_preview_updates_only_when_already_in_sync():
    service, datastore, test_case_datastore_mock = _service_with_mocks()

    tcue1 = _make_tcue(
        "1", test_case_id="tc1", test_run_id="tr1", scenario_parameters={"A": "1"}
    )
    tcue2 = _make_tcue(
        "2", test_case_id="tc1", test_run_id="tr1", scenario_parameters={"B": "2"}
    )
    datastore.get_test_cases_under_execution.return_value = [tcue1, tcue2]

    scenarios = [
        Scenario(
            id="sc1",
            description="A scenario",
            params=[TestCaseParameter(parameter_name="A", parameter_value="1")],
        ),
        Scenario(
            id="sc2",
            description="B scenario",
            params=[TestCaseParameter(parameter_name="B", parameter_value="2")],
        ),
    ]
    raw_tc = _make_raw_test_case("tc1", flow_id="flow-1", scenarios=scenarios)
    test_case_datastore_mock.fetch_test_cases_by_ids.return_value = [raw_tc]

    req = ApiRequestEntity(
        data={"test_run_id": "tr1", "preview": True},
        method=ApiRequestEntity.API_METHOD_POST,
    )
    resp = service.sync_tcue_in_test_run(req)

    assert resp.status_code == 200
    assert resp.response["preview"] is True
    ops = resp.response["operations"]

    assert ops["will_create"] == 0
    assert ops["will_update"] == 2
    assert ops["will_delete"] == 0
    assert ops["total_affected"] == 2
