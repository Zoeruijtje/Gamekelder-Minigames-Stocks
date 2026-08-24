import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });

  return new Response(JSON.stringify({
    error: "This endpoint has been retired. Use guest-auth-v2.",
  }), {
    status: 410,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
});
