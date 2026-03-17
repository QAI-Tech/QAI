# Orionis - QAI backend engine

## Setup

- **gcloud cli**:Set-up gcloud cli in your PC, by following this link

  [gcloud-doc](https://cloud.google.com/sdk/docs/install-sdk)

- **ADC**:Set up ADC(Application default credentials of gcloud) for a local development environment , by following this link

  [ADC-gcloud-doc](https://cloud.google.com/docs/authentication/set-up-adc-local-dev-environment)

- **Python3**: Ensure that you have Python 3 installed on your system. You can download and install Python 3 from the official Python website: https://www.python.org.
- **pip**: pip is the package installer for Python. It is usually installed by default when you install Python. However, make sure you have pip installed and it is up to date. You can check the version of pip by running the following command:

  ```
  pip --version
  ```

- **Libraries**: You can install all the required libraries by running the command below after cloning the repository.

  ```
  pip install -r src/requirements.txt
  ```

  It is recommended to use a virtual environment to avoid dependency conflicts. Follow this link to set up a virtual environment: https://docs.python.org/3/library/venv.html

  It is also recommended to use this naming convention **.venv** for virtual environments.

  Be sure to add any new dependencies or libraries to the requirements.txt file.

## Building new features

To build a new feature, follow these steps:

1. Decide which service the new feature belongs. For example, `products`. If there is already a directory for that service, use that. If not, create a new directory for that service.
2. main.py should contain the entry point function for your API. This function should not contain any business logic, it should only delegate the request to the appropriate service method, and return the response from the service method to the client.
3. Start by defining the data models for your request, business logic, and response in the xx_models.py file. Reuse existing data models if possible.
4. The service method should be in the xx_service.py file. The method should have the following signature: `def method_name(self, request: ApiRequestEntity) -> ApiResponseEntity:`.
5. The service should recieve its dependencies (validators, datastores, other services etc) as constructor parameters, so that it can be easily mocked in unit tests.
6. The service method should typically validate the request first. The validation logic should be in a function in the xx_request_validator.py file. The validator typically takes the request json, and returns an instance of the appropriate (immutable) data model.
7. The database logic should be in the xx_datastore.py file in an appropriate method.
8. The service method should interact only via the datastore, and never directly with cloud provider dependencies.
9. The service method should return a response to the client. The response should be in the ApiResponseEntity format.
10. All logic should typically fail early by throwing appropriate exceptions early.
11. After creating any new APIs please add the APIs to `deploy_staging.sh` and `deploy_production.sh` so that the APIs are deployed.

`products` is a good example of how to implement a new feature, it contains product_request_validator.py, product_service.py, product_datastore.py, product_models.py, and the entry points in main.py.

## Verifying feature behaviour with unit tests

1. We use pytest for unit testing.
2. At least the following unit tests shouild be created for every feature: validate the request, validate the response, validate the datastore interaction.
3. The unit test file should be in the tests/xx/ directory, named like the service method, but with the prefix `test_`. E.g. `test_product_request_validator.py` contains tests for the `product_request_validator` class.
4. Each unit test should be test for an individual piece of behaviour of the method, and should be named like `test_<behaviour_name>`. E.g. `test_request_without_product_name_raises_error`.
5. The `setup_method` runs before every test execution. Typically, a fresh instance of the class you are testing and its dependencies should be created here. This way, we avoid side effects from stale states from previously executed tests.
6. Optionally, the `teardown_method` runs after every test execution. Typically, the instance of the class you are testing and its dependencies should be destroyed here. This way, we avoid side effects from stale states for future tests.
7. Each test typically uses the Arrange, Act, Assert pattern.
8. Arrange: create the objects you need for the test, as well as any other dependency mocking.
9. Act: execute the method you are testing.
10. Assert: verify the results of the method you are testing. Verify that the dependencies are interacted with as expected, or not interacted with at all. Also verify that the exceptions are thrown as expected.

## Running unit tests

To run the unit tests, use the following command:
(From the root directory)

```
pytest tests/ -v
```

## Running formatting and lint checks locally

To run the formatting checks, use the following command:
(from orionis/src directory)

```
black --check .
```

For formatting the code, use the following command:
(from orionis/src directory)

```
black .
```

To run the lint checks, use the following command:
(from orionis/src directory)

```
flake8 .
```

To run the type checks, use the following command:
(from orionis/src directory)

```
mypy --config-file ../mypy.ini .
```

## Starting the Server (Development Mode)

To start the Orionis server in development mode, follow these steps:

TODO: Add venv setup

Every time you start your venv, you need to export your env vars.

- Add the `gcp-service-account.json` file to the root directory.
- Navigate to the `src/` directory of the project.
- Use the following command to start the development server:

```
functions-framework --target FUNCTION_NAME_IN_MAIN.PY --port PORT_NUMBER --debug
```

Replace FUNCTION_NAME with your respective function name from the main.py file. E.g:

```
functions-framework --target process_smoke_test_planning --port 8081 --debug
```

## Getting the auth_token

- ONLY FOR LOCAL DEVELOPMENT & DEBUGGING: Use the token "debug_token:user_id" to bypass the token validation and get the user_id.

To get the auth_token run the nebula/QAI and follow these steps:

- Run this command "**await Clerk.session.getToken()**" in the console of inspect mode.
- Copy the Clerk session token that's been generated.
- Then hit the "**signin**" cloud function to get the auth_token as specified in this cURL command

```
curl -X GET \
 <function_url> \
 -H 'Authorization: Bearer <CLERK_SESSION_TOKEN>'
```

For example, here is how you would call the above function that you deployed locally, via curl with a debug auth token:

```
curl -X POST \
  http://localhost:8081/api/process_smoke_test_planning \
   -H 'Authorization: debug_token:YOUR_QAI_USER_ID' \
   -H 'Content-Type: application/json' \
   -d '{"request_id": "<REQUEST_ID>"}'
```

Production Deployment steps:

Make sure you're on main branch with the latest pull

1. Set the gcloud cli to the production project [Run: gcloud config set project qai-tech]
2. Create a tag locally using the command `git tag -a v.* -m "Commit message"`
3. Then push that tag using this command `git push origin tag_name` which triggers the deploy_prod.yml

To revert the deployment follow these steps

# 1. Delete the tag locally

git tag -d v\*

# 2. Recreate the tag on the previous commit

git tag v\* <old_commit_sha>

# 3. Force-push the tag to GitHub to re-trigger the deploy workflow

git push --force origin v\*
