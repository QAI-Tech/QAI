raw_test_case_step_schema = {
    "type": "object",
    "properties": {
        "step_description": {"type": "string"},
        "expected_results": {"type": "array", "items": {"type": "string"}},
        "edge_id": {"type": "string"},
    },
    "required": ["step_description", "expected_results", "edge_id"],
}

raw_test_case_schema = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
        "preconditions": {"type": "array", "items": {"type": "string"}},
        "test_case_steps": {
            "type": "array",
            "items": raw_test_case_step_schema,
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

negative_test_case_schema = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
        "preconditions": {"type": "array", "items": {"type": "string"}},
        "test_case_steps": {
            "type": "array",
            "items": raw_test_case_step_schema,
        },
        "rationale": {"type": "string"},
        "screen_index": {"type": "integer"},
    },
    "required": [
        "title",
        "description",
        "preconditions",
        "test_case_steps",
        "rationale",
        "screen_index",
    ],
}

neg_test_cases_per_screen_schema = {
    "type": "array",
    "items": negative_test_case_schema,
}
neg_test_cases_schema = {
    "type": "array",
    "items": neg_test_cases_per_screen_schema,
}
