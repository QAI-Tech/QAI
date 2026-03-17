import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { constructUrl } from "@/lib/urlUtlis";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import {
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_OK,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@/lib/constants";
import * as Sentry from "@sentry/nextjs";

interface BuyQubitsRequest {
  organisation_id: string;
  qubit_amount: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as BuyQubitsRequest;
    const { organisation_id, qubit_amount } = body;

    if (!organisation_id || !qubit_amount) {
      Sentry.captureMessage("organisation_id and qubit_amount are required", {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: "organisation_id and qubit_amount are required" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const backendResponse = await fetch(constructUrl("BuyQubits"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${request.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify({
        organisation_id,
        qubit_amount,
      }),
    });

    if (backendResponse.status === 401) {
      return await handleExpiredSessionToken(request);
    }

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      Sentry.captureMessage(JSON.stringify(errorData), {
        level: "fatal",
        tags: { priority: "high" },
      });
      return NextResponse.json(
        { error: errorData.error || "Backend request failed" },
        { status: backendResponse.status },
      );
    }

    const responseData = await backendResponse.json();

    return NextResponse.json(responseData, {
      status: HTTP_STATUS_OK,
    });
  } catch (error) {
    console.error("Error in POST /api/buy-qubits:", error);
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Failed to create payment intent" },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Only POST method is allowed for this endpoint." },
    { status: 405 },
  );
}
