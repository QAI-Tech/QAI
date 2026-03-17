issue_schema = {
    "type": "object",
    "properties": {
        "issue_id": {"type": "string"},
        "element_type": {"type": "string"},
        "expected_text": {"type": "string"},
        "actual_text": {"type": "string"},
        "issue_type": {
            "type": "string",
            "enum": [
                "spacing",
                "translation_missing",
                "grammar_error",
                "spelling_error",
                "cultural_inappropriate",
                "inconsistent_terminology",
                "formatting_error",
            ],
        },
        "description": {"type": "string"},
        "severity": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
        "suggestion": {"type": "string"},
        "affected_elements": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": [
        "issue_id",
        "element_type",
        "expected_text",
        "actual_text",
        "issue_type",
        "description",
        "severity",
        "suggestion",
        "affected_elements",
    ],
}

detailed_result_schema = {
    "type": "object",
    "properties": {
        "screen_index": {"type": "number"},
        "screen_name": {"type": "string"},
        "status": {"type": "string", "enum": ["pass", "fail"]},
        "issues": {
            "type": "array",
            "items": issue_schema,
        },
    },
    "required": ["screen_index", "screen_name", "status", "issues"],
}

validate_translations_response_schema = {
    "type": "object",
    "properties": {
        "overall_status": {"type": "string", "enum": ["pass", "fail"]},
        "confidence_score": {"type": "number", "minimum": 0, "maximum": 100},
        "validation_summary": {"type": "string"},
        "detailed_results": {
            "type": "array",
            "items": detailed_result_schema,
        },
        "recommendations": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": [
        "overall_status",
        "confidence_score",
        "validation_summary",
        "detailed_results",
        "recommendations",
    ],
}
