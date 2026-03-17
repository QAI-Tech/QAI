import { SESSION_TOKEN_COOKIE_NAME } from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const response = await fetch(constructUrl("GetAllRequests"), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
    });

    if (response.status === 401) {
      return await handleExpiredSessionToken(req);
    }
    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.log("Error processing request: ", error);
    return NextResponse.json(
      { error: "Failed to get all queued request" },
      { status: 500 },
    );
  }
}
