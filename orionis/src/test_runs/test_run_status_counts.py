from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict

from test_case_under_execution.test_case_under_exec_models import ExecutionStatus
from utils.util import orionis_log


def apply_status_count_deltas(
    status_counts: Dict[str, int], deltas: Dict[str, int]
) -> Dict[str, int]:
    """
    Apply deltas to a status_counts dictionary.

    Example:
      status_counts={"passed": 5, "failed": 3}
      deltas={"passed": -1, "failed": +1}
      -> {"passed": 4, "failed": 4}

    Returns a dict containing only non-zero counts.
    """
    updated = dict(status_counts)
    for key, delta in deltas.items():
        if delta == 0:
            continue
        updated[key] = max(0, int(updated.get(key, 0)) + int(delta))
    return {k: v for k, v in updated.items() if v > 0}


def build_status_count_deltas(
    old_status: ExecutionStatus, new_status: ExecutionStatus
) -> Dict[str, int]:
    """
    Build deltas for a single TCUE status change.

    Example: PASSED -> FAILED  => {"passed": -1, "failed": +1}
    """
    deltas: Dict[str, int] = {}

    if old_status == ExecutionStatus.PASSED:
        deltas["passed"] = -1
    elif old_status == ExecutionStatus.FAILED:
        deltas["failed"] = -1

    if new_status == ExecutionStatus.PASSED:
        deltas["passed"] = deltas.get("passed", 0) + 1
    elif new_status == ExecutionStatus.FAILED:
        deltas["failed"] = deltas.get("failed", 0) + 1

    return deltas


def update_test_run_status_counts(
    db,
    test_run_id: str,
    old_status: ExecutionStatus,
    new_status: ExecutionStatus,
) -> None:
    """
    Update denormalized status counts on the TestRun entity.

    This is a shared implementation used by multiple datastores to avoid
    code duplication and circular imports.
    """
    if old_status == new_status:
        return

    try:
        test_run_key = db.key("TestRun", int(test_run_id))
        test_run_entity = db.get(test_run_key)
        if not test_run_entity:
            orionis_log(f"TestRun {test_run_id} not found for status count update")
            return

        status_counts = dict(test_run_entity.get("status_counts") or {})
        deltas = build_status_count_deltas(old_status, new_status)
        updated_status_counts = apply_status_count_deltas(status_counts, deltas)

        test_run_entity["status_counts"] = (
            updated_status_counts if updated_status_counts else None
        )
        test_run_entity["updated_at"] = datetime.now(timezone.utc)
        db.put(test_run_entity)
    except Exception as e:
        orionis_log(f"Error updating status counts for test run {test_run_id}: {e}", e)
