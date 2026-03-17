import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const { organisationId } = await req.json();
    console.log("Organisation ID", organisationId);

    const response = await fetch(constructUrl("GetProducts"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({ organisation_id: organisationId }),
    });

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }
    const result = await response.json();
    console.log("Products List :", result.products);
    return NextResponse.json(result.products);
  } catch (error) {
    console.log("Error while getting the products ", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to to get the products" },
      { status: 500 },
    );
  }
}
