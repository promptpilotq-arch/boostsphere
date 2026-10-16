import { afterEach, describe, expect, it, vi } from "vitest";
import { s3Driver } from "@/server/storage";

const env = { S3_ENDPOINT: "https://example-account.r2.cloudflarestorage.com", S3_BUCKET: "boostsphere-private", S3_ACCESS_KEY_ID: "AKIDEXAMPLE", S3_SECRET_ACCESS_KEY: "secret-example", S3_REGION: "auto" } as unknown as NodeJS.ProcessEnv;

afterEach(() => vi.restoreAllMocks());

describe("S3 storage driver", () => {
  it("sends SigV4-signed path-style PUT and GET requests", async () => {
    const calls: Request[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      calls.push(input as Request);
      return (input as Request).method === "GET" ? new Response(new Uint8Array([1, 2, 3]), { status: 200 }) : new Response(null, { status: 200 });
    });
    const s3 = s3Driver(env);
    await s3.put("evidence/abcdefghijklmnop.png", Buffer.from([1, 2, 3]), "image/png");
    const got = await s3.get("evidence/abcdefghijklmnop.png");

    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe("https://example-account.r2.cloudflarestorage.com/boostsphere-private/evidence/abcdefghijklmnop.png");
    expect(calls[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request/);
    expect(calls[0].headers.get("content-type")).toBe("image/png");
    expect(got?.contentType).toBe("image/png");
    expect([...got!.data]).toEqual([1, 2, 3]);
  });

  it("treats missing objects as not found and refuses to run unconfigured", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    expect(await s3Driver(env).get("evidence/abcdefghijklmnop.png")).toBeNull();
    expect(() => s3Driver({} as unknown as NodeJS.ProcessEnv)).toThrow(/S3 storage requires/);
  });
});
