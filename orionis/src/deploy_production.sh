#!/bin/bash


if [[ -z "$ENVIRONMENT" || -z "$GCP_PROJECT_ID_PRODUCTION" ]]; then
    echo "Error: ENVIRONMENT or GCP_PROJECT_ID_PRODUCTION is not set as an environment variable"
    exit 1
fi

REGION="europe-west3"

echo "Deploying to project: $GCP_PROJECT_ID_PRODUCTION"

echo "Setting up production environment variables..."
ENV_VARS="ENVIRONMENT=$ENVIRONMENT,\
PATH_TO_GCP_CREDS_PRODUCTION=$PATH_TO_GCP_CREDS_PRODUCTION,\
GEMINI_API_KEY_PRODUCTION=$GEMINI_API_KEY_PRODUCTION,\
CLERK_JWKS_URL_PRODUCTION=$CLERK_JWKS_URL_PRODUCTION,\
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_PRODUCTION=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_PRODUCTION,\
CLERK_SECRET_KEY_PRODUCTION=$CLERK_SECRET_KEY_PRODUCTION,\
HMAC_SECRET_KEY_PRODUCTION=$HMAC_SECRET_KEY_PRODUCTION,\
GCP_PROJECT_ID_PRODUCTION=$GCP_PROJECT_ID_PRODUCTION,\
NOTIFICATION_WEBHOOK_URL=$NOTIFICATION_WEBHOOK_URL,\
TEST_RUN_UPDATE_WEBHOOK_URL=$TEST_RUN_UPDATE_WEBHOOK_URL,\
CUSTOMER_COMMENTS_WEBHOOK_URL=$CUSTOMER_COMMENTS_WEBHOOK_URL,\
SENTRY_DSN_URL=$SENTRY_DSN_URL,\
ENABLE_SHARDING_FOR_KG_FLOW_ANALYZER=$ENABLE_SHARDING_FOR_KG_FLOW_ANALYZER,\
TCS_FROM_FLOW_TIMEOUT_MINS=$TCS_FROM_FLOW_TIMEOUT_MINS,\
ENABLE_NEW_VIDEO_TO_FLOW=$ENABLE_NEW_VIDEO_TO_FLOW,\
MIXPANEL_TOKEN_PROD=$MIXPANEL_TOKEN_PROD,\
JIRA_ENCRYPTION_KEY=$JIRA_ENCRYPTION_KEY,\
STRIPE_SECRET_KEY_PRODUCTION=$STRIPE_SECRET_KEY_PRODUCTION,\
STRIPE_WEBHOOK_SECRET_PRODUCTION=$STRIPE_WEBHOOK_SECRET_PRODUCTION"

echo "Creating/Updating Datastore indexes..."

gcloud datastore indexes cleanup ./src/index.yaml --project=$GCP_PROJECT_ID_PRODUCTION

gcloud datastore indexes create ./src/index.yaml --project=$GCP_PROJECT_ID_PRODUCTION

echo "Deploying Cloud Functions..."

deploy_function() {
    local name=$1
    local entry_point=$2
    local memory=${3:-"2GB"} 
    local timeout=${4:-"60s"}
    local min_instances=${5:-"1"}
    
    echo "Deploying $name..."
    gcloud functions deploy $name \
        --entry-point $entry_point \
        --runtime python312 \
        --memory $memory \
        --trigger-http \
        --allow-unauthenticated \
        --source ./src \
        --region $REGION \
        --min-instances $min_instances \
        --set-env-vars "$ENV_VARS" \
        --set-secrets PATH_TO_GMAIL_CREDS_PRODUCTION=gmail-service-account:latest \
        --timeout $timeout \
        --project=$GCP_PROJECT_ID_PRODUCTION
}


deploy_function "SignIn" "signin"
deploy_function "OnboardNewUser" "onboard_new_user"
deploy_function "GetUsersWithOrgId" "get_users_with_org_id"
deploy_function "DeleteUser" "delete_user"
deploy_function "SendEmailInvites" "send_email_invites" "2GB" "60s" "0"
deploy_function "SendTestRunEmail" "send_test_run_email" "2GB" "60s" "0"

