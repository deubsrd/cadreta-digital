import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── helpers ───────────────────────────────────────────────────────────────
function brl(n: number) { return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function onlyDigits(s: string) { return (s ?? "").replace(/\D+/g, ""); }
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function phoneForZApi(raw: string): string {
  let d = onlyDigits(raw);
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return onlyDigits(raw);
  return `55${d}`;
}
function militarLabel(m: any) { return m ? `${m.posto} ${m.nome_guerra}` : "Desconhecido"; }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// Pequenas variações de texto para cada cobrança (evita mensagem idêntica repetida)
function humanizeTemplate(template: string, tentativa: number): string {
  const prefixes = [
    "", // cobrança 1: sem prefixo extra
    "Lembrando que ",
    "Passando para avisar: ",
    "⚠️ Ainda consta em aberto: ",
    "⚠️ Último aviso — ",
  ];
  const prefix = prefixes[Math.min(tentativa - 1, prefixes.length - 1)];
  if (!prefix) return template;
  // Insere o prefixo no início da primeira linha não-vazia
  return template.replace(/^(\s*)(.)/m, `$1${prefix}$2`);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── main ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const nowUtc = new Date();

    // 1. Busca agendamentos ativos com scheduled_at <= agora e ainda não executados
    const { data: agendamentos, error: agErr } = await admin
      .from("cobranca_agendamentos")
      .select("*")
      .eq("ativo", true)
      .is("executado_at", null)
      .lte("scheduled_at", nowUtc.toISOString())
      .order("scheduled_at", { ascending: true });

    if (agErr) throw agErr;
    if (!agendamentos || agendamentos.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "nenhum agendamento pendente" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // 2. Carrega dados necessários uma vez só
    const now = nowUtc;
    const periodo = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const fromDate = periodo;
    const toDate = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const [
      { data: cfg },
      { data: militares },
      { data: compras },
      { data: pagamentos },
      { data: pixList },
    ] = await Promise.all([
      admin.from("configuracoes").select("*").eq("id", 1).maybeSingle(),
      admin.from("militares").select("*").eq("ativo", true),
      admin.from("compras").select("*").gte("data_compra", fromDate).lte("data_compra", toDate).eq("pago_na_hora", false),
      admin.from("pagamentos").select("*").eq("periodo", periodo),
      admin.from("pix_cobrancas").select("*").eq("periodo", periodo),
    ]);

    if (!cfg) throw new Error("Sem configuração");

    const periodoLabel = new Date(periodo + "T00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    // Monta totais por militar
    const totalsByMil = new Map<string, { total: number; itens: string[] }>();
    for (const c of compras ?? []) {
      const cur = totalsByMil.get(c.militar_id) ?? { total: 0, itens: [] };
      cur.total += Number(c.valor);
      cur.itens.push(`${new Date(c.data_compra + "T00:00").toLocaleDateString("pt-BR")} — ${c.itens} (${brl(Number(c.valor))})`);
      totalsByMil.set(c.militar_id, cur);
    }

    const pagosIds = new Set((pagamentos ?? []).map((p: any) => p.militar_id));

    // Filtra inadimplentes
    const inadimplentes = (militares ?? []).filter((m: any) => {
      const f = totalsByMil.get(m.id);
      return f && f.total > 0 && !pagosIds.has(m.id);
    });

    const zapiOk = cfg.z_api_instance && cfg.z_api_token;

    // 3. Para cada agendamento pendente, dispara as mensagens
    const resultsByAg: Record<number, any> = {};

    for (const ag of agendamentos) {
      const tentativa = ag.id; // id 1–5 = tentativa 1–5
      const minSeg = ag.intervalo_min ?? 30;
      const maxSeg = ag.intervalo_max ?? 120;
      const logs: any[] = [];

      // Marca como executado ANTES de começar (evita duplo disparo se a função demorar > 1 min)
      await admin.from("cobranca_agendamentos")
        .update({ executado_at: nowUtc.toISOString() })
        .eq("id", ag.id);

      for (let i = 0; i < inadimplentes.length; i++) {
        const mil = inadimplentes[i] as any;
        const f = totalsByMil.get(mil.id)!;

        // Verifica novamente se pagou enquanto o loop rodava
        const { data: pgCheck } = await admin.from("pagamentos")
          .select("id").eq("militar_id", mil.id).eq("periodo", periodo).maybeSingle();
        if (pgCheck) {
          logs.push({ militar_id: mil.id, status: "pulado_pago" });
          await admin.from("cobranca_logs").insert({ agendamento_id: ag.id, militar_id: mil.id, status: "pulado_pago" });
          continue;
        }

        // Busca/usa PIX existente
        const pix = (pixList ?? []).find((p: any) => p.militar_id === mil.id) as any;
        const pixBlock = pix
          ? `\n📱 *PIX Copia e Cola:*\n${pix.copia_cola ?? ""}${pix.ticket_url ? `\n\n🔗 Link: ${pix.ticket_url}` : ""}\n\n_Confirmação automática após o pagamento._`
          : `\nChave PIX: ${cfg.pix_key || "(configurar PIX)"}`;

        const vars: Record<string, string> = {
          nome: militarLabel(mil),
          mes: periodoLabel,
          valor: brl(f.total).replace("R$\u00a0", ""),
          resumo: f.itens.join("\n"),
          pix: pixBlock,
        };

        const templateComVariacao = humanizeTemplate(cfg.mensagem_template ?? "", tentativa);
        const msg = Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), templateComVariacao);

        let status = "enviado";
        let erroMsg: string | null = null;

        if (zapiOk) {
          try {
            const r = await fetch(
              `https://api.z-api.io/instances/${cfg.z_api_instance}/token/${cfg.z_api_token}/send-text`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(cfg.z_api_client_token ? { "Client-Token": cfg.z_api_client_token } : {}),
                },
                body: JSON.stringify({ phone: phoneForZApi(mil.telefone ?? ""), message: msg }),
              }
            );
            if (!r.ok) {
              erroMsg = `Z-API ${r.status}: ${(await r.text()).slice(0, 200)}`;
              status = "erro";
            }
          } catch (e) {
            erroMsg = (e as Error).message;
            status = "erro";
          }
        }

        logs.push({ militar_id: mil.id, status, erroMsg });
        await admin.from("cobranca_logs").insert({
          agendamento_id: ag.id,
          militar_id: mil.id,
          status,
          erro_msg: erroMsg,
        });

        // Delay aleatório entre mensagens (exceto após o último)
        if (i < inadimplentes.length - 1) {
          const delaySeg = randInt(minSeg, maxSeg);
          await sleep(delaySeg * 1000);
        }
      }

      resultsByAg[ag.id] = { enviados: logs.filter((l) => l.status === "enviado").length, pulados: logs.filter((l) => l.status === "pulado_pago").length, erros: logs.filter((l) => l.status === "erro").length };
    }

    return new Response(JSON.stringify({ ok: true, agendamentos: resultsByAg }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (e) {
    console.error("cobranca-scheduler error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
