smoke_test_case_response_schema = {
    "type": "object",
    "properties": {
        "test_case_description": {"type": "string"},
        "design_frame_index": {"type": "number"},
        "preconditions": {"type": "array", "items": {"type": "string"}},
        "test_case_steps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "step_description": {"type": "string"},
                    "expected_results": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": [
                    "step_description",
                    "expected_results",
                ],
            },
        },
        "rationale": {"type": "string"},
    },
    "required": [
        "test_case_description",
        "design_frame_index",
        "preconditions",
        "test_case_steps",
        "rationale",
    ],
}

smoke_test_cases_response_schema = {
    "type": "array",
    "items": smoke_test_case_response_schema,
}
