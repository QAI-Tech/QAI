input_image_description_response_schema = {
    "type": "object",
    "properties": {
        "image_index": {"type": "number"},
        "description": {"type": "string"},
    },
}

input_images_description_response_schema = {
    "type": "array",
    "items": input_image_description_response_schema,
}

base_functionality_from_frames_response_schema = {
    "type": "object",
    "properties": {
        "functionality_id": {"type": "string"},
        "functionality_name": {"type": "string"},
        "interactions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "rationale": {"type": "string"},
    },
    "required": [
        "functionality_id",
        "functionality_name",
        "interactions",
        "rationale",
    ],
}

base_functionalities_from_frames_response_schema = {
    "type": "array",
    "items": base_functionality_from_frames_response_schema,
}

functionality_from_frames_response_schema = {
    "type": "object",
    "properties": {
        "functionality_id": {"type": "string"},
        "functionality_name": {"type": "string"},
        "interactions": {
            "type": "array",
            "items": {"type": "string"},
        },
        "rationale": {"type": "string"},
        "depicted_in_images_indices": {
            "type": "array",
            "items": {"type": "number"},
        },
        "image_association_rationale": {"type": "string"},
        "confidence_score": {"type": "number"},
    },
    "required": [
        "functionality_id",
        "functionality_name",
        "interactions",
        "rationale",
        "depicted_in_images_indices",
        "image_association_rationale",
        "confidence_score",
    ],
}

functionalities_from_frames_response_schema = {
    "type": "array",
    "items": functionality_from_frames_response_schema,
}

correction_from_frames_response_schema = {
    "type": "object",
    "properties": {
        "field": {"type": "string"},
        "correction_rationale": {"type": "string"},
        "confidence_score": {"type": "number"},
    },
    "required": ["field", "correction_rationale", "confidence_score"],
}

corrected_base_functionalities_from_frames_response_schema = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "functionality": base_functionality_from_frames_response_schema,
            "corrections": {
                "type": "array",
                "items": correction_from_frames_response_schema,
            },
        },
        "required": ["functionality", "corrections"],
    },
}

feature_from_frames_response_schema = {
    "type": "object",
    "properties": {
        "feature_id": {"type": "string"},
        "feature_name": {"type": "string"},
        "functionality_ids": {
            "type": "array",
            "items": {"type": "string"},
        },
        "rationale": {"type": "string"},
    },
    "required": [
        "feature_id",
        "feature_name",
        "functionality_ids",
        "rationale",
    ],
}

group_functionalities_into_features_response_schema = {
    "type": "array",
    "items": feature_from_frames_response_schema,
}

screen_from_frames_response_schema = {
    "type": "object",
    "properties": {
        "screen_name": {"type": "string"},
        "depicted_in_image_indices": {"type": "array", "items": {"type": "number"}},
        "rationale": {"type": "string"},
    },
    "required": ["screen_name", "depicted_in_image_indices", "rationale"],
}

group_screens_from_frames_response_schema = {
    "type": "array",
    "items": screen_from_frames_response_schema,
}
