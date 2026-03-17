from pydantic import ValidationError
from organisations.org_models import (
    BuyQubitsRequestParams,
    UpdateOrganisationRequestParams,
)
from gateway.gateway_models import ApiRequestEntity


class OrgRequestValidator:
    def validate_buy_qubits_request(
        self, request: ApiRequestEntity
    ) -> BuyQubitsRequestParams:
        try:
            buy_qubits_request = BuyQubitsRequestParams(**request.data)

        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid buy qubits request: {str(e)}")

        if not (buy_qubits_request.organisation_id and buy_qubits_request.qubit_amount):
            raise ValueError("organisation_id and qubit_amount are required")

        return buy_qubits_request

    def validate_update_organisation_request(
        self, request: ApiRequestEntity
    ) -> UpdateOrganisationRequestParams:
        try:
            update_org_request = UpdateOrganisationRequestParams(**request.data)

        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid update organisation request: {str(e)}")

        if not update_org_request.organisation_id:
            raise ValueError("organisation_id is required")

        if update_org_request.auto_reload_enabled:
            if (
                update_org_request.auto_reload_threshold is None
                or update_org_request.auto_reload_amount is None
            ):
                raise ValueError(
                    "auto_reload_threshold and auto_reload_amount are required when auto_reload_enabled is true"
                )

            if update_org_request.auto_reload_threshold <= 5:
                raise ValueError("auto_reload_threshold must be greater than 5")

            if update_org_request.auto_reload_amount <= 100:
                raise ValueError("auto_reload_amount must be greater than 100")

        return update_org_request
