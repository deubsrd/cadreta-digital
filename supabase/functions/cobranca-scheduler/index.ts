import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── helpers ────────────────────────────────────────────────────────────────
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

// Variação sutil de texto por tentativa (anti-bloqueio Z-API)
function humanizeTemplate(template: string, tentativa: number): string {
  const prefixes = [
    "",
    "Lembrando que ",
    "Passando para avisar: ",
    "⚠️ Ainda consta em aberto: ",
    "⚠️ Último aviso — ",
  ];
  const prefix = prefixes[Math.min(tentativa - 1, prefixes.length - 1)];
  if (!prefix) return template;
  return template.replace(/^(\s*)(.)/m, `$1${prefix}$2`);
}

// Limite de segurança: para o loop se estiver perto do timeout da Edge Function
// Supabase tem limite de ~400s; usamos 350s como margem de segurança
const START_TIME = Date.now();
function nearTimeout() { return Date.now() - START_TIME > 350_000; }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── main ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Autenticação: shared secret obrigatório (chamado pelo pg_cron)
  const expected = Deno.env.get("SCHEDULER_SECRET");
  if (!expected) {
    return new Response(JSON.stringify({ error: "SCHEDULER_SECRET não configurado" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
  if (req.headers.get("x-scheduler-secret") !== expected) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

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

    // 2. Carrega dados necessários uma única vez
    const periodo = ymd(new Date(nowUtc.getFullYear(), nowUtc.getMonth(), 1));
    const fromDate = periodo;
    const toDate = ymd(new Date(nowUtc.getFullYear(), nowUtc.getMonth() + 1, 0));

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

    if (!cfg) throw new Error("Sem configuração no banco");

    const periodoLabel = new Date(periodo + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    // Monta totais por militar+período (chave: "militar_id|periodo")
    const totalsByMil = new Map<string, { total: number; itens: string[] }>();
    for (const comp of compras ?? []) {
      const d = new Date(comp.data_compra + "T12:00:00Z");
      const compPeriodo = ymd(new Date(d.getFullYear(), d.getMonth(), 1));
      const key = `${comp.militar_id}|${compPeriodo}`;
      const cur = totalsByMil.get(key) ?? { total: 0, itens: [] };
      cur.total += Number(comp.valor);
      cur.itens.push(`${d.toLocaleDateString("pt-BR")} — ${comp.itens} (${brl(Number(comp.valor))})`);
      totalsByMil.set(key, cur);
    }

    // Inadimplentes = militares com pelo menos um mês sem pagamento
    const pagosSet = new Set((pagamentos ?? []).map((p: any) => `${p.militar_id}|${p.periodo}`));
    const inadimplentes = (militares ?? []).filter((m: any) => {
      return [...totalsByMil.keys()].some((k) => k.startsWith(m.id + "|") && !pagosSet.has(k));
    });

    const zapiOk = !!(cfg.z_api_instance && cfg.z_api_token);
    const resultsByAg: Record<number, any> = {};

    // 3. Processa cada agendamento pendente
    for (const ag of agendamentos) {
      if (nearTimeout()) {
        console.warn(`Timeout protection: pulando agendamento ${ag.id}`);
        break;
      }

      const tentativa = ag.id; // id 1–5 representa a tentativa
      const minSeg = Math.max(10, ag.intervalo_min ?? 30);
      const maxSeg = Math.max(minSeg + 5, ag.intervalo_max ?? 120);
      const logs: any[] = [];

      // Marca como executado IMEDIATAMENTE para evitar duplo disparo
      // (caso pg_cron chame a função novamente antes de terminar)
      const { error: markErr } = await admin
        .from("cobranca_agendamentos")
        .update({ executado_at: nowUtc.toISOString() })
        .eq("id", ag.id);

      if (markErr) {
        console.error(`Falha ao marcar agendamento ${ag.id}:`, markErr);
        continue;
      }

      for (let i = 0; i < inadimplentes.length; i++) {
        if (nearTimeout()) {
          console.warn(`Timeout protection: interrompendo loop no militar ${i + 1}/${inadimplentes.length}`);
          break;
        }

        const mil = inadimplentes[i] as any;

        // Reconfirma pagamentos em tempo real por militar (todos os meses)
        const { data: pgCheck } = await admin
          .from("pagamentos")
          .select("periodo")
          .eq("militar_id", mil.id);
        const periodosPagos = new Set((pgCheck ?? []).map((p: any) => p.periodo));

        // Meses ainda pendentes para este militar
        const mesesPendentes: { periodo: string; total: number; itens: string[] }[] = [];
        for (const [p, v] of totalsByMil.entries()) {
          if (p.startsWith(mil.id + "|")) {
            const perStr = p.split("|")[1];
            if (!periodosPagos.has(perStr)) {
              mesesPendentes.push({ periodo: perStr, total: v.total, itens: v.itens });
            }
          }
        }

        if (!mesesPendentes.length) {
          await admin.from("cobranca_logs").insert({ agendamento_id: ag.id, militar_id: mil.id, status: "pulado_pago" });
          logs.push({ status: "pulado_pago" });
          continue;
        }

        const totalGeral = mesesPendentes.reduce((s, m) => s + m.total, 0);
        const isConsolidado = mesesPendentes.length > 1;

        // Monta bloco PIX (consolidado ou por mês)
        const pixPeriodo = isConsolidado ? "consolidado" : mesesPendentes[0].periodo;
        const pixExisting = (pixList ?? []).find((p: any) => p.militar_id === mil.id && p.periodo === pixPeriodo) as any;
        const pixBlock = pixExisting
          ? `\n📱 *PIX Copia e Cola:*\n${pixExisting.copia_cola ?? ""}${pixExisting.ticket_url ? `\n\n🔗 Link: ${pixExisting.ticket_url}` : ""}\n\n_Confirmação automática após o pagamento._`
          : `\nChave PIX: ${cfg.pix_key || "(configurar PIX nas configurações)"}`;

        // Resumo: se consolidado, organiza por mês com label
        const resumo = isConsolidado
          ? mesesPendentes
              .sort((a, b) => a.periodo.localeCompare(b.periodo))
              .map((m) => {
                const label = new Date(m.periodo + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                return `📅 *${label.charAt(0).toUpperCase() + label.slice(1)}* — ${brl(m.total)}\n${m.itens.map((it) => `  • ${it}`).join("\n")}`;
              }).join("\n\n")
          : mesesPendentes[0].itens.join("\n");

        const mesLabel = isConsolidado
          ? `${mesesPendentes.length} meses em aberto`
          : periodoLabel;

        const vars: Record<string, string> = {
          nome: militarLabel(mil),
          mes: mesLabel,
          valor: brl(totalGeral).replace("R$\u00a0", ""),
          resumo,
          pix: pixBlock,
        };

        const msg = Object.entries(vars).reduce(
          (s, [k, v]) => s.replaceAll(`{${k}}`, v),
          humanizeTemplate(cfg.mensagem_template ?? "", tentativa)
        );

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
                body: JSON.stringify({
                  phone: phoneForZApi(mil.telefone ?? ""),
                  message: msg,
                }),
              }
            );
            if (!r.ok) {
              const body = await r.text();
              erroMsg = `Z-API ${r.status}: ${body.slice(0, 200)}`;
              status = "erro";
              console.error(`Z-API erro para ${militarLabel(mil)}: ${erroMsg}`);
            }
          } catch (e) {
            erroMsg = (e as Error).message;
            status = "erro";
          }
        } else {
          // Z-API não configurada — loga como enviado sem enviar
          status = "sem_zapi";
          erroMsg = "Z-API não configurada";
        }

        // Salva log imediatamente após cada envio
        const { error: logErr } = await admin.from("cobranca_logs").insert({
          agendamento_id: ag.id,
          militar_id: mil.id,
          status,
          erro_msg: erroMsg,
        });

        if (logErr) console.error("Erro ao salvar log:", logErr);
        logs.push({ status });

        // Delay aleatório entre mensagens (exceto após o último)
        if (i < inadimplentes.length - 1 && !nearTimeout()) {
          const delaySeg = randInt(minSeg, maxSeg);
          console.log(`Aguardando ${delaySeg}s antes do próximo envio...`);
          await sleep(delaySeg * 1000);
        }
      }

      resultsByAg[ag.id] = {
        total_inadimplentes: inadimplentes.length,
        enviados: logs.filter((l) => l.status === "enviado").length,
        pulados_pago: logs.filter((l) => l.status === "pulado_pago").length,
        erros: logs.filter((l) => l.status === "erro").length,
        sem_zapi: logs.filter((l) => l.status === "sem_zapi").length,
      };
    }

    return new Response(JSON.stringify({ ok: true, periodo, agendamentos: resultsByAg }), {
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
