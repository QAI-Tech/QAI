import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  HTTP_STATUS_OK,
  SESSION_TOKEN_COOKIE_NAME,
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";

export async function POST(req: NextRequest) {
  try {
    const { nodeId, image } = await req.json();

    if (!nodeId || !image) {
      Sentry.captureMessage(
        "Node ID or image is missing for title generation",
        {
          level: "error",
          tags: { priority: "medium" },
        },
      );
      console.log("Node ID or image is missing for title generation");
      return NextResponse.json(
        { error: "Node ID and image are required" },
        { status: HTTP_STATUS_BAD_REQUEST },
      );
    }

    const requestData = {
      node_id: nodeId,
      image_url: image,
    };

    const backendResponse = await fetch(
      constructUrl("TitleGenerationForNodes"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
        },
        body: JSON.stringify(requestData),
      },
    );

    if (backendResponse.status === 401) {
      return await handleExpiredSessionToken(req);
    }

    // Handle backend response
    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      Sentry.captureMessage(
        `Failed to generate node title: ${backendResponse.status} - ${errorText}`,
        {
          level: "error",
          tags: { priority: "medium" },
        },
      );
      console.error(
        `Backend API error: ${backendResponse.status} - ${errorText}`,
      );
      return NextResponse.json(
        { error: `Backend API error: ${backendResponse.status}` },
        { status: backendResponse.status },
      );
    }

    const responseData = await backendResponse.json();
    console.log("Title generation response:", responseData);

    return NextResponse.json(responseData, { status: HTTP_STATUS_OK });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { priority: "high" },
    });
    console.error("Error in generate-node-title API:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: HTTP_STATUS_INTERNAL_SERVER_ERROR },
    );
  }
}
