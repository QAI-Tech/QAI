from typing import Any
from pydantic import ValidationError

from gateway.gateway_models import ApiRequestEntity
from users.user_models import (
    UpdateUserRequestParams,
    RoleManagementRequestParams,
    SendInviteRequestParams,
)


class UserRequestValidator:
    def validate_update_user_request(
        self, request_object: Any
    ) -> UpdateUserRequestParams:
        try:
            user_params = UpdateUserRequestParams(**request_object)
        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid user update request: {str(e)}")

        if not any(
            [
                user_params.organisation_id,
                user_params.first_name,
                user_params.last_name,
                user_params.email,
                user_params.roles,
            ]
        ):
            raise ValueError("At least one field must be provided for update")

        return user_params

    def validate_role_management_request(
        self, request_object: ApiRequestEntity
    ) -> RoleManagementRequestParams:
        try:
            user_params = RoleManagementRequestParams(**request_object.data)
            if not user_params.user_id or not user_params.roles:
                raise ValueError("User ID and roles are required")

            if any(not role.strip() for role in user_params.roles):
                raise ValueError("Roles cannot be empty strings")

        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid role management request: {str(e)}")

        return user_params

    def validate_send_invite_request(
        self, request_object: ApiRequestEntity
    ) -> SendInviteRequestParams:
        try:
            user_params = SendInviteRequestParams(**request_object.data)
            if not user_params.invites:
                raise ValueError("Invites are required")

            for invite in user_params.invites:
                if not invite.email or not invite.role:
                    raise ValueError("Email and role are required")
                if not invite.email.strip() or not invite.role.strip():
                    raise ValueError("Email and role cannot be empty strings")

        except (ValidationError, TypeError) as e:
            raise ValueError(f"Invalid send invite request: {str(e)}")

        return user_params
