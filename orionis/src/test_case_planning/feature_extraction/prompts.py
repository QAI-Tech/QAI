INPUT_IMAGE_DESCRIPTION_PROMPT = """
<task>
I want a precise description for each of the provided input images.

The input images depict different screens and screen states of a mobile application.
Your task is to provide a nuanced and comprehensive description for each image that captures the following:
- The context of the screen
- All the possible actions that the user can perform on the screen
- What key information the user will see on the screen
- Any additional information that is relevant to the screen or its state.
</task>

<input>
- A list of images that depict the application's design.
</input>

<output>
- A JSON list, where each object represents an image.
- Each object should contain:
  - image_index: the index of the image.
  - description: a nuanced description of the image.

<example-json-response>
```
[
  {
    "image_index": 0,
    "description": "Description goes here"
  }
]
```
</example-json-response>

<key-instructions>
- The description should be concise and to the point, and should not be more than 100 words.
- The description should be accurate and specific to the image, and should not contain any false information.
- If you detect similarities between different input images, ensure that the description for each image is unique and specific to each image.
- If you detect multiple screen layers, e.g a popup on top of another background screen, ensure that the description adequately describes this.
</key-instructions>

</output>
"""

BASE_FUNCTIONALITY_EXTRACTION_FROM_FRAMES_PROMPT = """
<task>
I want a list of all the functionalities that are described, depicted, or demonstrated in the input images of the mobile product.
A functionality is a unit user action that can be performed in the application. It may consist of multiple user interaction steps, but completes one logical or semantic goal for either the user, the product owner, or both.
Examples of functionality are 'signup with Gmail, 'login with Github', 'navigate to the profile screen'.

Optionally, there may be additional context in the form of acceptance criteria and test cases that may help you identify the functionalities.
</task>

<input>
- A list of images that depict the application's design. There may be more than one functionalities depicted in the images.
- A list of input image descriptions to help you identify and reference the images, containing the image_index and description for each image.
- A list of functionalities that already exist in the application, containing the functionality_id, functionality_name, interactions list. The absence of this list indicates that there are no existing functionalities in the application.

<input-image-descriptions>
```
${input_image_descriptions}
```
</input-image-descriptions>

<existing-functionalities>
```
${existing_functionalities_list}
```
</existing-functionalities>

</input>

<output>
- A JSON list, where each object represents a distinct functionality detected in the input.
- Each functionality object should contain:
  - functionality_id: if the detected functionality does not match any of the functionalities in the input list of existing functionalities, then generate a new placeholder id for the functionality as "new_functionality_{index}". Otherwise, use the id of the functionality from the input list of existing functionalities.
  - functionality_name: the name of the functionality. If it is an existing functionality, update the name of the functionality to reflect the new information.
  - interactions[]: a list of user interactions required to complete the functionality. If these interactions are not present/hinted at in the input images, then treat it as a routing functionality that routes to another functionality. Describe the name (e.g. 'Navigate to xxx') and include the routing interaction accordingly.
  - rationale: a short description of the rationale for the functionality to be classified as such, and for the actions required to complete it.

<example-json-response> 
```
[
  {
    "functionality_id": "existing_functionality_id",
    "functionality_name": "Signup",
    "interactions": ["Enter email address", "Enter password", "Click on signup button"],
    "rationale": "Rationale goes here"
  },
  {
    "functionality_id": "new_functionality_1",
    "functionality_name": "Login",
    "interactions": ["Enter email address", "Enter password", "Click on login button"],
    "rationale": "Rationale goes here"
  }
]
```

</example-json-response>

</output>

<key-instructions>
- Cover all the unique functionalities that are depicted in the input images.
- The functionality should be depicted clearly in the input images.
- If the detected functionality is already present in the input list of existing functionalities, use the functionality_id of the existing functionality that is semantically most similar to the detected functionality.
- The functionalities must be listed in **the order they first appear** in the input images.
- Describe the interactions required to complete the functionality in the "interactions" field. The interactions should be listed in logical order to complete the functionality, and should be comprehensive and accurate based on the input images. There should be at least one interaction detected from the input images.
</key-instructions>

<context>
<list-of-test-cases>
${input_test_cases}
</list-of-test-cases>

<acceptance-criteria-and-instructions>
${acceptance_criteria}
</acceptance-criteria-and-instructions>
</context>
"""