deploy_function "RequestMaintainerAgent" "request_maintainer_agent"
deploy_function "ProcessMaintainerAgent" "process_maintainer_agent" "8GB" "3600s" "0"
deploy_function "GetPlanningRequestStatus" "get_planning_request_status" 

deploy_function "UserGoalPlanningHandler" "user_goal_planning_handler"  "1GB" "1800s" "0"

deploy_function "GetTestCasesForProduct" "get_test_cases_for_product" "1GB" "60s" "0"
deploy_function "UpdateTestCase" "update_test_case" "1GB" "60s" "0"
deploy_function "DeleteTestCase" "delete_test_case" "1GB" "60s" "0"
deploy_function "AddTestCase" "add_test_case" "1GB" "60s" "0"
deploy_function "UpdateTestCaseUnderExecution" "update_test_case_under_execution"
deploy_function "GetTestCasesUnderExecution" "get_test_cases_under_execution" 
deploy_function "UpdateExecutionData" "update_execution_data" "2GB" "60s" "0"
deploy_function "SyncTcueInTestRun" "sync_tcue_in_test_run" "2GB" "1800s" "0"

deploy_function "AddTestRun" "add_test_run" "1GB" "60s" "0"
deploy_function "GetTestRunsForProduct" "get_test_runs_for_product"
deploy_function "AssignTcueToUsers" "assign_tcue_to_users"
deploy_function "AddTestRunFromFlows" "add_test_run_from_flows" "8GB" "1800s"
deploy_function "AddFlowsToExistingTestRun" "add_flows_to_existing_test_run"

deploy_function "GetProducts" "get_products"
deploy_function "AddProduct" "add_product"
deploy_function "UpdateProduct" "update_product"
deploy_function "DeleteProduct" "delete_product"
deploy_function "GetFeaturesUsingProductID" "get_features_using_product_id" "2GB" "60s" "0"


deploy_function "ReorderTestCases" "reordering_test_cases" "1GB" "60s" "0"

deploy_function "DeleteTestCaseUnderExecutionFromTestRun" "delete_test_case_under_execution_from_test_run"

deploy_function "AddCredentialsToTestCaseOrProduct" "add_credentials_to_test_case_or_product"
deploy_function "GetCredentials" "get_credentials"
deploy_function "UpdateCredentials" "update_credentials"
deploy_function "DeleteCredentials" "delete_credentials"

deploy_function "AddJiraCredentials" "add_jira_credentials"
deploy_function "DeleteJiraCredentials" "delete_jira_credentials"
deploy_function "GetJiraCredentials" "get_jira_credentials"
deploy_function "CreateJiraTicketsForFailedTests" "create_jira_tickets_for_failed_tests"

deploy_function "CopyTestCaseUnderExecutionForProduct" "copy_test_case_under_execution_for_product"

deploy_function "GetUsageDataForOrganisation" "get_usage_data_for_organisation"

deploy_function "UpdateUserRole" "update_user_role"

deploy_function "CreateRawTestCaseFromKgFlow" "create_raw_test_case_from_kg_flow" "8GB" "3600s" "0"
deploy_function "RequestKgTestCasePlanning" "request_kg_test_case_planning"

deploy_function "CreateTestSuite" "create_test_suite"
deploy_function "GetTestSuites" "get_test_suites"
deploy_function "UpdateTestSuite" "update_test_suite"
deploy_function "DeleteTestSuite" "delete_test_suite"

deploy_function "TitleGenerationForNodes" "title_generation_for_nodes"
deploy_function "CallLLM" "call_llm"
deploy_function "FormatEdgeDescription" "format_edge_description"
deploy_function "MergeGeneratedGraph" "merge_generated_graph" "8GB" "60s" 
deploy_function "GetTestCasePlanningRequestsByProductId" "get_test_case_planning_requests_by_product_id"
deploy_function "GetOrganizationsForQaiUser" "get_organizations_for_qai_user"

deploy_function "BuyQubits" "buy_qubits"
deploy_function "StripeWebhook" "stripe_webhook"

echo "Deployment completed successfully!"
