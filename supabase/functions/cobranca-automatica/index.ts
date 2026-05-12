import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

function brl(n: number) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function onlyDigits(s: string) { return (s ?? "").replace(/\D+/g, ""); }
function ymd(d: Date) { const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,"0"); const dd = String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${dd}`; }

// "now" em horário de Brasília
function nowBR() {
  const s = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
  return new Date(s);
}
function addMonths(d: Date, n: number) { const r = new Date(d); r.setMonth(r.getMonth()+n); return r; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";
    const dryRun = url.searchParams.get("dry") === "1";

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: cfg } = await admin.from("configuracoes").select("*").eq("id", 1).maybeSingle();
    if (!cfg) return j({ error: "Sem configuração" }, 400);

    const now = nowBR();
    const todayStr = ymd(now);
    const proxima = cfg.proxima_cobranca as string | null;
    const horario = (cfg.horario_cobranca ?? "09:00:00").slice(0,5); // HH:MM
    const [hh, mm] = horario.split(":").map(Number);
    const horarioOk = (now.getHours() > hh) || (now.getHours() === hh && now.getMinutes() >= mm);

    if (!force) {
      if (!proxima) return j({ skipped: true, reason: "Sem data de próxima cobrança configurada" });
      if (proxima > todayStr) return j({ skipped: true, reason: `Aguardando ${proxima}` });
      if (!horarioOk) return j({ skipped: true, reason: `Aguardando horário ${horario}` });
    }

    // Período = 1º dia do mês atual
    const periodo = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const fromDate = periodo;
    const toDate = ymd(new Date(now.getFullYear(), now.getMonth()+1, 0));

    // Carrega militares ativos, compras do mês não pagas-na-hora, pagamentos do período
    const [{ data: militares }, { data: compras }, { data: pagamentos }, { data: pixExist }] = await Promise.all([
      admin.from("militares").select("*").eq("ativo", true),
      admin.from("compras").select("*").gte("data_compra", fromDate).lte("data_compra", toDate).eq("pago_na_hora", false),
      admin.from("pagamentos").select("*").eq("periodo", periodo),
      admin.from("pix_cobrancas").select("*").eq("periodo", periodo),
    ]);

    const totalsByMil = new Map<string, { total: number; itens: string[] }>();
    for (const c of (compras ?? [])) {
      const cur = totalsByMil.get(c.militar_id) ?? { total: 0, itens: [] };
      cur.total += Number(c.valor);
      cur.itens.push(`${new Date(c.data_compra+"T00:00").toLocaleDateString("pt-BR")} — ${c.itens} (${brl(Number(c.valor))})`);
      totalsByMil.set(c.militar_id, cur);
    }

    const token = (cfg.mp_access_token ?? "").trim();
    const periodoLabel = new Date(periodo+"T00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    const results: any[] = [];
    for (const mil of (militares ?? [])) {
      const f = totalsByMil.get(mil.id);
      if (!f || f.total <= 0) continue;
      const pago = (pagamentos ?? []).find((p: any) => p.militar_id === mil.id);
      if (pago && Number(pago.valor) >= f.total) { results.push({ militar: mil.nome_guerra, skipped: "já pago" }); continue; }

      let pix = (pixExist ?? []).find((p: any) => p.militar_id === mil.id) as any;
      const needNewPix = !pix || Number(pix.valor) !== Number(f.total) || pix.status === "cancelled";

      if (needNewPix && token && !dryRun) {
        const txid = `cad-${mil.id.slice(0,8)}-${periodo.replace(/-/g,"")}-${Date.now().toString(36)}`;
        try {
          const mpResp = await fetch("https://api.mercadopago.com/v1/payments", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`,
              "X-Idempotency-Key": crypto.randomUUID(),
            },
            body: JSON.stringify({
              transaction_amount: Number(f.total.toFixed(2)),
              description: `Fatura ${periodoLabel} - ${mil.posto} ${mil.nome_guerra}`,
              payment_method_id: "pix",
              external_reference: txid,
              payer: { email: "cobranca@cadretadigital.com.br", first_name: mil.nome_guerra },
              notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`,
            }),
          });
          const mpJson = await mpResp.json();
          if (mpResp.ok) {
            const tx = mpJson.point_of_interaction?.transaction_data ?? {};
            const row = {
              militar_id: mil.id, periodo, valor: Number(f.total), txid,
              mp_payment_id: String(mpJson.id),
              qr_code_base64: tx.qr_code_base64 ?? null,
              copia_cola: tx.qr_code ?? null,
              ticket_url: tx.ticket_url ?? null,
              status: "pending", raw: mpJson,
            };
            if (pix) {
              const { data } = await admin.from("pix_cobrancas").update(row).eq("id", pix.id).select().maybeSingle();
              pix = data;
            } else {
              const { data } = await admin.from("pix_cobrancas").insert(row).select().maybeSingle();
              pix = data;
            }
          } else {
            results.push({ militar: mil.nome_guerra, error: `MP ${mpResp.status}: ${JSON.stringify(mpJson).slice(0,200)}` });
          }
        } catch (e) {
          results.push({ militar: mil.nome_guerra, error: (e as Error).message });
        }
      }

      // Envia WhatsApp
      const pixBlock = pix
        ? `\n📱 *PIX Copia e Cola:*\n${pix.copia_cola ?? ""}${pix.ticket_url ? `\n\n🔗 Link: ${pix.ticket_url}` : ""}\n\n_Confirmação automática após o pagamento._`
        : `\nChave PIX: ${cfg.pix_key || "(configurar PIX)"}`;

      const vars: Record<string,string> = {
        nome: `${mil.posto} ${mil.nome_guerra}`,
        mes: periodoLabel,
        valor: brl(f.total).replace("R$\u00a0",""),
        resumo: f.itens.join("\n"),
        pix: pixBlock,
      };
      const msg = Object.entries(vars).reduce((s,[k,v]) => s.replaceAll(`{${k}}`, v), cfg.mensagem_template ?? "");

      let waOk = false, waErr: string | null = null;
      if (!dryRun && cfg.z_api_instance && cfg.z_api_token) {
        try {
          const r = await fetch(`https://api.z-api.io/instances/${cfg.z_api_instance}/token/${cfg.z_api_token}/send-text`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(cfg.z_api_client_token ? { "Client-Token": cfg.z_api_client_token } : {}) },
            body: JSON.stringify({ phone: onlyDigits(mil.telefone ?? ""), message: msg }),
          });
          waOk = r.ok;
          if (!r.ok) waErr = `Z-API ${r.status}: ${(await r.text()).slice(0,200)}`;
        } catch (e) { waErr = (e as Error).message; }
      }

      results.push({ militar: `${mil.posto} ${mil.nome_guerra}`, total: f.total, pix_status: pix?.status, whatsapp: waOk, whatsapp_error: waErr });
    }

    // Avança proxima_cobranca para o próximo mês (mesmo dia)
    if (!dryRun && proxima) {
      const next = addMonths(new Date(proxima+"T00:00"), 1);
      await admin.from("configuracoes").update({ proxima_cobranca: ymd(next) }).eq("id", 1);
    }

    return j({ ok: true, periodo, processados: results.length, results });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});
