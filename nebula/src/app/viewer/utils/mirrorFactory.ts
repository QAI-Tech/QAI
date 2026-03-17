import * as THREE from "three";
import {
  GCS_BUCKET_URL,
  GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT,
} from "@/lib/constants";

// Interface for mirror group with dispose method
interface DisposableMirrorGroup extends THREE.Group {
  dispose: () => void;
}
import {
  MIRROR_HEIGHT,
  MIRROR_DEPTH,
  IMAGE_SCALE_FACTOR,
  IMAGE_DEPTH_SCALE,
  IMAGE_SHININESS,
  IMAGE_RENDER_ORDER,
} from "../constants";

export interface TextureLoadCallback {
  onLoad?: () => void;
  onError?: (error: unknown) => void;
}

export class MirrorFactory {
  /**
   * Creates a mirror with texture (no frame)
   */
  static async createMirrorWithTexture(
    imageData: string,
    opacity: number = 1.0,
    callbacks?: TextureLoadCallback,
  ): Promise<THREE.Group> {
    return new Promise<THREE.Group>(async (resolve) => {
      const mirrorGroup = new THREE.Group();
      imageData = imageData.replace("gs://", GCS_BUCKET_URL);
      // Default aspect ratio (16:9) as fallback
      const defaultAspectRatio = 16 / 9;
      const imageWidth =
        MIRROR_HEIGHT * defaultAspectRatio * IMAGE_SCALE_FACTOR;
      const imageHeight = MIRROR_HEIGHT * IMAGE_SCALE_FACTOR;

      // Create the image mesh with default dimensions
      const imageGeometry = new THREE.BoxGeometry(
        imageWidth,
        imageHeight,
        MIRROR_DEPTH * IMAGE_DEPTH_SCALE,
      );

      const imageMaterial = new THREE.MeshPhongMaterial({
        transparent: true,
        opacity: opacity,
        shininess: IMAGE_SHININESS,
      });

      const imageMesh = new THREE.Mesh(imageGeometry, imageMaterial);
      imageMesh.name = "imageMesh";
      imageMesh.castShadow = true;
      imageMesh.receiveShadow = true;
      imageMesh.renderOrder = IMAGE_RENDER_ORDER;
      imageMesh.position.z = 0; // Ensure image is at the front of the mirror group
      mirrorGroup.add(imageMesh);

      // Store references for cleanup
      const textureRef = { current: null as THREE.Texture | null };
      const oldGeometryRef = { current: null as THREE.BoxGeometry | null };

      const resolveOnce = (() => {
        let called = false;
        return (value: THREE.Group) => {
          if (!called) {
            called = true;
            resolve(value);
          }
        };
      })();

      // Helper to load texture from base64 string
      const loadTexture = (base64Data: string) => {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(
          base64Data,
          (loadedTexture) => {
            textureRef.current = loadedTexture;

            // Update material with loaded texture
            imageMaterial.map = loadedTexture;
            imageMaterial.needsUpdate = true;

            // Update geometry when texture loads
            if (loadedTexture.image) {
              const imageAspectRatio =
                loadedTexture.image.width / loadedTexture.image.height;
              const newImageWidth =
                MIRROR_HEIGHT * imageAspectRatio * IMAGE_SCALE_FACTOR;
              const newImageHeight = MIRROR_HEIGHT * IMAGE_SCALE_FACTOR;

              // Store old geometry for disposal
              oldGeometryRef.current = imageMesh.geometry as THREE.BoxGeometry;

              // Create new image geometry with correct dimensions
              const newImageGeometry = new THREE.BoxGeometry(
                newImageWidth,
                newImageHeight,
                MIRROR_DEPTH * IMAGE_DEPTH_SCALE,
              );
              imageMesh.geometry = newImageGeometry;
            }

            // Call onLoad callback if provided
            callbacks?.onLoad?.();

            resolveOnce(mirrorGroup as DisposableMirrorGroup);
          },
          undefined,
          (error) => {
            console.error("Error loading texture:", error);
            callbacks?.onError?.(error);
            // Resolve even on error so callers can continue
            resolveOnce(mirrorGroup as DisposableMirrorGroup);
          },
        );
      };

      // If imageData is a GCS bucket URL, fetch signed URL, download, convert to base64, then load
      if (imageData && imageData.startsWith(GCS_BUCKET_URL)) {
        const framePath = imageData.substring(GCS_BUCKET_URL.length);
        console.log("FramePath:", framePath);
        try {
          const response = await fetch(
            `${GENERATE_SIGNED_URL_FOR_FRAME_API_ENDPOINT}${framePath}`,
          );
          if (!response.ok) throw new Error("Failed to fetch signed URL");
          const { signedUrl } = await response.json();
          // Download the image as a blob
          const imgResp = await fetch(signedUrl);
          if (!imgResp.ok)
            throw new Error("Failed to download image from signed URL");
          const blob = await imgResp.blob();
          // Convert blob to base64
          const toBase64 = (blob: Blob) =>
            new Promise<string>((resolveB64, rejectB64) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                resolveB64(reader.result as string);
              };
              reader.onerror = rejectB64;
              reader.readAsDataURL(blob);
            });
          const base64Data = await toBase64(blob);
          loadTexture(base64Data);
        } catch (err) {
          console.error("Error fetching or converting image:", err);
          callbacks?.onError?.(err);
          // Resolve even if fetching failed so caller can proceed (mirror will be empty)
          resolveOnce(mirrorGroup as DisposableMirrorGroup);
        }
      } else {
        // Otherwise, treat as base64 or public URL
        loadTexture(imageData);
      }

      // Add cleanup method to mirror group
      (mirrorGroup as DisposableMirrorGroup).dispose = () => {
        // Dispose of texture
        if (textureRef.current) {
          textureRef.current.dispose();
          textureRef.current = null;
        }

        // Dispose of old geometry
        if (oldGeometryRef.current) {
          oldGeometryRef.current.dispose();
          oldGeometryRef.current = null;
        }

        // Dispose of current geometries and materials
        mirrorGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((material) => material.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      };
    });
  }
}
