import fs from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { randomToken } from "@/lib/crypto";
import { AppError } from "@/lib/errors";

/**
 * Private file storage behind a small driver interface. Files are never public: they are only
 * reachable through /api/v1/files/[...key], which checks authorization.
 *
 *   STORAGE_DRIVER=local  writes under STORAGE_DIR (outside /public). Development / single server.
 *   STORAGE_DRIVER=s3     any S3-compatible bucket (AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO)
 *                         using SigV4-signed requests. Keep the bucket private.
 */
const ALLOWED: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };
const MAX_BYTES = 5 * 1024 * 1024;
const KEY_RE = /^(listing|evidence|verification)\/[A-Za-z0-9_-]{16,64}\.(png|jpg|webp|pdf)$/;

type StoredFile = { data: Buffer; contentType: string };
interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredFile | null>;
}

const contentTypeFor = (key: string) => Object.entries(ALLOWED).find(([, e]) => e === key.split(".").pop())?.[0] ?? "application/octet-stream";

const localDriver = (): StorageDriver => {
  const root = path.resolve(process.env.STORAGE_DIR ?? "./storage/private");
  return {
    async put(key, data) {
      const full = path.join(root, key);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, data);
    },
    async get(key) {
      const full = path.join(root, key);
      if (!full.startsWith(root)) return null;
      try {
        return { data: await fs.readFile(full), contentType: contentTypeFor(key) };
      } catch {
        return null;
      }
    },
  };
};

export function s3Driver(env: NodeJS.ProcessEnv = process.env): StorageDriver {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
    throw new AppError("NOT_CONFIGURED", "S3 storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
  }
  const client = new AwsClient({ accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY, region: env.S3_REGION ?? "auto", service: "s3" });
  // Path-style URLs work with every S3-compatible provider.
  const url = (key: string) => `${S3_ENDPOINT.replace(/\/$/, "")}/${encodeURIComponent(S3_BUCKET)}/${key}`;
  return {
    async put(key, data, contentType) {
      const res = await client.fetch(url(key), { method: "PUT", body: new Uint8Array(data), headers: { "Content-Type": contentType } });
      if (!res.ok) throw new AppError("INTERNAL", `Storage upload failed (${res.status})`);
    },
    async get(key) {
      const res = await client.fetch(url(key), { method: "GET" });
      if (res.status === 404 || res.status === 403) return null;
      if (!res.ok) throw new AppError("INTERNAL", `Storage read failed (${res.status})`);
      return { data: Buffer.from(await res.arrayBuffer()), contentType: contentTypeFor(key) };
    },
  };
}

function driver(): StorageDriver {
  return (process.env.STORAGE_DRIVER ?? "local") === "s3" ? s3Driver() : localDriver();
}

function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return null;
}

export async function saveFile(kind: "listing" | "evidence" | "verification", file: File) {
  if (file.size > MAX_BYTES) throw new AppError("VALIDATION_ERROR", "Files must be 5 MB or smaller");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf); // trust file contents, not the client-declared type
  if (!type || !ALLOWED[type]) throw new AppError("VALIDATION_ERROR", "Only PNG, JPEG, WebP or PDF files are allowed");
  if (kind === "listing" && type === "application/pdf") throw new AppError("VALIDATION_ERROR", "Listing images must be PNG, JPEG or WebP");
  const key = `${kind}/${randomToken(18).replace(/[^A-Za-z0-9_-]/g, "")}.${ALLOWED[type]}`;
  await driver().put(key, buf, type);
  return { key, contentType: type };
}

export async function readFile(key: string): Promise<StoredFile | null> {
  if (!KEY_RE.test(key)) return null;
  return driver().get(key);
}
