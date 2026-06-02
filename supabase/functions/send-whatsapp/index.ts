import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Normaliza telefone e extrai apenas os dígitos para envio à Z-API.
 * Cópia da lógica de src/lib/format.ts — necessária aqui pois Edge Functions
 * rodam em Deno isolado, sem acesso ao código do frontend.
 */
function onlyDigits(s: string) { return (s ?? "").replace(/\D+/g, ""); }

function phoneForZApi(raw: string): string {
  if (!raw) return "";
  let digits = onlyDigits(raw);
  // Remove DDI 55 se já presente (ex: "+55 92 9..." → "5592...")
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  if (digits.length < 10 || digits.length > 11) return onlyDigits(raw); // fallback para compatibilidade
  // Z-API espera DDI+DDD+número: "5592991176452"
  return `55${digits}`;
}

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

    const { data: cfg } = await supabase.from("configuracoes").select("z_api_instance, z_api_token, z_api_client_token").eq("user_id", user.id).maybeSingle();
    if (!cfg?.z_api_instance || !cfg?.z_api_token) return json({ error: "Z-API não configurado para este usuário" }, 400);

    // Normaliza o telefone para o formato esperado pela Z-API antes de enviar.
    const normalizedPhone = phoneForZApi(phone);

    const url = `https://api.z-api.io/instances/${cfg.z_api_instance}/token/${cfg.z_api_token}/send-text`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.z_api_client_token ? { "Client-Token": cfg.z_api_client_token } : {}),
      },
      body: JSON.stringify({ phone: normalizedPhone, message }),
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
