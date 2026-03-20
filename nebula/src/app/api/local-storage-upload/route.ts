import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

function getStorageRoot(): string {
  const configured = process.env.STORAGE_LOCAL_ROOT;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
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

export async function PUT(req: NextRequest) {
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
    await mkdir(path.dirname(targetFile), { recursive: true });

    const data = new Uint8Array(await req.arrayBuffer());
    await writeFile(targetFile, data);

    return NextResponse.json({ success: true, path: `gs://${bucketName}/${filePath}` });
  } catch (error) {
    console.error("Error writing local storage file:", error);
    return NextResponse.json({ error: "Failed to write file" }, { status: 500 });
  }
}
