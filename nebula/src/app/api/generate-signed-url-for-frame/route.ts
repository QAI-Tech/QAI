import { NextRequest, NextResponse } from "next/server";
import { GetSignedUrlConfig, Storage } from "@google-cloud/storage";
import * as Sentry from "@sentry/nextjs";
import {
  GCS_SIGNED_URL_EXPIRATION_MS,
  PRODUCT_DESIGN_ASSETS_BUCKET_NAME,
} from "@/lib/constants";

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
    const bucketName = path?.split("/")[0] || PRODUCT_DESIGN_ASSETS_BUCKET_NAME;
    //remove the first element from the array and join the rest of the elements to get the frame path
    const framePath = path?.split("/").slice(1).join("/");

    if (!framePath) {
      return NextResponse.json(
        { error: "Missing frame path query parameter" },
        { status: 400 },
      );
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