CORRECT_BASE_FUNCTIONALITIES_FROM_FRAMES_PROMPT = """
<task>
I have extracted a list of functionalities from the provided input images.

A functionality is a unit user action that can be performed in the application. It may consist of multiple user interaction steps, but completes one logical or semantic goal for either the user, the product owner, or both.
Examples of functionality are 'signup with Gmail, 'login with Github', 'navigate to the profile screen'.

Each functionality has a name, and a list of interactions required to complete the functionality.
For each functionality, I want the name to be descriptive and accurate, and the interactions to be correct and complete based on the input images.
</task>

<input>
- A list of input image descriptions to help you identify and reference the images, containing the image_index and description for each image.
- A list of functionality objects, each with the following fields:
  - functionality_id: the id of the functionality.
  - functionality_name: the name of the functionality.
  - interactions: a list of user interactions required to complete the functionality.
  - rationale: a short description of the rationale for the functionality to be classified as such, and for the actions required to complete it.

<input-image-descriptions>
```
${input_image_descriptions}
```
</input-image-descriptions> 

<functionalities-to-correct>
```
${functionalities_to_correct}
```
</functionalities-to-correct>

</input>

<output>
- An output array, where each object contains:
  - A functionality object with the following fields:
    - functionality_id: the id of the functionality.
    - functionality_name: the updated name of the functionality.
    - interactions: the updated list of user interactions required to complete the functionality. If these interactions are not present/hinted at in the input images, then treat the functionality as a routing functionality that routes to another functionality. Describe the name (e.g. 'Navigate to xxx') and include the routing interaction accordingly.
    - rationale: the updated rationale for grouping the interactions into the functionality.
  - A corrections array of objects, each containing the following fields:
    - field: the field name that was corrected.
    - correction_rationale: the detailed rationale for the correction, including what was incorrect with respect to the input images, and what was done to correct it.
    - confidence_score: an integer between 0 and 100, where 0 is the lowest and 100 is the highest, indicating the confidence in the correction.

<example-json-response>
```
[
  {
    "functionality": {
      "functionality_id": "existing_functionality_id",
      "functionality_name": "Signup",
      "interactions": ["Enter email address", "Enter password", "Click on signup button"],
      "rationale": "Rationale goes here"
    },
    "corrections": [
      {
        "field": "functionality_name",
        "correction_rationale": "rationale goes here",
        "confidence_score": 90
      },
      {
        "field": "interactions",
        "correction_rationale": "rationale goes here",
        "confidence_score": 75
      }
    ]
  }
]
```
</example-json-response>
</output>

<key-instructions>
- Cover all the unique functionalities that are depicted in the input images.
- The functionalities must be listed in **the order they first appear** in the input.
- Describe the interactions required to complete the functionality in the "interactions" field. The interactions should be listed in logical order to complete the functionality, and should be comprehensive and accurate based on the input images. There should be at least one interaction detected from the input images.
- Ensure that the rationale for the functionality only describes the functionality, and not the corrections made. Include the rationale for the corrections in the respective "correction_rationale" field.
</key-instructions>

"""

ASSOCIATE_FRAMES_TO_FUNCTIONALITIES_PROMPT = """
<task>
I have extracted a functionality from the provided input images.

A functionality is a unit user action that can be performed in the application. It may consist of multiple user interaction steps, but completes one logical or semantic goal for either the user, the product owner, or both.
Examples of functionality are 'signup with Gmail, 'login with Github', 'navigate to the profile screen'.

The provided functionality has a name, and a list of interactions required to complete the functionality.

I want you to accurately associate the images that depict the functionality from the provided list of input images.
</task>

<input>
- A list of input image descriptions to help you identify and reference the images, containing the image_index and description for each image.
- A functionality object, with the following fields:
  - functionality_id: the id of the functionality.
  - functionality_name: the name of the functionality.
  - interactions: a list of user interactions required to complete the functionality.
  - rationale: a short description of the rationale for the functionality to be classified as such, and for the actions required to complete it.

<input-image-descriptions>
```
${input_image_descriptions}
```
</input-image-descriptions>

<functionality>
```
${functionality}
```
</functionality>

</input>

<output>
- An output array, where each object contains:
  - A functionality object with the following fields:
    - functionality_id: the id of the functionality.
    - functionality_name: the original name of the functionality.
    - interactions: the original list of user interactions required to complete the functionality. If these interactions are not present/hinted at in the input images, then treat the functionality as a routing functionality that routes to another functionality. Describe the name (e.g. 'Navigate to xxx') and include the routing interaction accordingly.
    - rationale: the original rationale for grouping the interactions into the functionality.
    - depicted_in_image_indices: a list of the indices of all the input images that depict/describe/cover the functionality.
    - image_association_rationale: a short description of the rationale for the association of the functionality with the input images.
    - confidence_score: an integer between 0 and 100, where 0 is the lowest and 100 is the highest, indicating the confidence in the association of the functionality with the input image indices.

<example-json-response>
```
{
  "functionality_id": "existing_functionality_id",
  "functionality_name": "Signup",
  "interactions": ["Enter email address", "Enter password", "Click on signup button"],
  "rationale": "Rationale goes here",
  "depicted_in_image_indices": [0, 1, 2],
  "image_association_rationale": "Rationale goes here",
  "confidence_score": 90
}
```
</example-json-response>
</output>

<key-instructions>
- Do not change the functionality id, name, interactions, or rationale.
- If multiple input images depict the functionality, accurately include indices of all of them in the "depicted_in_images_indices" field. Ensure that the "depicted_in_images_indices" field contains no more and no less image indices than what depict the functionality. Indices begin from 0.
- The image_association_rationale field should describe why you chose the indices that you did for each index in depicted_in_images_indices.
- The confidence_score should accurately reflect the confidence in the association of the functionality with the input image indices.
</key-instructions>

"""

