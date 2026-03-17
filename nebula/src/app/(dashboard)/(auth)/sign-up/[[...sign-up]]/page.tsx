"use client";

import { SignUp } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import React from "react";
import { decodeString } from "@/lib/utils";
import { UserRole } from "@/lib/types";

const SignUpPage = () => {
  const searchParams = useSearchParams();
  const inviteHash = searchParams.get("invite");

  let inviteOrgId = "";
  let role = UserRole.TESTER;

  if (inviteHash) {
    try {
      const decodedValue = decodeString(inviteHash);
      const [orgId, userRole] = decodedValue.split(":");
      inviteOrgId = orgId;
      role = userRole as UserRole;
    } catch (error) {
      console.error("Failed to decode invite hash:", error);
    }
  }

  return (
    <SignUp
      appearance={{
        elements: {
          formButtonPrimary:
            "bg-primary text-primary-foreground hover:bg-primary/90",
          card: "shadow-none",
        },
      }}
      unsafeMetadata={{
        invite_org_id: inviteOrgId,
        roles: [role],
      }}
    />
  );
};

export default SignUpPage;
