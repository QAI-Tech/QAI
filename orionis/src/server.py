import flask
import main
import logging

app = flask.Flask(__name__)


# Basic CORS support
@app.after_request
def after_request(response):
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
    response.headers.add("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS")
    return response


# List of functions to expose
functions = [
    "get_products",
    "get_organizations_for_qai_user",
    "get_test_cases_for_product",
    "get_test_cases_for_request",
    "copy_test_cases_for_product",
    "signin",
    "add_product",
    "update_product",
    "delete_product",
    "update_test_case",
    "delete_test_case",
    "add_test_case",
    "add_test_run",
    "add_test_run_from_flows",
    "get_test_runs_for_product",
    "add_new_test_cases_to_test_run",
    "update_test_case_under_execution",
    "request_smoke_test_planning",
    "request_kg_test_case_planning",
    "process_smoke_test_planning",
    "request_maintainer_agent",
    "process_maintainer_agent",
    "merge_generated_graph",
    "get_test_case_planning_requests_by_product_id",
    "get_planning_request_status",
    "user_goal_planning_handler",
    "get_features_using_product_id",
    "add_feature",
    "delete_feature",
    "get_test_cases_under_execution",
    "update_user_details",
    "add_org",
    "onboard_new_user",
    "reordering_features",
    "reordering_test_cases",
    "update_execution_data",
    "get_users_with_org_id",
    "delete_test_case_under_execution_from_test_run",
    "add_credentials_to_test_case_or_product",
    "get_credentials",
    "update_credentials",
    "delete_credentials",
    "add_jira_credentials",
    "delete_jira_credentials",
    "get_jira_credentials",
    "create_jira_tickets_for_failed_tests",
    "update_feature",
    "get_usage_data_for_organisation",
    "update_user_role",
    "delete_user",
    "send_email_invites",
    "copy_test_case_under_execution_for_product",
    "create_raw_test_case_from_kg_flow",
    "upload_file",
    "update_mirrored_test_cases",
    "send_test_run_email",
    "batched_signed_url",
    "trigger_api_request",
    "assign_tcue_to_users",
    "create_test_suite",
    "get_test_suites",
    "update_test_suite",
    "delete_test_suite",
    "save_graph",
    "title_generation_for_nodes",
    "sync_tcue_in_test_run",
    "call_llm",
    "format_edge_description",
    "add_flows_to_existing_test_run",
    "buy_qubits",
    "update_organisation",
    "stripe_webhook",
]


def create_view_func(func_name):
    # Retrieve the function from main module
    func = getattr(main, func_name, None)
    if not func:
        logging.warning(f"Function {func_name} not found in main module.")
        return None

    def view_func():
        # Call the function passing the flask request
        # The functions in main.py expect the request object as an argument
        return func(flask.request)

    # Set name to avoid flask route collision
    view_func.__name__ = func_name
    return view_func


def snake_to_pascal(snake_str):
    return "".join(x.title() for x in snake_str.split("_"))


for func_name in functions:
    view_func = create_view_func(func_name)
    if view_func:
        # Register route with support for all methods (GET, POST, etc)
        # Original snake_case route
        app.add_url_rule(
            f"/{func_name}",
            view_func=view_func,
            methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        )

        # PascalCase alias
        pascal_name = snake_to_pascal(func_name)
        if pascal_name != func_name:
            app.add_url_rule(
                f"/{pascal_name}",
                view_func=view_func,
                methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            )

signin_view = create_view_func("signin")
if signin_view:
    app.add_url_rule(
        "/SignIn",
        view_func=signin_view,
        endpoint="signin_pascal_alias",
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    )


@app.route("/", methods=["GET"])
def index():
    # Return a simple HTML list of links to valid endpoints (GET only for convenience)
    links = [
        f'<li><a href="/{f}">{f}</a></li>' for f in functions if getattr(main, f, None)
    ]
    return (
        f"<h1>Server Running</h1><p>Available endpoints:</p><ul>{''.join(links)}</ul>"
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
