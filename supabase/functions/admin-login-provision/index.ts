import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function secretKey(): string {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    const keys = JSON.parse(modern);
    if (keys.default) return keys.default;
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("Server credential unavailable");
  return legacy;
}

function provisioningConfig(): { email: string; passwordHash: string } {
  const email = String(Deno.env.get("ADMIN_OWNER_EMAIL") || "").trim().toLowerCase();
  const passwordHash = String(Deno.env.get("ADMIN_PROVISION_PASSWORD_HASH") || "").trim();
  if (!email || !passwordHash) {
    throw new Error("Administrator provisioning is not configured on this deployment");
  }
  return { email, passwordHash };
}

async function fingerprint(request: Request): Promise<string> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const agent = request.headers.get("user-agent") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ip}|${agent}|friend-exchange-admin`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const configured = provisioningConfig();
    if (email !== configured.email || password.length < 8) {
      return json({ error: "Invalid administrator credentials" }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL");
    if (!url) throw new Error("SUPABASE_URL unavailable");
    const admin = createClient(url, secretKey(), { auth: { autoRefreshToken: false, persistSession: false } });
    const db = admin.schema("friend_exchange");
    const key = await fingerprint(request);
    const { data: permitted, error: limitError } = await db.rpc("consume_guest_auth_attempt", {
      p_fingerprint: `admin:${key}`,
      p_limit: 10,
      p_window: "01:00:00",
    });
    if (limitError) throw limitError;
    if (!permitted) return json({ error: "Too many administrator login attempts. Try again later." }, 429);

    const { data: existingAdmins, error: adminReadError } = await db
      .from("app_admins")
      .select("user_id")
      .eq("role", "owner")
      .eq("active", true)
      .limit(1);
    if (adminReadError) throw adminReadError;
    if (existingAdmins?.length) {
      return json({ error: "Owner account is already provisioned. Use normal sign in." }, 409);
    }
    if (!(await bcrypt.compare(password, configured.passwordHash))) {
      return json({ error: "Invalid administrator credentials" }, 401);
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { app: "friend-exchange", admin: true, must_change_password: true },
    });
    if (createError) throw createError;

    const { error: roleError } = await db.from("app_admins").insert({
      user_id: created.user.id,
      role: "owner",
      active: true,
      created_by: created.user.id,
    });
    if (roleError) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw roleError;
    }
    return json({ provisioned: true }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
