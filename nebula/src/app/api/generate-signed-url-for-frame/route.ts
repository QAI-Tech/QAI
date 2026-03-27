import { NextRequest, NextResponse } from "next/server";
import { GetSignedUrlConfig, Storage } from "@google-cloud/storage";
import * as Sentry from "@sentry/nextjs";
import {
  GCS_SIGNED_URL_EXPIRATION_MS,
  PRODUCT_DESIGN_ASSETS_BUCKET_NAME,
} from "@/lib/constants";

export const dynamic = 'force-dynamic';

const isLocalStorageBackend =
  (process.env.STORAGE_BACKEND || "").toLowerCase() === "local" ||
  process.env.NEXT_PUBLIC_APP_ENV === "development";

function parseStoragePath(path: string): { bucketName: string; filePath: string } | null {
  if (!path) return null;

  if (path.startsWith("gs://")) {
    const withoutScheme = path.slice(5);
    const slashIndex = withoutScheme.indexOf("/");
    if (slashIndex <= 0) return null;
    return {
      bucketName: withoutScheme.slice(0, slashIndex),
      filePath: withoutScheme.slice(slashIndex + 1),
    };
  }

  const cloudPrefix = "https://storage.cloud.google.com/";
  const normalized = path.startsWith(cloudPrefix)
    ? path.slice(cloudPrefix.length)
    : path;

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length < 2) return null;

  return {
    bucketName: segments[0],
    filePath: segments.slice(1).join("/"),
  };
}

const storage = (() => {
  if (process.env.NODE_ENV === "production") {
    const gcsKeyFile = JSON.parse(process.env.GCS_KEY_FILE || "{}");
    return new Storage({
      credentials: gcsKeyFile,
    });
  } else {
    return new Storage({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    });
  }
})();

export async function GET(req: NextRequest) {
  try {
    const path = req.nextUrl.searchParams.get("framePath");
    const parsedPath = path ? parseStoragePath(path) : null;
    const bucketName = parsedPath?.bucketName || PRODUCT_DESIGN_ASSETS_BUCKET_NAME;
    const framePath = parsedPath?.filePath;

    if (!framePath) {
      return NextResponse.json(
        { error: "Missing frame path query parameter" },
        { status: 400 },
      );
    }

    if (isLocalStorageBackend) {
      const signedUrl = `${req.nextUrl.origin}/api/local-storage-file?bucketName=${encodeURIComponent(
        bucketName,
      )}&filePath=${encodeURIComponent(framePath)}`;
      return NextResponse.json({ signedUrl });
    }

    const file = storage.bucket(bucketName).file(framePath);
    const options: GetSignedUrlConfig = {
      version: "v4",
      action: "read",
      expires: Date.now() + GCS_SIGNED_URL_EXPIRATION_MS,
    };

    const [signedUrl] = await file.getSignedUrl(options);

    return NextResponse.json({ signedUrl });
  } catch (err) {
    Sentry.captureException(err, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error generating signed URL:", err);
    return NextResponse.json(
      { error: "Error generating signed URL :", err },
      { status: 500 },
    );
  }
}
