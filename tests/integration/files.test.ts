import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { makeUser, resetDb } from "../helpers";
import * as sellerRoute from "@/app/api/v1/seller/route";
import * as filesRoute from "@/app/api/v1/files/[...key]/route";

beforeEach(resetDb);

// Smallest valid PNG header + payload; storage sniffs content, not the declared type.
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");

async function upload(cookie: string, bytes: Buffer, name = "id.png") {
  const form = new FormData();
  form.append("document", new File([new Uint8Array(bytes)], name, { type: "image/png" }));
  const req = new Request("http://localhost:3000/api/v1/seller", { method: "POST", headers: { cookie, origin: "http://localhost:3000" }, body: form });
  const res = await sellerRoute.POST(req, { params: Promise.resolve({}) });
  return { status: res.status, json: await res.json() };
}

async function fetchFile(key: string, cookie?: string) {
  const req = new Request(`http://localhost:3000/api/v1/files/${key}`, { headers: cookie ? { cookie } : {} });
  return (await filesRoute.GET(req, { params: Promise.resolve({ key: key.split("/") }) })).status;
}

describe("seller verification documents", () => {
  it("are visible only to the uploading seller and marketplace moderators", async () => {
    const seller = await makeUser(["CUSTOMER", "SELLER"]);
    const stranger = await makeUser();
    const support = await makeUser(["SUPPORT"]);
    const admin = await makeUser(["ADMIN"]);
    await db.sellerProfile.create({ data: { userId: seller.user.id, displayName: "S" } });

    const up = await upload(seller.cookie, PNG);
    expect(up.status).toBe(200);
    const key = (await db.sellerProfile.findUniqueOrThrow({ where: { userId: seller.user.id } })).verificationDocKeys[0];
    expect(key).toMatch(/^verification\//);

    expect(await fetchFile(key)).toBe(404);
    expect(await fetchFile(key, stranger.cookie)).toBe(404);
    expect(await fetchFile(key, support.cookie)).toBe(404); // support agents can't moderate the marketplace
    expect(await fetchFile(key, seller.cookie)).toBe(200);
    expect(await fetchFile(key, admin.cookie)).toBe(200);
    expect(await db.auditLog.count({ where: { action: "seller.document_viewed" } })).toBe(1);
  });

  it("rejects files whose content isn't an allowed type", async () => {
    const seller = await makeUser(["CUSTOMER", "SELLER"]);
    await db.sellerProfile.create({ data: { userId: seller.user.id, displayName: "S" } });
    const r = await upload(seller.cookie, Buffer.from("<script>alert(1)</script>"), "evil.png");
    expect(r.status).toBe(422);
  });
});
