import { readFileSync } from "fs";
import { extname, basename } from "path";

export type SupportedMediaType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif";

const MIME_MAP: Record<string, SupportedMediaType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export const SUPPORTED_EXTENSIONS = Object.keys(MIME_MAP);

export interface ImageData {
  base64: string;
  mediaType: SupportedMediaType;
}

/**
 * Read an image file from disk and return it base64-encoded with its MIME type.
 * Throws if the extension is unsupported.
 */
export function loadImage(filePath: string): ImageData {
  const ext = extname(filePath).toLowerCase();
  const mediaType = MIME_MAP[ext];

  if (!mediaType) {
    throw new Error(
      `Unsupported image type "${ext}". Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`
    );
  }

  const buffer = readFileSync(filePath);
  const base64 = buffer.toString("base64");

  return { base64, mediaType };
}

/**
 * Derive a PascalCase React component name from an image file path.
 * e.g. "my-navbar.png" → "MyNavbar", "hero_section.jpg" → "HeroSection"
 */
export function deriveComponentName(filePath: string): string {
  const name = basename(filePath, extname(filePath));

  // Split on non-alphanumeric characters, capitalise each word
  const pascal = name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");

  // Component names must start with a letter
  const sanitised = pascal.replace(/^[^a-zA-Z]+/, "");

  return sanitised || "Component";
}
