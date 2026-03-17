import * as THREE from "three";
import { SQUARE_WIDTH, SQUARE_DEPTH } from "../constants/geometry";

// Billboard styling constants
const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 256;
const BACKGROUND_COLOR = "rgba(170, 170, 170, 1.0)";
const BORDER_COLOR = "#ffffff";
const BORDER_WIDTH = 4;
const BORDER_PADDING = 2;
const TEXT_COLOR = "#000000";
const FONT_FAMILY = "Arial, sans-serif";
const FONT_WEIGHT = "900";
const FONT_SIZE = 48;
const LINE_HEIGHT = 45;
const TEXT_STROKE_WIDTH = 6;
const SHADOW_COLOR = "rgba(255, 255, 255, 0.8)";
const SHADOW_BLUR = 4;
const SHADOW_OFFSET_X = 2;
const SHADOW_OFFSET_Y = 2;
const PADDING_PERCENTAGE = 0.05; // 5% padding
const MAX_CHARS_PER_LINE = 18;
const MARGIN_BETWEEN_NAME_AND_FLOWS = 25;

export class BillboardFactory {
  /**
   * Creates a billboard with custom text
   * Uses the same dimensions as feature blocks but can display any text
   */
  static createBillboard(text: string, flowsCount?: number): THREE.Mesh {
    // Create a plane geometry for the billboard (same as feature blocks)
    const geometry = new THREE.PlaneGeometry(SQUARE_WIDTH, SQUARE_DEPTH);

    // Create material with neutral color to avoid color tinting
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff, // White color to avoid tinting the texture
      transparent: true,
      opacity: 0, // Start hidden in flow mode
      side: THREE.DoubleSide,
      alphaTest: 0.1, // Prevent clipping of transparent areas
    });

    // Create the mesh
    const billboard = new THREE.Mesh(geometry, material);

    // Rotate the plane to lie flat on the xz plane (rotate 90 degrees around x-axis)
    billboard.rotation.x = -Math.PI / 2;

    // Set the name for easy identification
    billboard.name = "billboard";

    // Enable shadow receiving but not casting
    billboard.castShadow = false;
    billboard.receiveShadow = true;

    // Add text to the billboard using CanvasTexture
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (context) {
      // Set canvas size
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      // Set background with full opacity to prevent clipping
      context.fillStyle = BACKGROUND_COLOR;
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Add border
      context.strokeStyle = BORDER_COLOR;
      context.lineWidth = BORDER_WIDTH;
      context.strokeRect(
        BORDER_PADDING,
        BORDER_PADDING,
        canvas.width - BORDER_PADDING * 2,
        canvas.height - BORDER_PADDING * 2,
      );

      // Calculate padding (5% of feature block dimensions)
      const paddingX = canvas.width * PADDING_PERCENTAGE; // 5% padding on left and right
      const paddingY = canvas.height * PADDING_PERCENTAGE; // 5% padding on top and bottom

      // Calculate available space
      const maxWidth = canvas.width - paddingX * 2; // Available width minus padding
      const availableHeight = canvas.height - paddingY * 2; // Available height minus padding

      // Prepare text lines
      const lines: string[] = [];

      // Add feature name
      const nameLines = this.wrapText(text, maxWidth, context, FONT_SIZE);
      lines.push(...nameLines);

      // Add flows count if provided
      if (flowsCount !== undefined) {
        lines.push(`${flowsCount} Flows`);
      }

      // Calculate line heights
      const nameLineHeight = LINE_HEIGHT; // For feature name
      const flowsLineHeight = LINE_HEIGHT; // Same as feature name for consistent styling

      // Calculate total height needed
      let totalHeight = 0;
      lines.forEach((line, index) => {
        if (index < nameLines.length) {
          totalHeight += nameLineHeight;
        } else {
          totalHeight += flowsLineHeight;
        }
      });

      // Calculate starting Y position to center the content
      const startY = paddingY + (availableHeight - totalHeight) / 2;

      // Draw each line
      let currentY = startY;
      lines.forEach((line, index) => {
        const isNameLine = index < nameLines.length;
        const fontSize = FONT_SIZE; // Same font size for both feature name and flows count
        const lineHeight = LINE_HEIGHT; // Same line height for both

        // Set font and styling
        context.font = `${FONT_WEIGHT} ${fontSize}px ${FONT_FAMILY}`;
        context.textAlign = "center";
        context.textBaseline = "top";

        // Add text shadow for better visibility
        context.shadowColor = SHADOW_COLOR;
        context.shadowBlur = SHADOW_BLUR;
        context.shadowOffsetX = SHADOW_OFFSET_X;
        context.shadowOffsetY = SHADOW_OFFSET_Y;

        // Add text stroke for extra boldness
        context.strokeStyle = TEXT_COLOR; // Pure black stroke
        context.lineWidth = TEXT_STROKE_WIDTH; // Thick stroke
        context.strokeText(line, canvas.width / 2, currentY);

        // Fill the text with pure black
        context.fillStyle = TEXT_COLOR; // Ensure pure black fill
        context.fillText(line, canvas.width / 2, currentY);

        // Add extra margin between feature name and flows count
        if (isNameLine && index === nameLines.length - 1) {
          currentY += lineHeight + MARGIN_BETWEEN_NAME_AND_FLOWS; // Add extra space after the last name line
        } else {
          currentY += lineHeight;
        }
      });

      // Create texture from canvas
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;

      // Apply texture to material
      material.map = texture;
    }

    return billboard;
  }

  /**
   * Helper method to wrap text to fit within a given width
   */
  private static wrapText(
    text: string,
    maxWidth: number,
    context: CanvasRenderingContext2D,
    fontSize: number,
  ): string[] {
    context.font = `${FONT_WEIGHT} ${fontSize}px ${FONT_FAMILY}`;

    const maxCharsPerLine = MAX_CHARS_PER_LINE; // Maximum characters per line
    const lines: string[] = [];
    let currentLine = "";

    // First, split by spaces to get words
    const words = text.split(" ");

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (testLine.length <= maxCharsPerLine) {
        // Word fits on current line
        currentLine = testLine;
      } else {
        // Word doesn't fit, try to split it intelligently
        if (currentLine) {
          lines.push(currentLine);
          currentLine = "";
        }

        // First try to split the word by special characters
        const specialChars = ["-", "/", "(", "—"];
        let wordParts = [word];

        // Split the word by special characters
        for (const char of specialChars) {
          const newParts = [];
          for (const part of wordParts) {
            const split = part.split(char);
            for (let i = 0; i < split.length; i++) {
              if (i > 0) {
                newParts.push(char + split[i]); // Add the special character to the beginning
              } else {
                newParts.push(split[i]);
              }
            }
          }
          wordParts = newParts;
        }

        // Now try to fit the parts
        for (const part of wordParts) {
          // Don't add space before special characters
          const isSpecialChar = specialChars.some((char) =>
            part.startsWith(char),
          );
          const testPart =
            currentLine && !isSpecialChar
              ? `${currentLine} ${part}`
              : currentLine
                ? `${currentLine}${part}`
                : part;

          if (testPart.length <= maxCharsPerLine) {
            currentLine = testPart;
          } else {
            if (currentLine) {
              lines.push(currentLine);
            }
            currentLine = part;
          }
        }
      }
    }

    // Add the last line if it has content
    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }

  /**
   * Creates a billboard with the default "Feature Name" text
   */
  static createDefaultBillboard(): THREE.Mesh {
    return this.createBillboard("Feature Name");
  }
}
