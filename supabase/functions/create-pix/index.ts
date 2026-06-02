import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { militar_id, periodo, valor, descricao } = await req.json();
    if (!militar_id || !periodo || !valor) return j({ error: "militar_id, periodo, valor obrigatórios" }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return j({ error: "Não autorizado" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Reusa cobrança existente ainda pendente com mesmo valor
    const { data: existing } = await admin.from("pix_cobrancas")
      .select("*").eq("militar_id", militar_id).eq("periodo", periodo).maybeSingle();

    if (existing && existing.status === "paid") {
      const { data: pago } = await admin.from("pagamentos")
        .select("valor").eq("militar_id", militar_id).eq("periodo", periodo).maybeSingle();
      if (pago && Number(pago.valor) >= Number(valor)) return j({ error: "Fatura já paga" }, 400);
    } else if (existing && Number(existing.valor) === Number(valor) && existing.status !== "cancelled") {
      return j({ ok: true, pix: existing, reused: true });
    }

    // Busca config pelo user autenticado (multi-tenant)
    const { data: cfg } = await admin.from("configuracoes")
      .select("mp_access_token, pix_nome")
      .eq("user_id", user.id)
      .maybeSingle();
    const token = cfg?.mp_access_token?.trim();
    if (!token) return j({ error: "Mercado Pago não configurado (mp_access_token)" }, 400);

    const { data: militar } = await admin.from("militares").select("posto, nome_guerra").eq("id", militar_id).maybeSingle();
    const nome = militar ? `${militar.posto} ${militar.nome_guerra}` : "Militar";

    // Label do período — suporta "consolidado" (múltiplos meses)
    const periodoLabel = periodo === "consolidado"
      ? "Débitos consolidados"
      : new Date(periodo + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    const txid = `cad-${militar_id.slice(0, 8)}-${periodo.replace(/-/g, "").slice(0, 8)}-${Date.now().toString(36)}`;
    const idempotencyKey = crypto.randomUUID();

    const mpResp = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        transaction_amount: Number(Number(valor).toFixed(2)),
        description: descricao || `${periodoLabel} - ${nome}`,
        payment_method_id: "pix",
        external_reference: txid,
        payer: { email: "cobranca@cadretadigital.com.br", first_name: nome },
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`,
      }),
    });
    const mpJson = await mpResp.json();
    if (!mpResp.ok) return j({ error: `Mercado Pago ${mpResp.status}: ${JSON.stringify(mpJson)}` }, 502);

    const tx = mpJson.point_of_interaction?.transaction_data ?? {};
    const row = {
      militar_id,
      periodo,
      valor: Number(valor),
      txid,
      mp_payment_id: String(mpJson.id),
      qr_code_base64: tx.qr_code_base64 ?? null,
      copia_cola: tx.qr_code ?? null,
      ticket_url: tx.ticket_url ?? null,
      status: "pending",
      raw: mpJson,
      user_id: user.id,
    };

    if (existing) {
      const { data, error } = await admin.from("pix_cobrancas").update(row).eq("id", existing.id).select().maybeSingle();
      if (error) return j({ error: error.message }, 500);
      return j({ ok: true, pix: data });
    } else {
      const { data, error } = await admin.from("pix_cobrancas" as any).insert(row).select().maybeSingle();
      if (error) return j({ error: error.message }, 500);
      return j({ ok: true, pix: data });
    }
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});
