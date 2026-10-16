import { z } from "zod";

/**
 * Admin-defined customer input fields for a service. Lets administrators create new service types
 * without code changes, while guaranteeing the platform never collects credentials.
 */

// Any field whose key or label suggests a secret is rejected when an admin saves the service.
const FORBIDDEN = /(pass(word|code|phrase)?|pwd|otp|2fa|two.?factor|mfa|cookie|session|recovery|backup.?code|token|secret|pin\b|login|credential)/i;

export const inputFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, "Field keys must be lowercase letters, digits or underscores"),
    label: z.string().min(2).max(80),
    type: z.enum(["url", "text", "textarea", "number", "select", "email"]),
    required: z.boolean().default(true),
    help: z.string().max(240).optional(),
    placeholder: z.string().max(120).optional(),
    options: z.array(z.string().min(1).max(80)).max(30).optional(),
    allowedHosts: z.array(z.string().min(3).max(80)).max(10).optional(), // for url fields, e.g. ["instagram.com"]
    maxLength: z.number().int().min(1).max(5000).optional(),
  })
  .superRefine((f, ctx) => {
    if (FORBIDDEN.test(f.key) || FORBIDDEN.test(f.label)) {
      ctx.addIssue({ code: "custom", message: `"${f.label}" looks like a credential field. BoostSphere never collects passwords, codes or session data.` });
    }
    if (f.type === "select" && !f.options?.length) ctx.addIssue({ code: "custom", message: `Select field "${f.label}" needs options` });
  });

export type InputField = z.infer<typeof inputFieldSchema>;
export const inputFieldsSchema = z.array(inputFieldSchema).max(20);

export function parseInputFields(json: unknown): InputField[] {
  const r = inputFieldsSchema.safeParse(json);
  return r.success ? r.data : [];
}

function hostAllowed(url: URL, allowed?: string[]) {
  if (!allowed?.length) return true;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return allowed.some((a) => host === a || host.endsWith(`.${a}`));
}

/** Validate customer-supplied values against the service's field definitions. Unknown keys are dropped. */
export function validateInputs(fields: InputField[], raw: Record<string, unknown>): { ok: true; values: Record<string, string> } | { ok: false; errors: { path: string; message: string }[] } {
  const values: Record<string, string> = {};
  const errors: { path: string; message: string }[] = [];
  for (const f of fields) {
    const v = raw[f.key];
    const s = v === undefined || v === null ? "" : String(v).trim();
    const path = `inputs.${f.key}`;
    if (!s) {
      if (f.required) errors.push({ path, message: `${f.label} is required` });
      continue;
    }
    if (s.length > (f.maxLength ?? (f.type === "textarea" ? 2000 : 500))) {
      errors.push({ path, message: `${f.label} is too long` });
      continue;
    }
    if (f.type === "url") {
      let u: URL;
      try {
        u = new URL(s);
      } catch {
        errors.push({ path, message: `${f.label} must be a valid URL (https://…)` });
        continue;
      }
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        errors.push({ path, message: `${f.label} must start with https://` });
        continue;
      }
      if (u.username || u.password) {
        errors.push({ path, message: `${f.label} must not contain login details` });
        continue;
      }
      if (!hostAllowed(u, f.allowedHosts)) {
        errors.push({ path, message: `${f.label} must be a link on ${f.allowedHosts!.join(" or ")}` });
        continue;
      }
    }
    if (f.type === "email" && !z.string().email().safeParse(s).success) {
      errors.push({ path, message: `${f.label} must be a valid email` });
      continue;
    }
    if (f.type === "number" && !/^\d+(\.\d+)?$/.test(s)) {
      errors.push({ path, message: `${f.label} must be a number` });
      continue;
    }
    if (f.type === "select" && !f.options?.includes(s)) {
      errors.push({ path, message: `Choose a valid option for ${f.label}` });
      continue;
    }
    values[f.key] = s;
  }
  return errors.length ? { ok: false, errors } : { ok: true, values };
}
