#!/bin/bash


if [[ -z "$ENVIRONMENT" || -z "$GCP_PROJECT_ID_STAGING" ]]; then
    echo "Error: ENVIRONMENT or GCP_PROJECT_ID_STAGING is not set as an environment variable"
    exit 1
fi

REGION="europe-west3"

echo "Deploying to project: $GCP_PROJECT_ID_STAGING"

echo "Setting up staging environment variables..."
ENV_VARS="ENVIRONMENT=staging,\
PATH_TO_GCP_CREDS_STAGING=./gcp-service-account.json,\
REMOVED=${REMOVED},\
CLERK_JWKS_URL_STAGING=${CLERK_JWKS_URL_STAGING},\
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_STAGING=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_STAGING},\
CLERK_SECRET_KEY_STAGING=${CLERK_SECRET_KEY_STAGING},\
HMAC_SECRET_KEY_STAGING=${HMAC_SECRET_KEY_STAGING},\
GCP_PROJECT_ID_STAGING=qai-tech-staging,\
NOTIFICATION_WEBHOOK_URL=${NOTIFICATION_WEBHOOK_URL},\
TEST_RUN_UPDATE_WEBHOOK_URL=${TEST_RUN_UPDATE_WEBHOOK_URL},\
CUSTOMER_COMMENTS_WEBHOOK_URL=${CUSTOMER_COMMENTS_WEBHOOK_URL},\
ENABLE_SHARDING_FOR_KG_FLOW_ANALYZER=true,\
TCS_FROM_FLOW_TIMEOUT_MINS=7,\
SENTRY_DSN_URL=${SENTRY_DSN_URL},\
MIXPANEL_TOKEN_STAGING=${MIXPANEL_TOKEN_STAGING},\
JIRA_ENCRYPTION_KEY=${JIRA_ENCRYPTION_KEY}"

echo "Creating/Updating Datastore indexes..."

gcloud datastore indexes cleanup ./src/index.yaml --project=$GCP_PROJECT_ID_STAGING

gcloud datastore indexes create ./src/index.yaml --project=$GCP_PROJECT_ID_STAGING

echo "Deploying Cloud Functions..."

deploy_function() {
    local name=$1
    local entry_point=$2
    local memory=${3:-"1GB"} 
    local timeout=${4:-"60s"}
    local concurrency=${5:-"1"}
    
    echo "Deploying $name..."
    gcloud functions deploy $name \
        --entry-point $entry_point \
        --runtime python312 \
        --memory $memory \
        --trigger-http \
        --allow-unauthenticated \
        --source ./src \
        --region $REGION \
        --min-instances 1 \
        --set-env-vars $ENV_VARS \
       --set-secrets PATH_TO_GMAIL_CREDS_STAGING=gmail-service-account:latest \
        --timeout $timeout \
        --concurrency $concurrency \
        --project=$GCP_PROJECT_ID_STAGING
}

# deploy_function "AddTestRunFromFlows" "add_test_run_from_flows"

# deploy_function "SignIn" "signin"
# deploy_function "UpdateUserDetails" "update_user_details"
# deploy_function "AddOrg" "add_org"
# deploy_function "OnboardNewUser" "onboard_new_user"
# deploy_function "GetUsersWithOrgId" "get_users_with_org_id"

# deploy_function "RequestSmokeTestPlanning" "request_smoke_test_planning"
# deploy_function "ProcessSmokeTestPlanning" "process_smoke_test_planning" "1GB" "1800s"
#deploy_function "UserGoalPlanningHandler" "user_goal_planning_handler"  "1GB" "1800s" "1"
# deploy_function "RequestKgTestCasePlanning" "request_kg_test_case_planning" "1GB" "1800s" "1"

# deploy_function "GetTestCasesForProduct" "get_test_cases_for_product"
# deploy_function "UpdateTestCase" "update_test_case"
# deploy_function "DeleteTestCase" "delete_test_case"
# deploy_function "AddTestCase" "add_test_case"
# deploy_function "UpdateTestCaseUnderExecution" "update_test_case_under_execution"
# deploy_function "GetTestCasesUnderExecution" "get_test_cases_under_execution"
# deploy_function "UpdateExecutionData" "update_execution_data"

# deploy_function "AddTestRun" "add_test_run"
# deploy_function "GetTestRunsForProduct" "get_test_runs_for_product"
# deploy_function "AddNewTestCasesToTestRun" "add_new_test_cases_to_test_run"


# deploy_function "GetProducts" "get_products"
# deploy_function "AddProduct" "add_product"
# deploy_function "GetFeaturesUsingProductID" "get_features_using_product_id"

# deploy_function "AddFeature" "add_feature"
# deploy_function "DeleteFeature" "delete_feature"
# deploy_function "UpdateFeature" "update_feature"

# deploy_function "ExportTestcasesToExcel" "export_test_cases_to_xlsx"


# deploy_function "ReorderFeatures" "reordering_features"
# deploy_function "ReorderTestCases" "reordering_test_cases"

# deploy_function "DeleteTestCaseUnderExecutionFromTestRun" "delete_test_case_under_execution_from_test_run"

# deploy_function "AddCredentialsToTestCaseOrProduct" "add_credentials_to_test_case_or_product"
# deploy_function "GetCredentials" "get_credentials"
# deploy_function "UpdateCredentials" "update_credentials"
# deploy_function "DeleteCredentials" "delete_credentials"

# deploy_function "CopyTestCasesForProduct" "copy_test_cases_for_product"

# deploy_function "GetUsageDataForProduct" "get_usage_data_for_product"

# deploy_function "UpdateUserRole" "update_user_role"

# deploy_function "DeleteUser" "delete_user"

deploy_function "CreateRawTestCaseFromKgFlow" "create_raw_test_case_from_kg_flow" "8GB" "3600s" "1"

# deploy_function "CreateTestSuite" "create_test_suite"
# deploy_function "GetTestSuites" "get_test_suites"

echo "Deployment completed successfully!"



