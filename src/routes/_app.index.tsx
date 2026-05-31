import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCompras, listPagamentos, listMilitares, listItens, listPixCobrancas, militarLabel } from "@/lib/api";
import { brl, monthLabel, startOfMonth, endOfMonth, ymd } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp, Users, AlertTriangle, CheckCircle2, Wallet, Package, QrCode, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
});

type PeriodoPreset = "hoje" | "ontem" | "mes_atual" | "mes_passado" | "personalizado";

function getPeriodRange(preset: PeriodoPreset, customFrom: string, customTo: string): { from: string; to: string; label: string } {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  if (preset === "hoje") {
    const d = ymd(hoje);
    return { from: d, to: d, label: "Hoje" };
  }
  if (preset === "ontem") {
    const d = new Date(hoje); d.setDate(d.getDate() - 1);
    const ds = ymd(d);
    return { from: ds, to: ds, label: "Ontem" };
  }
  if (preset === "mes_atual") {
    return {
      from: ymd(startOfMonth(hoje)),
      to: ymd(endOfMonth(hoje)),
      label: monthLabel(hoje),
    };
  }
  if (preset === "mes_passado") {
    const mp = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    return {
      from: ymd(startOfMonth(mp)),
      to: ymd(endOfMonth(mp)),
      label: monthLabel(mp),
    };
  }
  // personalizado
  return { from: customFrom, to: customTo, label: `${customFrom} → ${customTo}` };
}

const PRESETS: { value: PeriodoPreset; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "ontem", label: "Ontem" },
  { value: "mes_atual", label: "Mês atual" },
  { value: "mes_passado", label: "Mês passado" },
  { value: "personalizado", label: "Personalizado" },
];

