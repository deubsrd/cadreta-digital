import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { phone, message } = await req.json();
    if (!phone || !message) return json({ error: "phone e message são obrigatórios" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Não autorizado" }, 401);

    const { data: cfg } = await supabase.from("configuracoes").select("z_api_instance, z_api_token, z_api_client_token").eq("id", 1).maybeSingle();
    if (!cfg?.z_api_instance || !cfg?.z_api_token) return json({ error: "Z-API não configurado" }, 400);

    const url = `https://api.z-api.io/instances/${cfg.z_api_instance}/token/${cfg.z_api_token}/send-text`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.z_api_client_token ? { "Client-Token": cfg.z_api_client_token } : {}),
      },
      body: JSON.stringify({ phone, message }),
    });
    const body = await resp.text();
    if (!resp.ok) return json({ error: `Z-API ${resp.status}: ${body}` }, 502);
    return json({ ok: true, response: body });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}
