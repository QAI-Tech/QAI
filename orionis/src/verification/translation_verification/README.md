# Translation Verification Module

This module provides comprehensive translation validation functionality for mobile application screens. It uses LLM (Large Language Model) to analyze images and validate translations against expected test case data.

## Features

- **Image Analysis**: Upload multiple images for translation validation
- **JSON Input Support**: Provide structured test case data with expected translations
- **Comprehensive Validation**: Check spelling, grammar, cultural appropriateness, and consistency
- **Detailed Reporting**: Get detailed results with confidence scores and recommendations
- **Audit Trail**: Store prompts and responses for debugging and compliance
- **Flexible Input**: Support both direct image URLs and automatic frame extraction from videos

## Architecture

### Core Components

1. **TranslationsVerifier**: Main class that orchestrates the validation process
2. **Prompt Templates**: Structured prompts for LLM interaction
3. **Response Models**: Pydantic models for structured data handling
4. **JSON Schemas**: Validation schemas for LLM responses
5. **Request/Response Models**: API contract definitions

### File Structure

```
translation_verification/
├── translation_verifier.py              # Main verification logic
├── translation_verification_prompts.py  # LLM prompt templates
├── translation_verification_json_schemas.py  # JSON response schemas
├── translation_verification_response_models.py  # Pydantic response models
├── translation_verification_models.py   # Request/response API models
├── translation_verification_request_validator.py  # Request validation
└── README.md                           # This documentation
```

## Usage

### Basic Usage

```python
from verification.translation_verification.translation_verifier import TranslationsVerifier

# Initialize with dependencies
verifier = TranslationsVerifier(
    test_case_datastore=test_case_datastore,
    test_case_under_exec_datastore=tcue_datastore,
    llm_model=llm_model,
    file_storage=file_storage,
    verification_request_validator=validator
)

# Prepare request data
request_data = {
    "product_id": "product_123",
    "flow_id": "flow_456",
    "tcue_id": "tcue_789",
    "annotations": ["Login flow validation"],
    "image_urls": ["https://example.com/screen1.jpg", "https://example.com/screen2.jpg"],
    "test_case_data": {
        "expected_elements": [
            {"type": "button", "text": "Sign In"},
            {"type": "label", "text": "Welcome"}
        ],
        "expected_text": ["Sign In", "Welcome", "Email", "Password"]
    }
}

# Perform validation
result = verifier.verify_translations(request_data)
```

### Request Data Structure

```json
{
  "product_id": "string",
  "flow_id": "string",
  "tcue_id": "string",
  "annotations": ["string"],
  "image_urls": ["string"], // Optional: direct image URLs
  "test_case_data": {
    // Optional: structured test case data
    "test_case_id": "string",
    "test_case_name": "string",
    "expected_elements": [
      {
        "element_type": "string",
        "element_id": "string",
        "expected_text": "string",
        "description": "string"
      }
    ],
    "expected_text": ["string"],
    "language": "string",
    "region": "string",
    "validation_criteria": {
      "check_spelling": true,
      "check_grammar": true,
      "check_cultural_appropriateness": true,
      "check_consistency": true
    }
  }
}
```

### Response Structure

```json
{
  "tcue_id": "string",
  "status": "pass|fail|partial",
  "confidence_score": 85,
  "issues_count": 2,
  "validation_result": {
    "overall_status": "pass|fail|partial",
    "confidence_score": 85,
    "validation_summary": "string",
    "detailed_results": [
      {
        "screen_index": 0,
        "screen_name": "string",
        "status": "pass|fail|partial",
        "issues": [
          {
            "element_type": "string",
            "expected_text": "string",
            "actual_text": "string",
            "issue_type": "string",
            "severity": "low|medium|high|critical",
            "suggestion": "string"
          }
        ]
      }
    ],
    "issues_found": [
      {
        "issue_id": "string",
        "description": "string",
        "severity": "low|medium|high|critical",
        "affected_elements": ["string"]
      }
    ],
    "recommendations": ["string"]
  }
}
```

## Validation Criteria

The system validates translations based on the following criteria:

1. **Text Accuracy**: Exact match with expected translations
2. **Grammar and Spelling**: Proper language usage
3. **Cultural Appropriateness**: Contextually appropriate translations
4. **Consistency**: Uniform terminology across the application
5. **Completeness**: All expected text elements are present
6. **Formatting**: Proper spacing, capitalization, and punctuation

## Issue Types

The system can detect various types of translation issues:

- **spacing**: Missing or incorrect spacing between words
- **translation_missing**: Text not translated to target language
- **grammar_error**: Grammatical errors in translation
- **spelling_error**: Spelling mistakes
- **cultural_inappropriate**: Culturally inappropriate translations
- **inconsistent_terminology**: Inconsistent use of terms
- **formatting_error**: Incorrect formatting (case, punctuation)

## Severity Levels

Issues are categorized by severity:

- **low**: Minor issues that don't affect functionality
- **medium**: Issues that may affect user experience
- **high**: Issues that significantly impact usability
- **critical**: Issues that prevent proper functionality

## Configuration

### Bucket Configuration

The system uses Google Cloud Storage for storing prompts and responses:

```python
TRANSLATION_VERIFICATION_BUCKET_NAME = "orionis-translation-verification"
```

### LLM Configuration

The system uses the existing LLM model wrapper with structured output:

```python
llm_response = self.llm_model.call_llm_v3(
    prompt=prompt,
    image_urls=image_urls,
    response_schema=validate_translations_response_schema,
)
```

## Testing

Run the tests to verify functionality:

```bash
pytest tests/verification/test_translation_verifier.py -v
```

## Example

See `examples/translation_validation_example.py` for a complete working example.

## Dependencies

- `pydantic`: Data validation and serialization
- `llm_model`: LLM interaction wrapper
- `google_cloud_wrappers`: File storage operations
- `test_case_datastore`: Test case data access
- `test_case_under_exec_datastore`: TCUE data access

## Future Enhancements

1. **Video Frame Extraction**: Automatic frame extraction from TCUE videos
2. **Multi-language Support**: Enhanced support for multiple languages
3. **Batch Processing**: Process multiple test cases simultaneously
4. **Custom Validation Rules**: User-defined validation criteria
5. **Integration with Translation Services**: Direct integration with translation APIs
