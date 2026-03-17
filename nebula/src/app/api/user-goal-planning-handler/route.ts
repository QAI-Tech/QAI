import { NextRequest, NextResponse } from "next/server";
import { constructUrl } from "@/lib/urlUtlis";
import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import * as Sentry from "@sentry/nextjs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      product_id,
      product_name,
      executable_url,
      platform,
      environment,
      text_based_goal,
      mode,
    } = body;

    console.log("Capture Text Flow Request:", {
      product_id,
      product_name,
      executable_url,
      platform,
      environment,
      text_based_goal,
      mode,
    });

    const response = await fetch(constructUrl("UserGoalPlanningHandler"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    if (!response.ok) {
      const errorData = await response.json();
      Sentry.captureMessage(JSON.stringify(errorData), {
        level: "error",
        tags: { priority: "high" },
      });
      console.log("Backend error response:", errorData);
      return NextResponse.json(
        { error: errorData.error || "Failed to plan goals" },
        { status: response.status },
      );
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error capturing text flow:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to capture text flow" },
      { status: 500 },
    );
  }
}
