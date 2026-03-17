import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { BROWSER_DROID_SERVER_URLS, SERVER_IP_MAP } from "@/lib/constants";

const normalizeServer = (url: string) => url.replace(/\/+$/, "");

const ALLOWED_BROWSERDROID_SERVERS = new Set(
  [...BROWSER_DROID_SERVER_URLS, ...Object.values(SERVER_IP_MAP)]
    .filter(Boolean)
    .map((url) => normalizeServer(url)),
);

export async function POST(req: NextRequest) {
  try {
    const {
      beforeImage,
      afterImage,
      boundingBox,
      serverUrl,
      action,
      isWeb = false,
    }: {
      beforeImage?: string;
      afterImage?: string;
      boundingBox?: { x: number; y: number; width: number; height: number };
      serverUrl?: string;
      action?: { summary?: string; type?: string; details?: unknown };
      isWeb?: boolean;
    } = await req.json();

    if (!beforeImage || !afterImage || !boundingBox || !serverUrl || !action) {
      return NextResponse.json(
        {
          error:
            "beforeImage, afterImage, boundingBox, serverUrl and action are required",
        },
        { status: 400 },
      );
    }

    const normalizedServer = normalizeServer(serverUrl);
    if (
      process.env.NODE_ENV === "production" &&
      !ALLOWED_BROWSERDROID_SERVERS.has(normalizedServer)
    ) {
      return NextResponse.json(
        { error: "Invalid BrowserDroid server" },
        { status: 400 },
      );
    }

    const endpoint = `${normalizedServer}/graph/describe-transition`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        before_image: beforeImage,
        after_image: afterImage,
        bounding_box: boundingBox,
        action,
        is_web: isWeb,
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        { error: result?.error || "Failed to describe transition" },
        { status: response.status },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    Sentry.captureException(error);
    return NextResponse.json(
      { error: "Failed to generate edge description" },
      { status: 500 },
    );
  }
}
