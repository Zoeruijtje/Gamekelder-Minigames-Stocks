import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

function serviceKey(): string {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Service role key unavailable");
  return key;
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function requestFingerprint(request: Request): Promise<string> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  const raw = new TextEncoder().encode(`${forwarded}|${userAgent}|friend-exchange-v1`);
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

  try {
    const { display_name: displayNameInput = "Guest" } = await request.json().catch(() => ({}));
    const displayName = String(displayNameInput).trim().slice(0, 24) || "Guest";
    const url = Deno.env.get("SUPABASE_URL");
    if (!url) throw new Error("Project URL unavailable");

    const admin = createClient(url, serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const db = admin.schema("friend_exchange");
    const fingerprint = await requestFingerprint(request);
    const { data: permitted, error: limitError } = await db.rpc("consume_guest_auth_attempt", {
      p_fingerprint: fingerprint,
      p_limit: 20,
      p_window: "01:00:00",
    });
    if (limitError) throw limitError;
    if (!permitted) {
      return response({ error: "Too many guest accounts from this device. Try again later." }, 429);
    }

    const id = crypto.randomUUID();
    const email = `guest-${id}@friend-exchange.invalid`;
    const password = randomPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName, app: "friend-exchange", guest: true },
    });
    if (error) throw error;

    return response({
      email,
      password,
      user_id: data.user.id,
      display_name: displayName,
    }, 201);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
