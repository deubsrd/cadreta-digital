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

function humanizeTemplate(template: string, tentativa: number): string {
  const prefixes = ["", "Lembrando que ", "Passando para avisar: ", "⚠️ Ainda consta em aberto: ", "⚠️ Último aviso — "];
  const prefix = prefixes[Math.min(tentativa - 1, prefixes.length - 1)];
  if (!prefix) return template;
  return template.replace(/^(\s*)(.)/m, `$1${prefix}$2`);
}

const START_TIME = Date.now();
function nearTimeout() { return Date.now() - START_TIME > 350_000; }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-scheduler-secret",
};

// ─── main ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expected = Deno.env.get("SCHEDULER_SECRET");
  if (expected && req.headers.get("x-scheduler-secret") !== expected) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const nowUtc = new Date();

    // 1. Busca agendamentos ativos com scheduled_at <= agora e ainda não executados
    //    Inclui user_id para processar cada tenant separadamente
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

    // 2. Agrupa agendamentos por user_id — cada tenant processado isoladamente
    const porTenant = new Map<string, any[]>();
    for (const ag of agendamentos) {
      const uid = ag.user_id;
      if (!uid) continue;
      if (!porTenant.has(uid)) porTenant.set(uid, []);
      porTenant.get(uid)!.push(ag);
    }

    const periodo = ymd(new Date(nowUtc.getFullYear(), nowUtc.getMonth(), 1));
    const fromDate = periodo;
    const toDate = ymd(new Date(nowUtc.getFullYear(), nowUtc.getMonth() + 1, 0));
    const periodoLabel = new Date(periodo + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    const resultsByAg: Record<number, any> = {};

    // 3. Processa cada tenant separadamente — NUNCA mistura dados entre clientes
    for (const [tenantUid, agsDoTenant] of porTenant.entries()) {
      if (nearTimeout()) break;

      // Carrega dados APENAS deste tenant
      const [
        { data: cfg },
        { data: militares },
        { data: compras },
        { data: pagamentos },
      ] = await Promise.all([
        admin.from("configuracoes").select("*").eq("user_id", tenantUid).maybeSingle(),
        admin.from("militares").select("*").eq("user_id", tenantUid).eq("ativo", true),
        admin.from("compras").select("*").eq("user_id", tenantUid).gte("data_compra", fromDate).lte("data_compra", toDate).eq("pago_na_hora", false),
        admin.from("pagamentos").select("*").eq("user_id", tenantUid).eq("periodo", periodo),
      ]);

      if (!cfg) {
        console.warn(`Tenant ${tenantUid} sem configuração — pulando`);
        continue;
      }

      const zapiOk = !!(cfg.z_api_instance && cfg.z_api_token);

      // Monta totais por militar+período para este tenant
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

      const pagosSet = new Set((pagamentos ?? []).map((p: any) => `${p.militar_id}|${p.periodo}`));
      const inadimplentes = (militares ?? []).filter((m: any) =>
        [...totalsByMil.keys()].some((k) => k.startsWith(m.id + "|") && !pagosSet.has(k))
      );

      // Processa agendamentos deste tenant
      for (const ag of agsDoTenant) {
        if (nearTimeout()) break;

        const tentativa = ag.id;
        const minSeg = Math.max(10, ag.intervalo_min ?? 30);
        const maxSeg = Math.max(minSeg + 5, ag.intervalo_max ?? 120);
        const logs: any[] = [];

        // Marca executado antes de começar (evita duplo disparo)
        const { error: markErr } = await admin
          .from("cobranca_agendamentos")
          .update({ executado_at: nowUtc.toISOString() })
          .eq("id", ag.id)
          .eq("user_id", tenantUid);

        if (markErr) { console.error(`Falha ao marcar ag ${ag.id}:`, markErr); continue; }

        for (let i = 0; i < inadimplentes.length; i++) {
          if (nearTimeout()) break;

          const mil = inadimplentes[i] as any;

          // Reconfirma pagamentos em tempo real (apenas deste tenant)
          const { data: pgCheck } = await admin.from("pagamentos")
            .select("periodo").eq("militar_id", mil.id).eq("user_id", tenantUid);
          const periodosPagos = new Set((pgCheck ?? []).map((p: any) => p.periodo));

          const mesesPendentes: { periodo: string; total: number; itens: string[] }[] = [];
          for (const [p, v] of totalsByMil.entries()) {
            if (p.startsWith(mil.id + "|")) {
              const perStr = p.split("|")[1];
              if (!periodosPagos.has(perStr)) mesesPendentes.push({ periodo: perStr, total: v.total, itens: v.itens });
            }
          }

          if (!mesesPendentes.length) {
            await admin.from("cobranca_logs").insert({ agendamento_id: ag.id, militar_id: mil.id, status: "pulado_pago", user_id: tenantUid });
            logs.push({ status: "pulado_pago" });
            continue;
          }

          const totalGeral = mesesPendentes.reduce((s, m) => s + m.total, 0);
          const isConsolidado = mesesPendentes.length > 1;
          const pixKey = cfg.pix_key ? `\nChave PIX: ${cfg.pix_key}` : "\n(configure a chave PIX nas configurações)";

          const resumo = isConsolidado
            ? mesesPendentes.sort((a, b) => a.periodo.localeCompare(b.periodo)).map((m) => {
                const label = new Date(m.periodo + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                return `📅 *${label.charAt(0).toUpperCase() + label.slice(1)}* — ${brl(m.total)}\n${m.itens.map((it) => `  • ${it}`).join("\n")}`;
              }).join("\n\n")
            : mesesPendentes[0].itens.join("\n");

          const vars: Record<string, string> = {
            nome: militarLabel(mil),
            mes: isConsolidado ? `${mesesPendentes.length} meses em aberto` : periodoLabel,
            valor: brl(totalGeral).replace("R$\u00a0", ""),
            resumo,
            pix: pixKey,
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
          } else {
            status = "sem_zapi";
            erroMsg = "Z-API não configurada";
          }

          await admin.from("cobranca_logs").insert({
            agendamento_id: ag.id, militar_id: mil.id, status, erro_msg: erroMsg, user_id: tenantUid,
          });
          logs.push({ status });

          if (i < inadimplentes.length - 1 && !nearTimeout()) {
            await sleep(randInt(minSeg, maxSeg) * 1000);
          }
        }

        resultsByAg[ag.id] = {
          tenant: tenantUid.slice(0, 8),
          enviados: logs.filter((l) => l.status === "enviado").length,
          pulados: logs.filter((l) => l.status === "pulado_pago").length,
          erros: logs.filter((l) => l.status === "erro").length,
          sem_zapi: logs.filter((l) => l.status === "sem_zapi").length,
        };
      }
    }

    return new Response(JSON.stringify({ ok: true, periodo, agendamentos: resultsByAg }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (e) {
    console.error("cobranca-scheduler error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
