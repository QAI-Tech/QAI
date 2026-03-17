import flask
from flask import send_from_directory, request
from flask_swagger_ui import get_swaggerui_blueprint

from main import (
    get_products,
    get_test_cases_for_product,
    signin,
    add_product,
    update_test_case,
)

app = flask.Flask(__name__)


@app.route("/static/<path:path>")
def send_static(path):
    return send_from_directory("static", path)


SWAGGER_URL = "/swagger"
API_URL = "/static/swagger.json"

swaggerui_blueprint = get_swaggerui_blueprint(
    SWAGGER_URL, API_URL, config={"app_name": "QAI Swagger API"}
)


@app.route("/proxy/get_products", methods=["POST"])
@app.route("/proxy/get_test_cases_for_product", methods=["GET"])
@app.route("/proxy/signin", methods=["GET"])
@app.route("/proxy/add_product", methods=["POST"])
@app.route("/proxy/update_test_case", methods=["POST"])
def proxy_request():
    route_function_map = {
        "/proxy/get_products": get_products,
        "/get_test_cases_for_product": get_test_cases_for_product,
        "/signin": signin,
        "/add_product": add_product,
        "/update_test_case": update_test_case,
    }

    func = route_function_map.get(request.path)
    if func:
        return func(request)  # Call the appropriate function
    else:
        return ({"error": "Invalid route"},)


app.register_blueprint(swaggerui_blueprint, url_prefix=SWAGGER_URL)

if __name__ == "__main__":
    app.run(debug=True)
