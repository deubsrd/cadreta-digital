import { createClient } from "jsr:@supabase/supabase-js@2";

function onlyDigits(s: string) { return (s ?? "").replace(/\D+/g, ""); }
function brl(n: number) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function phoneForZApi(raw: string): string {
  let d = onlyDigits(raw);
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return onlyDigits(raw);
  return `55${d}`;
}

async function notificarAdmin(cfg: any, militar: any, valor: number, periodo: string) {
  if (!cfg?.z_api_instance || !cfg?.z_api_token || !cfg?.admin_phone) return;
  const mesLabel = new Date(periodo + "T00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const msg = `✅ *Pagamento recebido!*\n${militar?.posto ?? ""} ${militar?.nome_guerra ?? "Desconhecido"}\n${brl(valor)} — ${mesLabel}`;
  try {
    await fetch(
      `https://api.z-api.io/instances/${cfg.z_api_instance}/token/${cfg.z_api_token}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cfg.z_api_client_token ? { "Client-Token": cfg.z_api_client_token } : {}),
        },
        body: JSON.stringify({ phone: phoneForZApi(cfg.admin_phone), message: msg }),
      }
    );
  } catch (e) {
    console.error("notificarAdmin error", e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return new Response("ok");
  try {
    const url = new URL(req.url);
    const bodyText = await req.text();
    let payload: any = {};
    try { payload = JSON.parse(bodyText); } catch { /* ignore */ }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Validação obrigatória de assinatura MP
    const secret = Deno.env.get("MP_WEBHOOK_SECRET");
    if (!secret) {
      console.error("MP_WEBHOOK_SECRET não configurado");
      return new Response("Webhook secret not configured", { status: 500 });
    }
    const xSig = req.headers.get("x-signature");
    const xReq = req.headers.get("x-request-id");
    const dataIdQ = url.searchParams.get("data.id") || url.searchParams.get("id");
    if (!xSig || !xReq) {
      return new Response("missing signature headers", { status: 401 });
    }
    {
      const parts = Object.fromEntries(xSig.split(",").map((p) => p.trim().split("=")));
      const manifest = `id:${dataIdQ ?? payload?.data?.id ?? ""};request-id:${xReq};ts:${parts.ts};`;
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
      const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
      if (hex !== parts.v1) {
        await admin.from("pix_cobrancas").update({ raw: { invalid_signature: true, payload } }).eq("mp_payment_id", String(payload?.data?.id ?? "")).then(() => {});
        return new Response("invalid signature", { status: 401 });
      }
    }

    const paymentId = String(payload?.data?.id ?? dataIdQ ?? "");
    if (!paymentId) return new Response("missing payment id");

    const { data: cfg } = await admin.from("configuracoes").select("*").eq("user_id", cobr.user_id).maybeSingle();
    const token = cfg?.mp_access_token?.trim();
    if (!token) return new Response("no token", { status: 500 });

    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!mpResp.ok) return new Response(`mp ${mpResp.status}`, { status: 200 });
    const pay = await mpResp.json();

    const txid = pay.external_reference;
    let { data: cobr } = await admin.from("pix_cobrancas").select("*").eq("txid", txid).maybeSingle();
    if (!cobr) {
      ({ data: cobr } = await admin.from("pix_cobrancas").select("*").eq("mp_payment_id", paymentId).maybeSingle());
    }
    if (!cobr) return new Response("cobranca não encontrada");

    const status = pay.status;
    const paid = Number(pay.transaction_amount);
    const expected = Number(cobr.valor);
    const needs_review = status === "approved" && Math.abs(paid - expected) > 0.01;

    const update: Record<string, unknown> = { mp_payment_id: paymentId, raw: pay, paid_amount: paid };
    if (status === "approved") {
      update.status = needs_review ? "review" : "paid";
      update.paid_at = pay.date_approved ?? new Date().toISOString();
      update.needs_review = needs_review;
    } else if (status === "refunded" || status === "cancelled") {
      update.status = "cancelled";
    } else {
      update.status = status;
    }
    await admin.from("pix_cobrancas").update(update).eq("id", cobr.id);

    if (status === "approved" && !needs_review) {
      await admin.from("pagamentos").upsert({
        militar_id: cobr.militar_id,
        periodo: cobr.periodo,
        valor: paid,
        observacoes: `PIX automático MP #${paymentId}`,
      }, { onConflict: "militar_id,periodo" });

      // Notifica admin via WhatsApp
      const { data: militar } = await admin.from("militares").select("*").eq("id", cobr.militar_id).maybeSingle();
      await notificarAdmin(cfg, militar, paid, cobr.periodo);
    }

    return new Response("ok");
  } catch (e) {
    console.error("mp-webhook error", e);
    return new Response((e as Error).message, { status: 500 });
  }
});
