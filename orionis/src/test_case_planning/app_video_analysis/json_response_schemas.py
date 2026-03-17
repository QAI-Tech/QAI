interaction_from_video_response_schema = {
    "type": "object",
    "properties": {
        "description": {"type": "string"},
        "observed_results": {
            "type": "array",
            "items": {"type": "string"},
        },
        "start_timestamp": {"type": "string"},
        "end_timestamp": {"type": "string"},
        "rationale": {"type": "string"},
    },
    "required": [
        "description",
        "observed_results",
        "start_timestamp",
        "end_timestamp",
        "rationale",
    ],
}

screen_from_video_response_schema = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "description": {"type": "string"},
        "routes_to": {"type": "array", "items": {"type": "string"}},
        "appears_at_timestamp": {"type": "array", "items": {"type": "string"}},
        "rationale": {"type": "string"},
    },
    "required": [
        "id",
        "title",
        "description",
        "routes_to",
        "appears_at_timestamp",
        "rationale",
    ],
}

screens_from_video_response_schema = {
    "type": "array",
    "items": screen_from_video_response_schema,
}

test_case_step_from_video_response_schema = {
    "type": "object",
    "properties": {
        "step_description": {"type": "string"},
        "expected_results": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["step_description", "expected_results"],
}

test_case_from_video_response_schema = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
        "preconditions": {"type": "array", "items": {"type": "string"}},
        "test_case_steps": {
            "type": "array",
            "items": test_case_step_from_video_response_schema,
        },
        "rationale": {"type": "string"},
    },
    "required": [
        "title",
        "description",
        "preconditions",
        "test_case_steps",
        "rationale",
    ],
}

interactions_from_video_response_schema = {
    "type": "array",
    "items": interaction_from_video_response_schema,
}

test_cases_from_video_response_schema = {
    "type": "array",
    "items": test_case_from_video_response_schema,
}
