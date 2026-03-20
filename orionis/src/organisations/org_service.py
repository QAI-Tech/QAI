from gateway.gateway_models import ApiRequestEntity, ApiResponseEntity
from organisations.org_datastore import OrganisationDatastore
from organisations.org_models import Organisation
from organisations.org_request_validator import OrgRequestValidator
from utils.util import orionis_log
from config import config
import stripe  # type: ignore
from purchases.purchase_datastore import PurchaseDatastore

stripe.api_key = config.stripe_secret_key


class OrganisationService:
    def __init__(self, datastore: OrganisationDatastore):
        self.datastore = datastore
        self.request_validator = OrgRequestValidator()
        self.purchase_datastore = PurchaseDatastore()

    def add_organisation(
        self, request: ApiRequestEntity, user_id: str
    ) -> ApiResponseEntity:
        """Service function to handle organisation creation."""
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:

            organisation_name = request.data.get("organisation_name")

            if not organisation_name:
                raise ValueError("Organisation name is required")

            orionis_log(f"Creating organisation for {organisation_name}")

            organisation: Organisation = self.datastore.add_organisation(
                organisation_name, user_id
            )

            orionis_log(
                f"Added organisation {organisation.organisation_id} successfully"
            )

            return ApiResponseEntity(
                response=organisation.model_dump(),
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in add_organisation: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in add_organisation: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def get_all_organisations(
        self, user_id: str, organisation_id: str
    ) -> ApiResponseEntity:
        """Service function to get all organisations."""
        try:
            organisations = self.datastore.get_all_organisations()

            response_orgs = [
                {
                    "organization_id": org.organisation_id,
                    "organization_name": org.organisation_name,
                }
                for org in organisations
            ]

            return ApiResponseEntity(
                response={"organizations": response_orgs},
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"Value error in get_all_organisations: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in get_all_organisations: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def buy_qubits(self, request: ApiRequestEntity) -> ApiResponseEntity:
        """Create a Stripe Payment Intent for buying qubits."""
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            validated_request = self.request_validator.validate_buy_qubits_request(
                request
            )

            # Fixed price: 1 euro per qubit
            amount_cents = validated_request.qubit_amount * 100

            organisation = self.datastore.get_organisation(
                validated_request.organisation_id
            )

            if not organisation.stripe_customer_id:

                customer = stripe.Customer.create(
                    metadata={
                        "organisation_id": validated_request.organisation_id,
                        "organisation_name": organisation.organisation_name,
                    }
                )

                self.datastore.update_stripe_customer_id(
                    validated_request.organisation_id, customer.id
                )
                stripe_customer_id = customer.id
                orionis_log(
                    f"Created Stripe customer {customer.id} for organisation {validated_request.organisation_id}"
                )
            else:
                stripe_customer_id = organisation.stripe_customer_id

            payment_intent = stripe.PaymentIntent.create(
                amount=amount_cents,
                currency="eur",
                customer=stripe_customer_id,
                metadata={
                    "organisation_id": validated_request.organisation_id,
                    "qubit_amount": str(validated_request.qubit_amount),
                },
            )

            orionis_log(
                f"Created payment intent {payment_intent.id} for organisation {validated_request.organisation_id}: "
                f"{validated_request.qubit_amount} qubits (€{amount_cents/100:.2f})"
            )

            return ApiResponseEntity(
                response={
                    "client_secret": payment_intent.client_secret,
                    "payment_intent_id": payment_intent.id,
                    "amount_cents": amount_cents,
                    "qubit_amount": validated_request.qubit_amount,
                },
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"ValueError in buy_qubits: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in buy_qubits: {e}", e)
            return ApiResponseEntity(
                response={"error": "Internal server error"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def process_stripe_webhook(
        self, payload: bytes, sig_header: str
    ) -> ApiResponseEntity:
        """Process Stripe webhook event and add qubits on successful payment."""
        try:
            if not config.stripe_webhook_secret:
                orionis_log("Stripe webhook secret not configured")
                return ApiResponseEntity(
                    response={"error": "Webhook not configured"},
                    status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
                )

            # Verify webhook signature
            try:
                event = stripe.Webhook.construct_event(
                    payload,
                    sig_header,
                    config.stripe_webhook_secret,
                )
            except ValueError as e:
                orionis_log("Invalid payload in Stripe webhook", e)
                return ApiResponseEntity(
                    response={"error": "Invalid payload"},
                    status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
                )
            except stripe.error.SignatureVerificationError as e:
                orionis_log("Invalid signature in Stripe webhook", e)
                return ApiResponseEntity(
                    response={"error": "Invalid signature"},
                    status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
                )

            if event["type"] == "payment_intent.succeeded":
                payment_intent = event["data"]["object"]
                organisation_id = payment_intent.get("metadata", {}).get(
                    "organisation_id"
                )
                qubit_amount_str = payment_intent.get("metadata", {}).get(
                    "qubit_amount"
                )

                if not organisation_id or not qubit_amount_str:
                    error_msg = (
                        f"Missing metadata in payment intent {payment_intent.get('id')}"
                    )
                    orionis_log(error_msg, ValueError(error_msg))
                    return ApiResponseEntity(
                        response={"error": "Missing metadata"},
                        status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
                    )

                try:
                    qubit_amount = int(qubit_amount_str)
                    amount_cents = payment_intent.get("amount", 0)
                    is_auto_reload_str = payment_intent.get("metadata", {}).get(
                        "is_auto_reload", "false"
                    )
                    is_auto_reload = is_auto_reload_str.lower() == "true"

                    new_balance = self.datastore.add_qubits(
                        organisation_id, qubit_amount
                    )

                    self.purchase_datastore.add_purchase(
                        organisation_id=organisation_id,
                        qubit_amount=qubit_amount,
                        amount_cents=amount_cents,
                        is_auto_reload=is_auto_reload,
                    )

                    orionis_log(
                        f"Payment succeeded: Added {qubit_amount} qubits to organisation "
                        f"{organisation_id}. New balance: {new_balance}"
                    )
                except ValueError as e:
                    orionis_log(f"Error processing qubit amount: {e}", e)
                    return ApiResponseEntity(
                        response={"error": "Invalid qubit amount"},
                        status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
                    )
                except Exception as e:
                    orionis_log(f"Error adding qubits: {e}", e)
                    return ApiResponseEntity(
                        response={"error": "Failed to add qubits"},
                        status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
                    )
            else:
                orionis_log(f"Unhandled Stripe event type: {event['type']}")
                return ApiResponseEntity(
                    response={
                        "error": "Unhandled Stripe event type",
                        "event": event,
                    },
                    status_code=ApiResponseEntity.HTTP_STATUS_OK,
                )

            return ApiResponseEntity(
                response={"status": "success"},
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except Exception as e:
            orionis_log(f"Exception in process_stripe_webhook: {e}", e)
            return ApiResponseEntity(
                response={"error": "Internal server error"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )

    def update_organisation(self, request: ApiRequestEntity) -> ApiResponseEntity:
        if request.method != ApiRequestEntity.API_METHOD_POST:
            return ApiResponseEntity(
                response={"error": "Method must be POST"},
                status_code=ApiResponseEntity.HTTP_STATUS_METHOD_NOT_ALLOWED,
            )

        try:
            validated_request = (
                self.request_validator.validate_update_organisation_request(request)
            )

            updated_organisation = self.datastore.update_organisation(validated_request)

            orionis_log(f"Updated organisation {validated_request.organisation_id}")

            return ApiResponseEntity(
                response=updated_organisation.model_dump(),
                status_code=ApiResponseEntity.HTTP_STATUS_OK,
            )

        except ValueError as e:
            orionis_log(f"ValueError in update_organisation: {e}", e)
            return ApiResponseEntity(
                response={"error": str(e)},
                status_code=ApiResponseEntity.HTTP_STATUS_BAD_REQUEST,
            )
        except Exception as e:
            orionis_log(f"Exception in update_organisation: {e}", e)
            return ApiResponseEntity(
                response={"error": "Internal server error"},
                status_code=ApiResponseEntity.HTTP_STATUS_INTERNAL_SERVER_ERROR,
            )
