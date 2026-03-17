from datetime import datetime, timezone
from common.google_cloud_wrappers import GCPDatastoreWrapper
from users.user_models import RoleManagementRequestParams, UpdateUserRequestParams, User
from utils.util import orionis_log


class UserDatastore:

    ENTITY_KIND_USER = "User"
    FIELD_ORGANISATION_ID = "organisation_id"
    FIELD_UPDATED_AT = "updated_at"
    FIELD_AUTH_PROVIDER_USER_ID = "auth_provider_user_id"
    FIELD_AUTH_PROVIDER = "auth_provider"
    FIELD_FIRST_NAME = "first_name"
    FIELD_LAST_NAME = "last_name"
    FIELD_EMAIL = "email"
    FIELD_ROLES = "roles"
    FIELD_CREATED_AT = "created_at"
    FIELD_ORGANISATION_IDS = "organisation_ids"

    def __init__(self):
        self.db = GCPDatastoreWrapper().get_datastore_client()

    def update_user_fields(
        self, user_id: str, update_fields: UpdateUserRequestParams
    ) -> User:
        key = self.db.key(UserDatastore.ENTITY_KIND_USER, int(user_id))
        entity = self.db.get(key)

        if not entity:
            raise ValueError(f"User with id {user_id} not found")

        update_fields_dict = {
            k: v for k, v in update_fields.model_dump().items() if v is not None
        }

        new_organisation_id = update_fields_dict.get(
            UserDatastore.FIELD_ORGANISATION_ID, ""
        )
        orionis_log(f"Update fields dict: {update_fields_dict}")
        if new_organisation_id:
            existing_orgs = entity.get(UserDatastore.FIELD_ORGANISATION_IDS, [])
            if new_organisation_id not in existing_orgs:
                existing_orgs.append(new_organisation_id)
            update_fields_dict[UserDatastore.FIELD_ORGANISATION_IDS] = existing_orgs

        entity.update(update_fields_dict)
        orionis_log(f"Entity after update: {entity}")
        entity[UserDatastore.FIELD_UPDATED_AT] = datetime.now(timezone.utc)
        self.db.put(entity)

        orionis_log(f"Successfully updated organisation_id for user {user_id}")
        orionis_log(f"Entity: {entity}")
        return User(
            user_id=str(entity.key.id),
            auth_provider_user_id=entity.get(
                UserDatastore.FIELD_AUTH_PROVIDER_USER_ID, ""
            ),
            auth_provider=entity.get(UserDatastore.FIELD_AUTH_PROVIDER, ""),
            organisation_id=entity.get(UserDatastore.FIELD_ORGANISATION_ID, ""),
            organisation_ids=entity.get(UserDatastore.FIELD_ORGANISATION_IDS, []),
            first_name=entity.get(UserDatastore.FIELD_FIRST_NAME, ""),
            last_name=entity.get(UserDatastore.FIELD_LAST_NAME, None),
            email=entity.get(UserDatastore.FIELD_EMAIL, ""),
            roles=entity.get(UserDatastore.FIELD_ROLES, []),
            created_at=entity.get(
                UserDatastore.FIELD_CREATED_AT, datetime.now(timezone.utc)
            ),
        )

    def get_users_with_organisation_id(self, organisation_id: str) -> list[User]:
        query = self.db.query(kind=UserDatastore.ENTITY_KIND_USER)
        query.add_filter(UserDatastore.FIELD_ORGANISATION_ID, "=", organisation_id)
        query.order = [UserDatastore.FIELD_CREATED_AT]

        users: list[User] = []
        for entity in query.fetch():
            users.append(
                User(
                    user_id=str(entity.key.id),
                    auth_provider_user_id=entity.get(
                        UserDatastore.FIELD_AUTH_PROVIDER_USER_ID
                    ),
                    auth_provider=entity.get(UserDatastore.FIELD_AUTH_PROVIDER),
                    organisation_id=entity.get(UserDatastore.FIELD_ORGANISATION_ID),
                    organisation_ids=entity.get(
                        UserDatastore.FIELD_ORGANISATION_IDS, []
                    ),
                    first_name=entity.get(UserDatastore.FIELD_FIRST_NAME),
                    last_name=entity.get(UserDatastore.FIELD_LAST_NAME),
                    email=entity.get(UserDatastore.FIELD_EMAIL),
                    roles=entity.get(UserDatastore.FIELD_ROLES, []),
                    created_at=entity.get(UserDatastore.FIELD_CREATED_AT),
                )
            )

        orionis_log(
            f"Fetched {len(users)} users for organisation_id: {organisation_id}"
        )
        return users

    def update_user_roles(
        self, role_management_params: RoleManagementRequestParams
    ) -> User:
        key = self.db.key(
            UserDatastore.ENTITY_KIND_USER, int(role_management_params.user_id)
        )
        entity = self.db.get(key)

        if not entity:
            raise ValueError(f"User with id {role_management_params.user_id} not found")

        existing_roles = entity.get(UserDatastore.FIELD_ROLES, [])

        new_roles = list(set(existing_roles + role_management_params.roles))

        if set(new_roles) != set(existing_roles):
            entity[UserDatastore.FIELD_ROLES] = role_management_params.roles
            entity[UserDatastore.FIELD_UPDATED_AT] = datetime.now(timezone.utc)
            self.db.put(entity)

            orionis_log(
                f"Successfully updated roles for user {role_management_params.user_id}"
            )
            orionis_log(f"Entity after update: {entity}")
        else:
            orionis_log(
                f"No changes to roles for user {role_management_params.user_id}"
            )

        return User(
            user_id=str(entity.key.id),
            auth_provider_user_id=entity.get(
                UserDatastore.FIELD_AUTH_PROVIDER_USER_ID, ""
            ),
            auth_provider=entity.get(UserDatastore.FIELD_AUTH_PROVIDER, ""),
            organisation_id=entity.get(UserDatastore.FIELD_ORGANISATION_ID, ""),
            organisation_ids=entity.get(UserDatastore.FIELD_ORGANISATION_IDS, []),
            first_name=entity.get(UserDatastore.FIELD_FIRST_NAME, ""),
            last_name=entity.get(UserDatastore.FIELD_LAST_NAME, None),
            email=entity.get(UserDatastore.FIELD_EMAIL, ""),
            roles=entity.get(UserDatastore.FIELD_ROLES, []),
            created_at=entity.get(
                UserDatastore.FIELD_CREATED_AT, datetime.now(timezone.utc)
            ),
        )

    def delete_user(self, user_id: str) -> str:
        """Delete a user by ID."""
        try:
            orionis_log(f"Attempting to delete user with ID: {user_id}")
            key = self.db.key(UserDatastore.ENTITY_KIND_USER, int(user_id))
            user_entity = self.db.get(key)

            if not user_entity:
                raise ValueError(f"User with ID {user_id} does not exist in datastore")

            orionis_log(f"Deleting user entity for user_id: {user_id}")
            self.db.delete(key)
            orionis_log(f"Successfully deleted user {user_id}")

            return user_id

        except ValueError as e:
            orionis_log("ValueError in delete_user", e)
            raise e

        except Exception as e:
            orionis_log("Error deleting user", e)
            raise
