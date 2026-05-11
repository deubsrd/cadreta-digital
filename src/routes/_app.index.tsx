import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listCompras, listPagamentos, listMilitares, militarLabel } from "@/lib/api";
import { brl, monthLabel, startOfMonth, ymd } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { TrendingUp, Users, AlertTriangle, CheckCircle2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { useMemo } from "react";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
});

function Dashboard() {
  const { data: militares = [] } = useQuery({ queryKey: ["militares"], queryFn: listMilitares });
  const { data: compras = [] } = useQuery({ queryKey: ["compras"], queryFn: () => listCompras() });
  const { data: pagamentos = [] } = useQuery({ queryKey: ["pagamentos"], queryFn: listPagamentos });

  const stats = useMemo(() => {
    const start = startOfMonth();
    const startStr = ymd(start);
    const comprasMes = compras.filter((c) => c.data_compra >= startStr);
    const totalMes = comprasMes.reduce((s, c) => s + Number(c.valor), 0);
    const periodoStr = ymd(start);
    const pagosNoMes = pagamentos.filter((p) => p.periodo === periodoStr);
    const pagosMilitarIds = new Set(pagosNoMes.map((p) => p.militar_id));
    const totalPago = pagosNoMes.reduce((s, p) => s + Number(p.valor), 0);

    // por militar no mês
    const porMilitar = new Map<string, number>();
    comprasMes.forEach((c) => porMilitar.set(c.militar_id, (porMilitar.get(c.militar_id) ?? 0) + Number(c.valor)));

    const inadimplentes = [...porMilitar.entries()].filter(([id]) => !pagosMilitarIds.has(id));
    const ranking = inadimplentes
      .map(([id, val]) => ({ id, val, militar: militares.find((m) => m.id === id) }))
      .sort((a, b) => b.val - a.val)
      .slice(0, 5);

    const aReceber = inadimplentes.reduce((s, [, v]) => s + v, 0);

    // últimos 6 meses para gráfico
    const meses: { label: string; total: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const ms = startOfMonth(d);
      const me = new Date(ms.getFullYear(), ms.getMonth() + 1, 0);
      const total = compras
        .filter((c) => c.data_compra >= ymd(ms) && c.data_compra <= ymd(me))
        .reduce((s, c) => s + Number(c.valor), 0);
      meses.push({ label: ms.toLocaleDateString("pt-BR", { month: "short" }), total });
    }

    return { totalMes, totalPago, aReceber, inadimplentes: inadimplentes.length, pagosCount: pagosNoMes.length, ranking, meses };
  }, [compras, pagamentos, militares]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground capitalize">{monthLabel(new Date())}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="A receber" value={brl(stats.aReceber)} icon={TrendingUp} tone="primary" />
        <StatCard label="Inadimplentes" value={String(stats.inadimplentes)} icon={AlertTriangle} tone="warning" />
        <StatCard label="Pagos no mês" value={String(stats.pagosCount)} icon={CheckCircle2} tone="success" />
        <StatCard label="Militares ativos" value={String(militares.filter((m) => m.ativo).length)} icon={Users} tone="muted" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold mb-4">Vendas por mês</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={stats.meses}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `R$${v}`} />
                <Tooltip formatter={(v: any) => brl(Number(v))} contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Bar dataKey="total" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
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
                    { name: "Pago", value: stats.totalPago },
                    { name: "Pendente", value: stats.aReceber },
                  ]}
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
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

      <Card className="p-5">
        <h3 className="font-semibold mb-4">Top devedores do mês</h3>
        {stats.ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum devedor neste mês.</p>
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
          <div className="text-2xl font-semibold mt-1">{value}</div>
        </div>
        <div className={`h-9 w-9 rounded-md flex items-center justify-center ${toneCls}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}
