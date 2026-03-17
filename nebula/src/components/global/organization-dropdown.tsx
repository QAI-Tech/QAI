"use client";
import * as React from "react";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch, RootState } from "@/app/store/store";
import { Combobox } from "@/components/ui/combobox-pop-search";
import { isQaiOrgUser } from "@/lib/constants";
import { useUser } from "@clerk/nextjs";
import { setSelectedOrganization } from "@/app/store/organizationSlice";
import * as Sentry from "@sentry/nextjs";

const OrganizationDropDown = () => {
  const { user } = useUser();
  const dispatch = useDispatch<AppDispatch>();

  // Get organization state from Redux
  const { organizations, selectedOrgId, loading } = useSelector(
    (state: RootState) => state.organizations,
  );

  // Check if user is a QAI org user
  const userOrgId = user?.publicMetadata?.organisation_id as string | undefined;
  const isQaiUser = isQaiOrgUser(userOrgId);

  // If user is not a QAI org user, don't render this component
  if (!isQaiUser) {
    return null;
  }

  const handleOrgChange = (value: string) => {
    try {
      dispatch(setSelectedOrganization(value));
    } catch (error) {
      console.error("Error changing organization:", error);
      Sentry.captureException(error, {
        level: "error",
        tags: { action: "organization_change" },
      });
    }
  };

  const orgOptions = [
    { value: "all", label: "All Organizations" },
    ...organizations.map((org) => ({
      value: org.organization_id,
      label: org.organization_name,
    })),
  ];

  return (
    <div className="w-full max-w-xs mx-auto">
      <p className="text-sm text-gray-500 font-semibold p-1">
        Select Organization
      </p>
      <Combobox
        options={orgOptions}
        value={selectedOrgId}
        onChange={handleOrgChange}
        placeholder="Search organization..."
        emptyMessage="No Organization Found"
        buttonLabel={loading ? "Loading..." : "Select an organization..."}
        className="bg-gray-50 font-semibold text-gray-700 w-44 truncate"
        popoverClassName="w-52 p-0"
      />
    </div>
  );
};

export default OrganizationDropDown;
