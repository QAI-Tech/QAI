# Nova Open-Source GCP Removal Plan

## Objective
Remove the remaining direct GCP dependencies from `QAI/nova` while preserving the current open-source adaptation style already present in the monorepo.

The work is split into two tracks:

1. Fetching graph and flows via GCMS/collaboration service
2. Uploading artifacts via an Orionis-backed storage wrapper

## Current State

### Already migrated
- `nova/utils/utils.py::storeKGSSs()` already fetches graph + flows from the collaboration backend instead of reading `graph-export.json` and `flows-export.json` from the `graph-editor` bucket.
- `orionis/src/common/google_cloud_wrappers.py` already supports both:
  - GCP-backed storage
  - local-file backed storage via `ORIONIS_BACKEND=local`

### Still GCP-bound in Nova
- `nova/browser-droid/app/processors/graph_uploader.py`
  - reads existing graph/flows from `graph-editor` bucket
  - merges locally
  - uploads merged `graph-export.json` / `flows-export.json` back to bucket
- `nova/gcp_upload/google_cloud_wrappers.py`
  - uses raw `google.cloud.storage`
  - duplicates functionality already implemented in Orionis
- `nova/gcp_upload/log_states.py`
  - uploads videos/state artifacts directly through raw bucket/blob operations
- `nova/web_executor/video_utils.py`
  - uploads web execution artifacts directly through Nova’s GCP wrapper
- `nova/droidrun/droidrun/agent/trajectory/gcp_upload.py`
  - performs direct GCS uploads instead of reusing shared storage abstraction
- `nova/utils/arg_parser.py`
  - still constructs `kg_gcp_path` and `flows_gcp_path`, though the Android execution path now uses collaboration fetch instead

## Migration Principles
- Keep Nova’s surface area stable where possible.
- Prefer adapters over broad refactors.
- Reuse Orionis abstractions instead of creating a second open-source storage system inside Nova.
- Preserve current path conventions like `product_id/test_run_id/tcue_id/...`.
- Preserve current graph/flow merge semantics unless there is a correctness issue.

## Execution Plan

### Phase 1: Add a Nova adapter to Orionis storage
Create a compatibility layer in `nova/gcp_upload/google_cloud_wrappers.py` that delegates to Orionis `common.google_cloud_wrappers.GCPFileStorageWrapper`.

Planned behavior:
- keep the existing Nova class names so current imports do not break
- internally reuse Orionis wrapper methods for:
  - `store_file`
  - `copy_blob`
  - `list_blobs`
  - `delete_directory`
- add Nova-compatible helpers for:
  - uploading bytes/files
  - resolving bucket objects where current Nova code expects `.blob(...)`
- ensure this works in both:
  - normal GCP mode
  - `ORIONIS_BACKEND=local`

Outcome:
- all existing Nova upload code can be progressively redirected without changing every caller at once

### Phase 2: Remove graph/flow bucket dependency from browser-droid
Refactor `nova/browser-droid/app/processors/graph_uploader.py` to stop using `google.cloud.storage` directly.

Planned changes:
- remove service-account based project detection for `graph-editor` bucket selection
- fetch existing graph/flows through collaboration/GCMS client instead of bucket download
- keep local merge logic for now:
  - download current graph state from collaboration API
  - merge with newly generated graph/flows
  - emit merged graph/flows back through collaboration events or full replacement flow
- centralize graph/flow sync behind one helper so future changes are isolated

Open implementation detail:
- if collaboration API supports full graph replacement cleanly, use replace semantics
- otherwise emit merged nodes/edges/flows incrementally after deduplication

Outcome:
- graph/flow persistence becomes GCMS-backed end to end

### Phase 3: Move Nova artifact uploads onto Orionis-backed wrapper
Refactor artifact upload paths to use the shared wrapper rather than raw `google.cloud.storage`.

Targets:
- `nova/gcp_upload/log_states.py`
- `nova/web_executor/video_utils.py`
- `nova/droidrun/droidrun/agent/trajectory/gcp_upload.py`

Planned changes:
- replace direct `bucket.blob(...).upload_from_file(...)` usage with shared helper methods
- add `store_bytes` / file-upload convenience methods in Nova adapter if required
- preserve returned URIs and bucket/path conventions for downstream consumers

Outcome:
- local open-source mode can store execution artifacts without GCS
- GCP mode remains supported through Orionis abstraction

### Phase 4: Clean stale GCP-shaped inputs
Refactor `nova/utils/arg_parser.py` and nearby code so KG/flow source is no longer modeled as GCS paths when not needed.

Planned changes:
- stop constructing `kg_gcp_path` and `flows_gcp_path` for the Android execution path
- keep fields only if other code still consumes them
- rename later if needed, but prefer minimal churn in this pass

Outcome:
- request model better matches actual data source

### Phase 5: Verification
Verify both repository-level behavior and migration invariants.

Checks:
- import sanity for Nova after adapter wiring
- graph fetch still works through `storeKGSSs()`
- browser-droid graph append flow still merges and persists graph/flows
- artifact uploads succeed in local backend mode
- no remaining direct `google.cloud.storage` usage in Nova’s targeted paths

## File-Level Change Set

### Expected files to modify
- `QAI/nova/gcp_upload/google_cloud_wrappers.py`
- `QAI/nova/gcp_upload/log_states.py`
- `QAI/nova/browser-droid/app/processors/graph_uploader.py`
- `QAI/nova/web_executor/video_utils.py`
- `QAI/nova/droidrun/droidrun/agent/trajectory/gcp_upload.py`
- `QAI/nova/utils/arg_parser.py`
- optionally small helper additions under `QAI/nova/utils/`

### Expected files to inspect while implementing
- `QAI/nova/utils/collaboration_client.py`
- `QAI/nova/utils/utils.py`
- `QAI/orionis/src/common/google_cloud_wrappers.py`
- `QAI/orionis/src/common/local_file_storage.py`
- `QAI/orionis/src/common/collaboration_client.py`

## Risks
- browser-droid graph upload flow currently assumes bucket-style whole-file persistence; collaboration event semantics may differ
- Orionis wrapper is designed from the Orionis package root, so Nova adapter must import it safely from sibling repo layout
- some Nova code expects bucket objects and blob methods, so adapter compatibility may require lightweight shims
- there may be hidden downstream consumers expecting `gs://...` URIs even in local mode

## Implementation Order Chosen
1. write this plan
2. build Nova storage adapter over Orionis wrapper
3. refactor graph/flow sync path in browser-droid
4. refactor artifact upload call sites
5. clean stale args/config
6. run targeted verification

## Definition of Done
- graph/flow fetch and persistence no longer require direct GCS access in Nova
- upload paths no longer depend on raw `google.cloud.storage` in the targeted Nova modules
- Nova reuses Orionis storage abstraction for open-source local mode
- targeted verification passes or any remaining blockers are documented precisely
