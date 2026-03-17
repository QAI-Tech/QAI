VALIDATE_TRANSLATIONS_PROMPT = """
<task>
I want you to validate the translations and text content in the provided images against the expected test case data.

Your task is to:
1. Analyze the text content visible in the provided images
2. Use the steps and expected results provided in JSON format to formulate the feature/flow context for the translation validation
3. Identify the target language of the translation to use as the baseline
4. Provide detailed feedback on translation quality and accuracy.
5. Pay special attention to mixed language text elements compared to the target language.
6. Suggest corrections where relevant
</task>

<input>
- A list of images that depict the application screens with text content to be validated
- A JSON object containing steps and expected results for the feature/flow context

<steps-and-expected-results>
```
${test_steps}
```
</steps-and-expected-results>

</input>

<output>
- A JSON object containing validation results with the following structure:
  - overall_status: "pass" or "fail" based on validation results
  - confidence_score: integer between 0-100 indicating confidence in the validation
  - validation_summary: brief summary of the validation results
  - detailed_results: array of validation results for each screen/element
  - recommendations: array of suggestions for improvements

<example-json-response>
```
{
  "overall_status": "fail",
  "confidence_score": 85,
  "validation_summary": "Found 3 translation issues across 2 screens",
  "detailed_results": [
    {
      "screen_index": 0,
      "screen_name": "Login Screen",
      "status": "fail",
      "issues": [
        {
          "issue_id": "translation_001",
          "element_type": "button",
          "expected_text": "Sign In",
          "actual_text": "SignIn",
          "issue_type": "spacing",
          "description": "Missing space in button text",
          "severity": "low",
          "suggestion": "Add space between 'Sign' and 'In'",
          "affected_elements": ["login_button"]
        }
      ]
    }
  ],
  "recommendations": [
    "Review spacing in button labels",
    "Ensure all text elements are translated to Dutch",
    "Maintain consistent terminology across all screens"
  ]
}
```
</example-json-response>

</output>

<key-instructions>
- Analyze all fully visible text elements in the provided images, that fit the following criteria:
  - User-facing text elements buttons, text field labels and hints, other labels, descriptions, messages, etc.
  - If the text is partially visible because of the scroll position of the screen frame, skip it in the reports.
  - If the text is product specific (brand names, product names etc), skip it in the reports.
- Compare text content against contextually expected value/s.
- Consider factors like: spelling, grammar, spacing, capitalization
- Provide specific feedback with exact text differences
- Provide actionable recommendations for improvements
- If the text is not translated in the target language, provide a recommendation to translate it
- If the text is translated incorrectly, provide a recommendation to correct it
- Validation criteria:
  - Grammar and spelling: Proper language usage
  - Consistency: Uniform terminology across the application, same language for all text elements for all screens provided.
  - Completeness: All expected text elements are fully visible and legible.
  - Formatting: Proper spacing, capitalization, and punctuation
</key-instructions>
"""
