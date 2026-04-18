import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { PhotoAttachment } from "../../src/types.js";
import { config } from "../config.js";
import { DomainError } from "../lib/domainErrors.js";

const maxUploadBytes = 8 * 1024 * 1024;

function getImageExtension(mimeType: string) {
  if (mimeType === "image/jpeg") {
    return "jpg";
  }

  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return null;
}

export async function savePhotoUpload(options: {
  kind: PhotoAttachment["kind"];
  originalFileName: string;
  dataUrl: string;
  baseUrl: string;
}): Promise<PhotoAttachment> {
  const match = options.dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new DomainError("Invalid data URL", 400);
  }

  const mimeType = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, "base64");

  if (buffer.length > maxUploadBytes) {
    throw new DomainError("File too large", 413);
  }

  const extension = getImageExtension(mimeType);

  if (!extension) {
    throw new DomainError("Unsupported file type", 400);
  }

  const id = `PHOTO-${options.kind.toUpperCase()}-${randomUUID()}`;
  const storedFileName = `${id}.${extension}`;

  await mkdir(config.uploadsDir, { recursive: true });
  await writeFile(join(config.uploadsDir, storedFileName), buffer);

  return {
    id,
    kind: options.kind,
    fileName: options.originalFileName,
    previewUrl: `${options.baseUrl}/uploads/${storedFileName}`,
  };
}
