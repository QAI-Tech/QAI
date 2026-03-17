"""
JSON Response Schemas for LLM structured output in Flow Recommendation Service
"""

DESCRIPTION_MATCH_SCHEMA = {
    "type": "object",
    "properties": {
        "potential_matches": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "flow_a_node_id": {"type": "string"},
                    "flow_b_node_id": {"type": "string"},
                },
                "required": ["flow_a_node_id", "flow_b_node_id"],
            },
            "description": "List of node ID pairs that might be the same screen",
        },
        "reasoning": {
            "type": "string",
            "description": "Explanation of matching logic",
        },
    },
    "required": ["potential_matches", "reasoning"],
}

IMAGE_VERIFICATION_SCHEMA = {
    "type": "object",
    "properties": {
        "is_same_screen": {
            "type": "boolean",
            "description": "Whether the screenshots show the same screen",
        },
        "is_same_app": {
            "type": "boolean",
            "description": "Whether the screenshots are from the same app",
        },
        "confidence": {
            "type": "number",
            "minimum": 0.0,
            "maximum": 1.0,
            "description": "Confidence score for the decision",
        },
        "reasoning": {
            "type": "string",
            "description": "Explanation of the decision",
        },
    },
    "required": ["is_same_screen", "is_same_app", "confidence", "reasoning"],
}

EDGE_COMPARISON_SCHEMA = {
    "type": "object",
    "properties": {
        "are_same_action": {
            "type": "boolean",
            "description": "Whether the edges describe the same user action",
        },
        "reasoning": {
            "type": "string",
            "description": "Explanation of the decision",
        },
    },
    "required": ["are_same_action", "reasoning"],
}

FLOW_DEPTH_CLASSIFICATION_SCHEMA = {
    "type": "object",
    "properties": {
        "classifications": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "flow_id": {"type": "string"},
                    "depth": {
                        "type": "string",
                        "enum": ["SHALLOW", "DEEP"],
                    },
                    "position_hint": {
                        "type": "string",
                        "enum": ["left", "center", "right"],
                    },
                    "reasoning": {"type": "string"},
                },
                "required": ["flow_id", "depth", "position_hint", "reasoning"],
            },
            "description": "Classification for each flow",
        },
    },
    "required": ["classifications"],
}

MULTI_FLOW_SCREEN_MATCHING_SCHEMA = {
    "type": "object",
    "properties": {
        "screen_groups": {
            "type": "array",
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "flow_id": {"type": "string"},
                        "node_id": {"type": "string"},
                    },
                    "required": ["flow_id", "node_id"],
                },
            },
            "description": "Groups of nodes that represent the same screen",
        },
        "reasoning": {
            "type": "string",
            "description": "Explanation of grouping logic",
        },
    },
    "required": ["screen_groups", "reasoning"],
}