function Dashboard() {
  const qc = useQueryClient();
  const hoje = new Date();

  const [preset, setPreset] = useState<PeriodoPreset>("mes_atual");
  const [customFrom, setCustomFrom] = useState(ymd(startOfMonth(hoje)));
  const [customTo, setCustomTo] = useState(ymd(endOfMonth(hoje)));

  const periodo = useMemo(
    () => getPeriodRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const { data: militares = [] } = useQuery({ queryKey: ["militares"], queryFn: listMilitares });
  const { data: compras = [] } = useQuery({ queryKey: ["compras"], queryFn: () => listCompras() });
  const { data: pagamentos = [] } = useQuery({ queryKey: ["pagamentos"], queryFn: listPagamentos });
  const { data: itens = [] } = useQuery({ queryKey: ["itens"], queryFn: listItens });
  const { data: pixList = [] } = useQuery({ queryKey: ["pix_cobrancas"], queryFn: listPixCobrancas });

  useEffect(() => {
    const ch = supabase.channel("dash_pix")
      .on("postgres_changes", { event: "*", schema: "public", table: "pix_cobrancas" }, () => {
        qc.invalidateQueries({ queryKey: ["pix_cobrancas"] });
        qc.invalidateQueries({ queryKey: ["pagamentos"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const pixStats = useMemo(() => {
    const todayIso = new Date(); todayIso.setHours(0, 0, 0, 0);
    const todayStr = todayIso.toISOString();
    const recebidosHoje = pixList.filter((p) => p.status === "paid" && p.paid_at && p.paid_at >= todayStr);
    const totalHoje = recebidosHoje.reduce((s, p) => s + Number(p.paid_amount ?? p.valor), 0);
    const ultimosPagos = pixList.filter((p) => p.status === "paid").slice(0, 5);
    const aguardando = pixList.filter((p) => p.status === "pending").length;
    const revisao = pixList.filter((p) => p.needs_review).length;
    return { recebidosHoje: recebidosHoje.length, totalHoje, ultimosPagos, aguardando, revisao };
  }, [pixList]);

  const stats = useMemo(() => {
    const comprasPeriodo = compras.filter((c) => c.data_compra >= periodo.from && c.data_compra <= periodo.to);
    const comprasFiado = comprasPeriodo.filter((c) => !c.pago_na_hora);
    const comprasNaHora = comprasPeriodo.filter((c) => c.pago_na_hora);

    const faturamentoImediato = comprasNaHora.reduce((s, c) => s + Number(c.valor), 0);

    // Para faturas/pagamentos, usa o início do período como referência de período
    const periodoStr = periodo.from;
    const pagosNoPeriodo = pagamentos.filter((p) => p.periodo >= periodo.from && p.periodo <= periodo.to);
    const pagosMilitarIds = new Set(pagosNoPeriodo.map((p) => p.militar_id));
    const totalPagoFaturas = pagosNoPeriodo.reduce((s, p) => s + Number(p.valor), 0);

    const porMilitar = new Map<string, number>();
    comprasFiado.forEach((c) => porMilitar.set(c.militar_id, (porMilitar.get(c.militar_id) ?? 0) + Number(c.valor)));
    const inadimplentes = [...porMilitar.entries()].filter(([id]) => !pagosMilitarIds.has(id));
    const ranking = inadimplentes
      .map(([id, val]) => ({ id, val, militar: militares.find((m) => m.id === id) }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 5);
    const aReceber = inadimplentes.reduce((s, [, v]) => s + v, 0);

    // top itens
    const itemMap = new Map<string, { qtd: number; total: number }>();
    comprasPeriodo.forEach((c) => {
      if (!c.item_id) return;
      const cur = itemMap.get(c.item_id) ?? { qtd: 0, total: 0 };
      cur.qtd += c.quantidade ?? 1;
      cur.total += Number(c.valor);
      itemMap.set(c.item_id, cur);
    });
    const topItens = [...itemMap.entries()]
      .map(([id, v]) => ({ item: itens.find((i) => i.id === id), ...v }))
      .filter((x) => x.item)
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 5);

    // últimos 6 meses (sempre fixo no histórico, independente do período selecionado)
    const meses: { label: string; naHora: number; fiado: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const ms = startOfMonth(d);
      const me = endOfMonth(d);
      const inRange = compras.filter((c) => c.data_compra >= ymd(ms) && c.data_compra <= ymd(me));
      meses.push({
        label: ms.toLocaleDateString("pt-BR", { month: "short" }),
        naHora: inRange.filter((c) => c.pago_na_hora).reduce((s, c) => s + Number(c.valor), 0),
        fiado: inRange.filter((c) => !c.pago_na_hora).reduce((s, c) => s + Number(c.valor), 0),
      });
    }

    const lucroEstimado = faturamentoImediato + totalPagoFaturas;

    return { faturamentoImediato, totalPagoFaturas, aReceber, inadimplentes: inadimplentes.length, pagosCount: pagosNoPeriodo.length, ranking, meses, topItens, lucroEstimado };
  }, [compras, pagamentos, militares, itens, periodo]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground capitalize">{periodo.label}</p>
        </div>

        {/* Seletor de período */}
        <Card className="p-3">
          <div className="flex items-center gap-1 flex-wrap">
            <Calendar className="h-4 w-4 text-muted-foreground mr-1 shrink-0" />
            {PRESETS.map((p) => (
              <Button
                key={p.value}
                size="sm"
                variant={preset === p.value ? "default" : "ghost"}
                className="h-8 text-xs px-3"
                onClick={() => setPreset(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          {preset === "personalizado" && (
            <div className="flex gap-2 mt-3 items-center flex-wrap">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">De</label>
                <Input type="date" className="h-8 text-xs w-36" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Até</label>
                <Input type="date" className="h-8 text-xs w-36" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Faturamento imediato" value={brl(stats.faturamentoImediato)} icon={Wallet} tone="success" />
        <StatCard label="Pendente fiado" value={brl(stats.aReceber)} icon={TrendingUp} tone="primary" />
        <StatCard label="Recebido (faturas)" value={brl(stats.totalPagoFaturas)} icon={CheckCircle2} tone="success" />
        <StatCard label="Inadimplentes" value={String(stats.inadimplentes)} icon={AlertTriangle} tone="warning" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Receita do período" value={brl(stats.lucroEstimado)} icon={TrendingUp} tone="primary" />
        <StatCard label="Militares ativos" value={String(militares.filter((m) => m.ativo).length)} icon={Users} tone="muted" />
        <StatCard label="Itens cadastrados" value={String(itens.filter((i) => i.ativo).length)} icon={Package} tone="muted" />
        <StatCard label="Pagamentos no período" value={String(stats.pagosCount)} icon={CheckCircle2} tone="success" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold mb-4">Vendas por mês (últimos 6 meses)</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={stats.meses}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v: any) => brl(Number(v))} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="naHora" name="Na hora" stackId="a" fill="var(--color-success)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="fiado" name="Fiado" stackId="a" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-4">Pago vs Pendente</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={[
                    { name: "Recebido", value: stats.faturamentoImediato + stats.totalPagoFaturas },
                    { name: "Pendente", value: stats.aReceber },
                  ]}
                  innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value"
                >
                  <Cell fill="var(--color-success)" />
                  <Cell fill="var(--color-accent)" />
                </Pie>
                <Tooltip formatter={(v: any) => brl(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-semibold mb-4">Top devedores do período</h3>
          {stats.ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum devedor neste período.</p>
          ) : (
            <div className="space-y-2">
              {stats.ranking.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <div className="flex items-center gap-3">
                    <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-semibold">{i + 1}</span>
                    <div>
                      <div className="font-medium">{militarLabel(r.militar)}</div>
                      <div className="text-xs text-muted-foreground">{r.militar?.telefone}</div>
                    </div>
                  </div>
                  <div className="font-semibold text-destructive">{brl(r.val)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold mb-4">Itens mais vendidos no período</h3>
          {stats.topItens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma venda com item registrado.</p>
          ) : (
            <div className="space-y-2">
              {stats.topItens.map((t, i) => (
                <div key={t.item!.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <div className="flex items-center gap-3">
                    <span className="h-7 w-7 rounded-full bg-accent text-accent-foreground text-xs flex items-center justify-center font-semibold">{i + 1}</span>
                    <div>
                      <div className="font-medium">{t.item!.nome}</div>
                      <div className="text-xs text-muted-foreground">{t.qtd} unidade(s)</div>
                    </div>
                  </div>
                  <div className="font-semibold">{brl(t.total)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-semibold flex items-center gap-2"><QrCode className="h-4 w-4" />PIX em tempo real</h3>
          <div className="flex gap-2 flex-wrap text-xs">
            <Badge variant="secondary">Hoje: {pixStats.recebidosHoje} · {brl(pixStats.totalHoje)}</Badge>
            <Badge variant="outline">Aguardando: {pixStats.aguardando}</Badge>
            {pixStats.revisao > 0 && <Badge variant="destructive">Conferir: {pixStats.revisao}</Badge>}
          </div>
        </div>
        {pixStats.ultimosPagos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pagamento PIX recebido ainda.</p>
        ) : (
          <div className="space-y-2">
            {pixStats.ultimosPagos.map((p) => {
              const m = militares.find((x) => x.id === p.militar_id);
              return (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-md bg-muted/50 text-sm">
                  <div>
                    <div className="font-medium">{militarLabel(m)}</div>
                    <div className="text-xs text-muted-foreground">
                      {monthLabel(new Date(p.periodo + "T00:00"))} · {p.paid_at ? new Date(p.paid_at).toLocaleString("pt-BR") : "—"}
                    </div>
                  </div>
                  <div className="font-semibold text-success">{brl(Number(p.paid_amount ?? p.valor))}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; tone: "primary" | "warning" | "success" | "muted" }) {
  const toneCls = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/15 text-warning-foreground",
    success: "bg-success/15 text-success",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="text-xl md:text-2xl font-semibold mt-1">{value}</div>
        </div>
        <div className={`h-9 w-9 rounded-md flex items-center justify-center ${toneCls}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}
