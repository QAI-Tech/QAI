"""
MailSlurp Client

A minimal, integration-friendly MailSlurp utility module that provides:

1) Create new inbox emails with a fixed prefix: "qai_executor"
2) Delete inboxes by providing a list of email addresses
3) List inbox emails for a given inbox email address
4) Fetch full email body (and related fields) for a specific email ID
5) Create a group with a given name and add a set of email addresses to it
6) Delete a group (group only; does not delete inboxes)

Design notes:
- MailSlurp "groups" are contact groups. To group email addresses, we create Contacts and then add
  those contacts to a Group.
- Deleting an inbox deletes that email address/inbox. Deleting a group deletes only the group entity,
  not the contacts themselves.

Usage example:

    from mailSlurp import MailSlurpClient, client_from_env

    # From environment variable
    client = client_from_env()

    # Or with explicit key
    client = MailSlurpClient(api_key="your-api-key")

    inbox = client.create_inbox(prefix="qai_executor")
    emails = client.list_inbox_emails(inbox_email=inbox["emailAddress"])

    group = client.create_group_and_add_emails("my-group", ["a@b.com", "c@d.com"])
    client.delete_group(group_id=group["groupId"])
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

import requests

logger = logging.getLogger(__name__)

MAILSLURP_BASE_URL = "https://api.mailslurp.com"
DEFAULT_PREFIX = "qai_executor"


class MailSlurpError(RuntimeError):
    """Raised when MailSlurp returns an error response or an unexpected payload."""


@dataclass
class MailSlurpClient:
    """
    Minimal MailSlurp REST client focused on inbox + email retrieval + contact group operations.

    Parameters
    ----------
    api_key:
        MailSlurp API key. Prefer passing this in from your secret manager (or env var).
    base_url:
        Base URL for MailSlurp API. Defaults to https://api.mailslurp.com
    timeout_s:
        Network timeout in seconds for each request.
    """

    api_key: str
    base_url: str = MAILSLURP_BASE_URL
    timeout_s: int = 30

    # ----------------------------
    # Core HTTP helpers
    # ----------------------------

    def _headers(self) -> Dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Internal HTTP helper with consistent error handling.

        Raises
        ------
        MailSlurpError
            When MailSlurp responds with an HTTP status >= 400, or response is malformed.
        """
        url = self.base_url.rstrip("/") + "/" + path.lstrip("/")

        logger.debug("MailSlurp request: %s %s", method.upper(), url)

        resp = requests.request(
            method=method.upper(),
            url=url,
            headers=self._headers(),
            params=params,
            json=json_body,
            timeout=self.timeout_s,
        )

        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            logger.error("MailSlurp error: %s %s -> %s: %s", method.upper(), url, resp.status_code, detail)
            raise MailSlurpError(
                f"{method.upper()} {url} failed with {resp.status_code}: {detail}"
            )

        # 204 No Content
        if resp.status_code == 204:
            return None

        # Usually JSON
        ctype = (resp.headers.get("content-type") or "").lower()
        if "application/json" in ctype:
            return resp.json()

        # Fallback: return raw text
        return resp.text

    # ----------------------------
    # Public functions
    # ----------------------------

    def create_inbox(
        self,
        *,
        prefix: str = DEFAULT_PREFIX,
        name: Optional[str] = None,
        description: Optional[str] = None,
        use_short_address: bool = True,
        virtual_inbox: bool = False,
    ) -> Dict[str, Any]:
        """
        Create a new inbox (email address) using a given prefix.

        This is the primary function to create new emails with prefix "qai_executor".
        MailSlurp creates a brand-new inbox + email address (e.g. qai_executor_xxxxx@mailslurp...).

        Parameters
        ----------
        prefix:
            Prefix to apply to created inbox email addresses. Default: "qai_executor".
        name:
            Optional friendly name for the inbox.
        description:
            Optional description for internal tracking.
        use_short_address:
            If True, asks MailSlurp to use shorter addresses when available.
        virtual_inbox:
            If True, creates a virtual inbox (MailSlurp feature; behavior depends on account).

        Returns
        -------
        dict
            MailSlurp inbox object. Typically includes:
            - id
            - emailAddress
            - createdAt
            - etc.

        Raises
        ------
        MailSlurpError
            If MailSlurp rejects the request (auth, quota, invalid params).
        """
        params = {
            "prefix": prefix,
            "useShortAddress": str(use_short_address).lower(),
            "virtualInbox": str(virtual_inbox).lower(),
        }
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if description is not None:
            body["description"] = description

        logger.info("Creating inbox with prefix: %s", prefix)
        result = self._request("POST", "/inboxes", params=params, json_body=(body or None))
        logger.info("Created inbox: %s", result.get("emailAddress"))
        return result

    def delete_inboxes_by_email_addresses(self, emails: Sequence[str]) -> List[Dict[str, Any]]:
        """
        Delete inboxes by providing a list of inbox email addresses.

        This does:
        1) Resolve each email address -> inboxId via /inboxes/byEmailAddress
        2) DELETE /inboxes/{inboxId}

        Parameters
        ----------
        emails:
            A sequence of inbox email addresses (strings) to delete.

        Returns
        -------
        list[dict]
            Per-email results. Each element includes:
            - email
            - deleted (bool)
            - inboxId (if found)
            - reason (if not deleted)

        Raises
        ------
        MailSlurpError
            If the API errors in a way that isn't a simple "not found".
        """
        results: List[Dict[str, Any]] = []

        for email in emails:
            inbox = self._get_inbox_by_email_address(email)
            if not inbox:
                logger.warning("Inbox not found for deletion: %s", email)
                results.append({"email": email, "deleted": False, "reason": "not_found"})
                continue

            inbox_id = inbox.get("inboxId") or inbox.get("id")
            if not inbox_id:
                results.append(
                    {"email": email, "deleted": False, "reason": "no_inbox_id_in_response"}
                )
                continue

            self._request("DELETE", f"/inboxes/{inbox_id}")
            logger.info("Deleted inbox: %s (id=%s)", email, inbox_id)
            results.append({"email": email, "deleted": True, "inboxId": inbox_id})

        return results

    def list_inbox_emails(
        self,
        *,
        inbox_email: str,
        page: int = 0,
        size: int = 20,
        sort: str = "DESC",
        since: Optional[str] = None,
        before: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        List emails in the inbox corresponding to `inbox_email`.

        This resolves inbox_email -> inboxId, then calls the paginated inbox listing endpoint.

        Parameters
        ----------
        inbox_email:
            The MailSlurp inbox email address (e.g. qai_executor_xxx@mailslurp.com).
        page:
            Page index (0-based).
        size:
            Page size.
        sort:
            "ASC" or "DESC" (newest first is typically "DESC").
        since:
            Optional ISO8601 datetime filter to include only emails received after this time.
        before:
            Optional ISO8601 datetime filter to include only emails received before this time.

        Returns
        -------
        dict
            A normalized structure containing:
            - inboxEmail
            - inboxId
            - totalElements / totalPages (if present)
            - emails: list of preview dicts containing id/subject/from/to/createdAt/read etc.

        Raises
        ------
        MailSlurpError
            If the inbox does not exist, or listing fails.
        """
        inbox = self._require_inbox_by_email(inbox_email)
        inbox_id = inbox.get("inboxId") or inbox.get("id")

        params: Dict[str, Any] = {"page": page, "size": size, "sort": sort}
        if since:
            params["since"] = since
        if before:
            params["before"] = before

        logger.debug("Listing emails for inbox: %s", inbox_email)
        page_obj = self._request("GET", f"/inboxes/{inbox_id}/emails/paginated", params=params)

        content = page_obj.get("content") or page_obj.get("emails") or []
        previews: List[Dict[str, Any]] = []
        for e in content:
            previews.append(
                {
                    "id": e.get("id"),
                    "subject": e.get("subject"),
                    "from": e.get("from"),
                    "to": e.get("to"),
                    "createdAt": e.get("createdAt"),
                    "read": e.get("read"),
                    "attachments": e.get("attachments"),
                }
            )

        return {
            "inboxEmail": inbox_email,
            "inboxId": inbox_id,
            "totalElements": page_obj.get("totalElements"),
            "totalPages": page_obj.get("totalPages"),
            "emails": previews,
            "raw": page_obj,  # keep original in case more fields are needed
        }

    def get_email_body(
        self,
        *,
        inbox_email: str,
        email_id: str,
        verify_belongs_to_inbox: bool = True,
    ) -> Dict[str, Any]:
        """
        Fetch the full email payload (body/html/text excerpts) for a specific email ID.

        Parameters
        ----------
        inbox_email:
            The inbox email address whose inbox you consider the source-of-truth.
            Used to optionally verify that the email belongs to that inbox.
        email_id:
            The MailSlurp email ID to retrieve.
        verify_belongs_to_inbox:
            If True, checks that email.inboxId matches the resolved inboxId (when provided by API).
            If MailSlurp omits inboxId on the email DTO, verification is skipped.

        Returns
        -------
        dict
            Normalized email fields including:
            - id, subject, from, to, createdAt
            - body (may be plain text), html (if present), bodyExcerpt, textExcerpt
            - attachments (if present)
            - raw (full response)

        Raises
        ------
        MailSlurpError
            If the email does not exist, or verification fails.
        """
        inbox = self._require_inbox_by_email(inbox_email)
        inbox_id = inbox.get("inboxId") or inbox.get("id")

        logger.debug("Fetching email body: %s", email_id)
        email = self._request("GET", f"/emails/{email_id}")

        if verify_belongs_to_inbox:
            email_inbox_id = email.get("inboxId")
            if email_inbox_id and inbox_id and email_inbox_id != inbox_id:
                raise MailSlurpError(
                    f"Email {email_id} does not belong to inbox {inbox_email}. "
                    f"(email.inboxId={email_inbox_id}, expected={inbox_id})"
                )

        return {
            "id": email.get("id"),
            "subject": email.get("subject"),
            "from": email.get("from"),
            "to": email.get("to"),
            "createdAt": email.get("createdAt"),
            "body": email.get("body"),
            "html": email.get("html"),
            "bodyExcerpt": email.get("bodyExcerpt"),
            "textExcerpt": email.get("textExcerpt"),
            "attachments": email.get("attachments"),
            "raw": email,
        }

    def wait_for_latest_email(
        self,
        *,
        inbox_email: str,
        timeout_ms: int = 30000,
        unread_only: bool = True,
    ) -> Dict[str, Any]:
        """
        Wait for an email to arrive in the inbox and return it.

        Useful for email verification flows where you need to wait for OTP/confirmation emails.

        Parameters
        ----------
        inbox_email:
            The inbox email address to wait for emails in.
        timeout_ms:
            How long to wait for an email in milliseconds. Default: 30000 (30 seconds).
        unread_only:
            If True, only return unread emails. Default: True.

        Returns
        -------
        dict
            The email object with full body content.

        Raises
        ------
        MailSlurpError
            If no email arrives within the timeout or inbox doesn't exist.
        """
        inbox = self._require_inbox_by_email(inbox_email)
        inbox_id = inbox.get("inboxId") or inbox.get("id")

        params = {
            "inboxId": inbox_id,
            "timeout": timeout_ms,
            "unreadOnly": str(unread_only).lower(),
        }

        logger.info("Waiting for email in inbox: %s (timeout=%dms)", inbox_email, timeout_ms)
        email = self._request("GET", "/waitForLatestEmail", params=params)
        logger.info("Received email: %s", email.get("subject"))

        return {
            "id": email.get("id"),
            "subject": email.get("subject"),
            "from": email.get("from"),
            "to": email.get("to"),
            "createdAt": email.get("createdAt"),
            "body": email.get("body"),
            "html": email.get("html"),
            "bodyExcerpt": email.get("bodyExcerpt"),
            "textExcerpt": email.get("textExcerpt"),
            "attachments": email.get("attachments"),
            "raw": email,
        }

    def create_group_and_add_emails(
        self,
        group_name: str,
        email_addresses: Sequence[str],
        *,
        description: Optional[str] = None,
        contact_tags: Optional[Sequence[str]] = None,
        contact_metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Create a contact group and add the provided email addresses to it.

        Important: MailSlurp groups are contact groups, not inbox groups.
        So we:
          1) Create a group
          2) Create a Contact per email address
          3) Add contacts to the group via contactIds

        Parameters
        ----------
        group_name:
            Name of the group to create.
        email_addresses:
            Email addresses to add to this group (they become MailSlurp Contacts).
        description:
            Optional group description.
        contact_tags:
            Optional tags to apply to the created contacts.
        contact_metadata:
            Optional metadata dict to store on created contacts (useful for traceability).

        Returns
        -------
        dict
            Contains:
            - groupId
            - group (raw group response)
            - contactsCreated (list of contact summaries)
            - contactIdsAdded
            - rawAddContactsResult

        Raises
        ------
        MailSlurpError
            If group creation, contact creation, or membership update fails.
        """
        group_body: Dict[str, Any] = {"name": group_name}
        if description:
            group_body["description"] = description

        logger.info("Creating group: %s", group_name)
        group = self._request("POST", "/groups", json_body=group_body)
        group_id = group.get("id") or group.get("groupId")
        if not group_id:
            raise MailSlurpError("create_group: could not determine groupId from response")

        contact_ids: List[str] = []
        contacts_created: List[Dict[str, Any]] = []

        for addr in email_addresses:
            contact_body: Dict[str, Any] = {"emailAddresses": [addr]}
            if contact_tags:
                contact_body["tags"] = list(contact_tags)
            if contact_metadata:
                contact_body["metaData"] = contact_metadata

            contact = self._request("POST", "/contacts", json_body=contact_body)
            contact_id = contact.get("id") or contact.get("contactId")
            if not contact_id:
                raise MailSlurpError(f"create_contact: could not determine contactId for {addr}")

            contact_ids.append(contact_id)
            contacts_created.append(
                {
                    "contactId": contact_id,
                    "emailAddresses": contact.get("emailAddresses"),
                    "tags": contact.get("tags"),
                }
            )

        logger.info("Adding %d contacts to group %s", len(contact_ids), group_name)
        add_result = self._request(
            "PUT",
            f"/groups/{group_id}/contacts",
            json_body={"contactIds": contact_ids},
        )

        return {
            "groupId": group_id,
            "group": group,
            "contactsCreated": contacts_created,
            "contactIdsAdded": contact_ids,
            "rawAddContactsResult": add_result,
        }

    def delete_group(self, *, group_id: str) -> None:
        """
        Delete a group by ID, without deleting inboxes or emails.

        Parameters
        ----------
        group_id:
            The MailSlurp group ID to delete.

        Returns
        -------
        None

        Raises
        ------
        MailSlurpError
            If deletion fails (e.g. group doesn't exist or permission issue).
        """
        logger.info("Deleting group: %s", group_id)
        self._request("DELETE", f"/groups/{group_id}")

    # ----------------------------
    # Internal helpers
    # ----------------------------

    def _get_inbox_by_email_address(self, email_address: str) -> Optional[Dict[str, Any]]:
        """
        Resolve an inbox email address -> inbox record (or None if not found).

        This wraps /inboxes/byEmailAddress and converts a 404 into None.
        """
        try:
            return self._request(
                "GET", "/inboxes/byEmailAddress", params={"emailAddress": email_address}
            )
        except MailSlurpError as e:
            # MailSlurp returns 404 for unknown inbox addresses.
            if " 404" in str(e) or "404:" in str(e):
                return None
            raise

    def _require_inbox_by_email(self, email_address: str) -> Dict[str, Any]:
        """
        Resolve inbox by email address, but raise a clear error if not found.
        """
        inbox = self._get_inbox_by_email_address(email_address)
        if not inbox:
            raise MailSlurpError(f"Inbox not found for email address: {email_address}")
        return inbox


def client_from_env(
    *,
    env_var: str = "MAILSLURP_API_KEY",
    base_url: str = MAILSLURP_BASE_URL,
    timeout_s: int = 30,
) -> MailSlurpClient:
    """
    Convenience constructor to create a MailSlurpClient from an environment variable.

    Parameters
    ----------
    env_var:
        Environment variable that contains the MailSlurp API key.
    base_url:
        Base URL for the API (rarely changed).
    timeout_s:
        Network timeout per request.

    Returns
    -------
    MailSlurpClient

    Raises
    ------
    MailSlurpError
        If the env var is missing or empty.
    """
    key = (os.environ.get(env_var) or "").strip()
    if not key:
        raise MailSlurpError(f"Missing API key. Set env var {env_var}.")
    return MailSlurpClient(api_key=key, base_url=base_url, timeout_s=timeout_s)
