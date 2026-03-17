import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const { id, name } = await req.json();

    if (!id || !name) {
      Sentry.captureMessage("FeatureId and new name are required", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "Feature ID and new name are required" },
        { status: 400 },
      );
    }

    const response = await fetch(constructUrl("UpdateFeature"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({
        id,
        name,
      }),
    });

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    if (!response.ok) {
      const errorData = await response.json();
      Sentry.captureMessage(JSON.stringify(errorData), {
        level: "fatal",
        tags: { priority: "high" },
      });
      throw new Error(`API request failed with status ${response.status}`);
    }
    const result = await response.json();
    console.log("Updated feature name:", result);
    return NextResponse.json(result);
  } catch (error) {
    console.log("Error while updating the feature name: ", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to update the feature name" },
      { status: 500 },
    );
  }
}
