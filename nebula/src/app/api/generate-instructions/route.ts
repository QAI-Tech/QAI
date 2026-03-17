import { NextRequest, NextResponse } from "next/server";
import { Storage, GetSignedUrlConfig } from "@google-cloud/storage";
import { v4 as uuidv4 } from "uuid";
import * as Sentry from "@sentry/nextjs";
import {
  GCS_BUCKET_NAME,
  MEDIA_TYPE,
  SESSION_TOKEN_COOKIE_NAME,
  VIDEO,
} from "@/lib/constants";
import { handleExpiredSessionToken } from "@/lib/handleExpiredSessionToken";
import { constructUrl } from "@/lib/urlUtlis";

const storage = (() => {
  if (process.env.NODE_ENV === "production") {
    const gcsKeyFile = JSON.parse(process.env.GCS_KEY_FILE || "{}");
    return new Storage({ credentials: gcsKeyFile });
  } else {
    return new Storage({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    });
  }
})();

// Generating a Signed URL for uploading a file to Google Cloud Storage
// Full path including folder

async function generateSignedUrl(
  fileName: string,
  contentType: string,
  bucketName: string,
) {
  const folderName = "qai-upload-temporary"; // Folder inside the bucket
  const filePath = `${folderName}/${fileName}`;
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filePath); // Use full path

  const options: GetSignedUrlConfig = {
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes expiry
    contentType,
  };

  try {
    const [signedUrl] = await file.getSignedUrl(options);
    return { signedUrl, filePath: `gs://${bucketName}/${filePath}` }; // Updated filePath with folder
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error generating signed URL:", error);
    throw new Error("Error while generating URL");
  }
}

async function handleSignedUrlRequest(req: NextRequest, bucketName: string) {
  if (req.headers.get("content-type") !== "application/json") {
    return NextResponse.json(
      { error: "Invalid content type. Expected application/json." },
      { status: 415 },
    );
  }

  const { fileName, contentType } = await req.json();

  if (!fileName || !contentType) {
    Sentry.captureException(new Error("Missing fileName or contentType"), {
      level: "fatal",
      tags: { priority: "high" },
    });
    return NextResponse.json(
      { error: "Missing fileName or contentType" },
      { status: 400 },
    );
  }

  const uploadId = uuidv4();
  const finalFileName = `${fileName}`;

  const { signedUrl, filePath } = await generateSignedUrl(
    finalFileName,
    contentType,
    bucketName,
  );

  return NextResponse.json({ signedUrl, fileName: filePath, uploadId });
}

async function handleFileProcessing(req: NextRequest) {
  const formData = await req.formData();
  const gcsPath = formData.get("gcsPath") as string;
  const product_id = formData.get("product_id") as string;

  if (!gcsPath) {
    throw new Error("No GCS path provided");
  }

  const backendPayload = {
    media_type: VIDEO as MEDIA_TYPE,
    uri: gcsPath,
    product_id: product_id,
  };

  const backendResponse = await fetch(
    constructUrl("RequestTestCaseGeneration"),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
      },
      body: JSON.stringify(backendPayload),
    },
  );

  if (backendResponse.status === 401) {
    return await handleExpiredSessionToken(req);
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

  const result = await backendResponse.json();
  return NextResponse.json({ message: result });
}

async function handleMaintainerAgentRequest(req: NextRequest) {
  const { payload } = await req.json();

  console.log("Maintainer Agent payload:" + JSON.stringify(payload));

  const maintainerAgentPayload = {
    product_id: payload.product_id,
    execution_video_url: payload.user_flow_video_urls[0],
    request_id: payload.request_id,
    ...(payload.feature_id && { feature_id: payload.feature_id }),
    ...(payload.flow_name && { flow_name: payload.flow_name }),
  };

  const backendResponse = await fetch(constructUrl("RequestMaintainerAgent"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `${req.cookies.get(SESSION_TOKEN_COOKIE_NAME)?.value}`,
    },
    body: JSON.stringify(maintainerAgentPayload),
  });

  if (backendResponse.status === 401) {
    return await handleExpiredSessionToken(req);
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

  const result = await backendResponse.json();
  return NextResponse.json({ message: result });
}

export async function POST(req: NextRequest) {
  try {
    const { pathname, searchParams } = req.nextUrl;
    const isSignedUrlRequest = searchParams.get("getSignedUrl") === "true";
    const isMaintainerAgent = searchParams.get("maintainerAgent") === "true";

    if (isMaintainerAgent) {
      return handleMaintainerAgentRequest(req);
    }

    const bucketName = searchParams.get("bucketName") || GCS_BUCKET_NAME;
    if (pathname !== "/api/generate-instructions") {
      return NextResponse.json({ error: "Invalid endpoint" }, { status: 404 });
    }

    if (isSignedUrlRequest) {
      return handleSignedUrlRequest(req, bucketName);
    }

    return handleFileProcessing(req);
  } catch (error) {
    Sentry.captureException(error, {
      level: "fatal",
      tags: { priority: "high" },
    });
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