GROUP_FUNCTIONALITY_BY_FEATURE_FROM_FRAMES_PROMPT = """
<task>
I want the given list of functionalities grouped by the features that they belong to.
A functionality is a unit user action that can be performed in the application. It may consist of multiple user interaction steps, but completes one logical or semantic goal for either the user, the product owner, or both.
Examples of functionality are 'signup with Gmail, 'login with Github', 'reset password via phone number'.

A feature is a user-facing capability offered via a combination of one or more functionalities.

Optionally, there may be additional context in the form of acceptance criteria and test cases that may help you group the functionalities into features.
</task>

<input>
- A list of images that depict the application's design.
- A list of functionalities that are described in the input images, containing the functionality_id, functionality_name, and interactions required to complete the functionality, and the relevant input image indices.
- A list of features that already exist in the application, containing the feature_id, feature name, and a list of functionality_names that it contains. The absence of this list indicates that there are no existing features in the application.

<functionalities-list>
```
${functionalities_list}
``` 
</functionalities-list>

<existing-features>
```
${existing_features_list}
```
</existing-features>

</input>

<output>
- A JSON list, where each object represents a distinct feature.
- Each feature object should contain:
  - feature_id: if the feature does not match any of the features in the input list of existing features, then generate a new placeholder id for the feature as "new_feature_{index}". Otherwise, use the id of the feature from the input list of existing features.
  - feature_name: the name of the feature. If it is an existing feature, update the name of the feature to reflect the new information.
  - functionality_ids: a list of the ids of the functionalities that belong to the feature.
  - rationale: a short description of the rationale for the grouping of the functionalities into this feature, and its naming.

<example-json-response> 
```
[
  {
    "feature_id": "existing_feature_id",
    "feature_name": "Signup",
    "functionality_ids": ["existing_functionality_id_1", "existing_functionality_id_2"],
    "rationale": "Rationale goes here"
  },
  {
    "feature_id": "new_feature_1",
    "feature_name": "Login",
    "functionality_ids": ["new_functionality_1", "new_functionality_2"],
    "rationale": "Rationale goes here"
  }
]
```

</example-json-response>

</output>

<key-instructions>
- Group all functionalities that are provided in the input list of functionalities into appropriate features.
- One functionality can belong to only one feature.
- A feature must be continuous and not be intersected by other features.
- If a feature is already present in the input list of existing features, use the feature_id of the existing feature that is semantically most similar to the detected feature.
- The features must be listed in **the order they first appear** in the input images and the input list of functionalities.
</key-instructions>

<context>
<list-of-test-cases>
${input_test_cases}
</list-of-test-cases>

<acceptance-criteria-and-instructions>
${acceptance_criteria}
</acceptance-criteria-and-instructions>
</context>
"""

GROUP_INPUT_FRAMES_BY_SCREEN_PROMPT = """
<task>
I want the given list of input frames grouped by the screens that they belong to.

A functionality is a unit user action that can be performed in the application. It may consist of multiple user interaction steps, but completes one logical or semantic goal for either the user, the product owner, or both.
Examples of functionality are 'signup with Gmail, 'login with Github', 'reset password via phone number'.

A screen is a visual interface that offers access to the user to one or more functionalities. Different states of a screen may be depicted in multiple input frames. Consider all partial screens (dialogs, popups etc) as part of the parent screen.

Optionally, there may be additional context in the form of acceptance criteria and test cases that may help you group the input frames into screens.
</task>

<input>
- A list of images that depict the application's design.
- A list of input image descriptions to help you identify and reference the images, containing the image_index and description for each image.

<input-image-descriptions>
```
${input_image_descriptions}
```
</input-image-descriptions>

</input>

<output>
- A JSON list, where each object represents a distinct screen.
- Each screen object should contain:
  - screen_name: the name of the screen.
  - depicted_in_image_indices: a list of the indices of the input images that depict the screen.
  - rationale: a short description of the rationale for the grouping of the input frames into this screen.

<example-json-response> 
```
[
  {
    "screen_name": "Signup",
    "depicted_in_image_indices": [0, 1, 6],
    "rationale": "Rationale goes here"
  },
  {
    "screen_name": "Login",
    "depicted_in_image_indices": [2, 3],
    "rationale": "Rationale goes here"
  }
]
```

</example-json-response>

</output>

<key-instructions>
- Group all input frames that depict the same screen into a single screen object.
- The depicted_in_image_indices field should contain no more and no less image indices than what depict the screen. Indices begin from 0.
- The screens must be listed in **the order they first appear** in the input images.
- If the input frames clearly depict a screen name, the screen name should be this name. If not, a summary of the screen of at most 5 words should be used as the screen name.
- No input frame should be left out of any screen.
</key-instructions>

<context>
<list-of-test-cases>
${input_test_cases}
</list-of-test-cases>

<acceptance-criteria-and-instructions>
${acceptance_criteria}
</acceptance-criteria-and-instructions>
</context>
"""
