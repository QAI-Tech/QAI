// Compress an image file to JPEG and return a new File object
export async function fileToCompressedJpegFile(
  file: File,
  quality = 0.8,
  maxSize = 800,
): Promise<File> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = dataUrl;
  });
  let width = img.width,
    height = img.height;
  if (width > maxSize || height > maxSize) {
    if (width > height) {
      height = Math.round((maxSize * height) / width);
      width = maxSize;
    } else {
      width = Math.round((maxSize * width) / height);
      height = maxSize;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx!.drawImage(img, 0, 0, width, height);
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Compression failed"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
  return new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
    type: "image/jpeg",
  });
}

export async function compressBase64ImageToJpeg(
  base64: string,
  quality = 0.8,
  maxSize = 800,
): Promise<string> {
  // Convert base64 to image
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Resize if needed
      let width = img.width,
        height = img.height;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((maxSize * height) / width);
          width = maxSize;
        } else {
          width = Math.round((maxSize * width) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx!.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Compression failed"));
            return;
          }
          // Convert compressed JPEG Blob to base64
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => reject(new Error("Failed to load base64 image"));
    img.src = base64;
  });
}
