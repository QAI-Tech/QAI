import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = 'force-dynamic';

function getStorageRoot(): string {
  const configured =
    process.env.STORAGE_LOCAL_ROOT || process.env.ORIONIS_LOCAL_STORAGE_ROOT;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }

  if (process.cwd() === "/app") {
    return "/app/.qai/storage";
  }

  return path.resolve(process.cwd(), "../.qai/storage");
}

function resolveTargetPath(bucketName: string, filePath: string): string {
  const storageRoot = getStorageRoot();
  const rootWithSep = storageRoot.endsWith(path.sep)
    ? storageRoot
    : `${storageRoot}${path.sep}`;
  const resolved = path.resolve(storageRoot, bucketName, filePath);

  if (!resolved.startsWith(rootWithSep)) {
    throw new Error("Invalid storage path");
  }

  return resolved;
}

function getContentType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

export async function GET(req: NextRequest) {
  try {
    const bucketName = req.nextUrl.searchParams.get("bucketName");
    const filePath = req.nextUrl.searchParams.get("filePath");

    if (!bucketName || !filePath) {
      return NextResponse.json(
        { error: "Missing bucketName or filePath" },
        { status: 400 },
      );
    }

    const targetFile = resolveTargetPath(bucketName, filePath);
    const data = await readFile(targetFile);

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": getContentType(filePath),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Error reading local storage file:", error);
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
