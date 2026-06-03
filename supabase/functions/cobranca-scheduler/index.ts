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
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function humanizeTemplate(template: string, tentativa: number): string {
  const prefixes = ["", "Lembrando que ", "Passando para avisar: ", "⚠️ Ainda consta em aberto: ", "⚠️ Último aviso — "];
  const prefix = prefixes[Math.min(tentativa - 1, prefixes.length - 1)];
  if (!prefix) return template;
  return template.replace(/^(\s*)(.)/m, `$1${prefix}$2`);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-scheduler-secret",
};

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

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

  const nowUtc = new Date();
  const periodo = ymd(new Date(nowUtc.getFullYear(), nowUtc.getMonth(), 1));
  const fromDate = periodo;
  const toDate = ymd(new Date(nowUtc.getFullYear(), nowUtc.getMonth() + 1, 0));
  const periodoLabel = new Date(periodo + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  // ── FASE 1: Popular fila para agendamentos que chegou a hora ──────────────
  const { data: agendamentos } = await admin
    .from("cobranca_agendamentos")
    .select("*")
    .eq("ativo", true)
    .is("executado_at", null)
    .lte("scheduled_at", nowUtc.toISOString())
    .order("scheduled_at", { ascending: true });

  if (agendamentos && agendamentos.length > 0) {
    // Agrupa por tenant
    const porTenant = new Map<string, any[]>();
    for (const ag of agendamentos) {
      if (!ag.user_id) continue;
      if (!porTenant.has(ag.user_id)) porTenant.set(ag.user_id, []);
      porTenant.get(ag.user_id)!.push(ag);
    }

    for (const [tenantUid, ags] of porTenant.entries()) {
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

      if (!cfg) continue;

      // Monta totais por militar+período
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

      for (const ag of ags) {
        // Marca agendamento como executado imediatamente (evita duplo disparo)
        await admin.from("cobranca_agendamentos")
          .update({ executado_at: nowUtc.toISOString() })
          .eq("id", ag.id).eq("user_id", tenantUid);

        const tentativa = ag.id;
        const minSeg = Math.max(10, ag.intervalo_min ?? 30);
        const maxSeg = Math.max(minSeg + 5, ag.intervalo_max ?? 120);

        // Monta fila com delay escalonado entre cada item
        const filaRows: any[] = [];
        let delayAcumulado = 0;

        for (const mil of inadimplentes as any[]) {
          // Verifica se já existe na fila para este agendamento
          const { data: jaExiste } = await admin.from("cobranca_fila")
            .select("id").eq("agendamento_id", ag.id).eq("militar_id", mil.id).maybeSingle();
          if (jaExiste) continue;

          // Meses pendentes
          const mesesPendentes: { periodo: string; total: number; itens: string[] }[] = [];
          for (const [p, v] of totalsByMil.entries()) {
            if (p.startsWith(mil.id + "|") && !pagosSet.has(p)) {
              mesesPendentes.push({ periodo: p.split("|")[1], total: v.total, itens: v.itens });
            }
          }
          if (!mesesPendentes.length) continue;

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

          // Calcula quando este item deve ser enviado (agora + delay acumulado)
          const proximaTentativa = new Date(nowUtc.getTime() + delayAcumulado * 1000);
          delayAcumulado += randInt(minSeg, maxSeg);

          filaRows.push({
            user_id: tenantUid,
            agendamento_id: ag.id,
            militar_id: mil.id,
            mensagem: msg,
            status: "pendente",
            proxima_tentativa_at: proximaTentativa.toISOString(),
          });
        }

        if (filaRows.length > 0) {
          await admin.from("cobranca_fila").insert(filaRows);
          console.log(`Agendamento ${ag.id} (tenant ${tenantUid.slice(0,8)}): ${filaRows.length} itens na fila`);
        }
      }
    }
  }

  // ── FASE 2: Processar itens pendentes da fila que já passaram do horário ──
  // Pega até 5 itens por execução (cron roda a cada minuto)
  const { data: filaPendente } = await admin
    .from("cobranca_fila")
    .select("*, militares(telefone, posto, nome_guerra), configuracoes!cobranca_fila_user_id_fkey(z_api_instance, z_api_token, z_api_client_token)")
    .eq("status", "pendente")
    .lte("proxima_tentativa_at", nowUtc.toISOString())
    .order("proxima_tentativa_at", { ascending: true })
    .limit(5);

  const resultadoEnvios: any[] = [];

  for (const item of filaPendente ?? []) {
    // Verifica se militar já pagou antes de enviar
    const { data: pgCheck } = await admin.from("pagamentos")
      .select("id").eq("militar_id", item.militar_id).eq("user_id", item.user_id).limit(1);

    if (pgCheck && pgCheck.length > 0) {
      await admin.from("cobranca_fila").update({ status: "pulado", enviado_at: nowUtc.toISOString() }).eq("id", item.id);
      await admin.from("cobranca_logs").insert({ agendamento_id: item.agendamento_id, militar_id: item.militar_id, status: "pulado_pago", user_id: item.user_id });
      resultadoEnvios.push({ id: item.id, status: "pulado" });
      continue;
    }

    const cfg = (item as any).configuracoes;
    const telefone = (item as any).militares?.telefone ?? "";

    if (!cfg?.z_api_instance || !cfg?.z_api_token) {
      await admin.from("cobranca_fila").update({ status: "erro", erro_msg: "Z-API não configurado", tentativas: item.tentativas + 1 }).eq("id", item.id);
      await admin.from("cobranca_logs").insert({ agendamento_id: item.agendamento_id, militar_id: item.militar_id, status: "sem_zapi", erro_msg: "Z-API não configurado", user_id: item.user_id });
      resultadoEnvios.push({ id: item.id, status: "sem_zapi" });
      continue;
    }

    let status = "enviado";
    let erroMsg: string | null = null;

    try {
      const r = await fetch(
        `https://api.z-api.io/instances/${cfg.z_api_instance}/token/${cfg.z_api_token}/send-text`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cfg.z_api_client_token ? { "Client-Token": cfg.z_api_client_token } : {}),
          },
          body: JSON.stringify({ phone: phoneForZApi(telefone), message: item.mensagem }),
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

    await admin.from("cobranca_fila").update({
      status,
      erro_msg: erroMsg,
      enviado_at: status === "enviado" ? nowUtc.toISOString() : null,
      tentativas: item.tentativas + 1,
      // Se deu erro, tenta novamente em 5 minutos
      proxima_tentativa_at: status === "erro" ? new Date(nowUtc.getTime() + 5 * 60 * 1000).toISOString() : null,
    }).eq("id", item.id);

    await admin.from("cobranca_logs").insert({
      agendamento_id: item.agendamento_id,
      militar_id: item.militar_id,
      status,
      erro_msg: erroMsg,
      user_id: item.user_id,
    });

    resultadoEnvios.push({ id: item.id, status });
    console.log(`Fila ${item.id}: ${status}${erroMsg ? ` — ${erroMsg}` : ""}`);
  }

  return json({
    ok: true,
    agendamentos_populados: agendamentos?.length ?? 0,
    envios: resultadoEnvios.length,
    resultados: resultadoEnvios,
  });
});
