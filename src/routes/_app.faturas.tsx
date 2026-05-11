import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCompras, listPagamentos, listMilitares, marcarPago, desmarcarPago, getConfig } from "@/lib/api";
import { brl, ymd, startOfMonth, endOfMonth, monthLabel, onlyDigits } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { CheckCircle2, MessageCircle, RotateCcw, FileDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_app/faturas")({
  component: FaturasPage,
});

function buildMessage(template: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), template);
}

function FaturasPage() {
  const qc = useQueryClient();
  const today = new Date();
  const [mes, setMes] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [filter, setFilter] = useState<"todos" | "pendentes" | "pagos">("todos");

  const range = useMemo(() => {
    const [y, m] = mes.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return { from: ymd(startOfMonth(d)), to: ymd(endOfMonth(d)), periodo: ymd(startOfMonth(d)), date: d };
  }, [mes]);

  const { data: militares = [] } = useQuery({ queryKey: ["militares"], queryFn: listMilitares });
  const { data: compras = [] } = useQuery({ queryKey: ["compras", range], queryFn: () => listCompras({ from: range.from, to: range.to }) });
  const { data: pagamentos = [] } = useQuery({ queryKey: ["pagamentos"], queryFn: listPagamentos });
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: getConfig });

  const faturas = useMemo(() => {
    const map = new Map<string, { total: number; itens: string[] }>();
    compras.forEach((c) => {
      const cur = map.get(c.militar_id) ?? { total: 0, itens: [] };
      cur.total += Number(c.valor);
      cur.itens.push(`${new Date(c.data_compra + "T00:00").toLocaleDateString("pt-BR")} — ${c.itens} (${brl(Number(c.valor))})`);
      map.set(c.militar_id, cur);
    });
    return [...map.entries()].map(([militar_id, v]) => {
      const militar = militares.find((m) => m.id === militar_id);
      const pago = pagamentos.find((p) => p.militar_id === militar_id && p.periodo === range.periodo);
      return { militar_id, militar, total: v.total, itens: v.itens, pago };
    }).sort((a, b) => (a.militar?.nome ?? "").localeCompare(b.militar?.nome ?? ""));
  }, [compras, pagamentos, militares, range.periodo]);

  const filtered = faturas.filter((f) => filter === "todos" ? true : filter === "pagos" ? !!f.pago : !f.pago);

  const enviarWhats = async (f: typeof faturas[number]) => {
    if (!config) return;
    const msg = buildMessage(config.mensagem_template, {
      nome: f.militar?.nome ?? "",
      mes: monthLabel(range.date),
      valor: brl(f.total).replace("R$\u00a0", ""),
      resumo: f.itens.join("\n"),
      pix: config.pix_key || "(configurar PIX)",
    });

    if (config.z_api_instance && config.z_api_token) {
      try {
        const { data, error } = await supabase.functions.invoke("send-whatsapp", {
          body: { phone: onlyDigits(f.militar?.telefone ?? ""), message: msg },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast.success("Cobrança enviada via Z-API");
        return;
      } catch (e: any) {
        toast.error(`Falha Z-API: ${e.message}. Abrindo WhatsApp manual.`);
      }
    }
    const url = `https://wa.me/${onlyDigits(f.militar?.telefone ?? "")}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(`Faturas — ${monthLabel(range.date)}`, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["Militar", "Identificação", "Total", "Status"]],
      body: filtered.map((f) => [f.militar?.nome ?? "", f.militar?.identificacao ?? "", brl(f.total), f.pago ? "Pago" : "Pendente"]),
    });
    doc.save(`faturas-${mes}.pdf`);
  };

  const totalPendente = filtered.filter((f) => !f.pago).reduce((s, f) => s + f.total, 0);
  const totalPago = filtered.filter((f) => !!f.pago).reduce((s, f) => s + f.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Faturas mensais</h1>
          <p className="text-sm text-muted-foreground capitalize">{monthLabel(range.date)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Input type="month" className="max-w-[180px]" value={mes} onChange={(e) => setMes(e.target.value)} />
          <Button variant="outline" onClick={exportPdf}><FileDown className="h-4 w-4 mr-2" />PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Pendente</div><div className="text-2xl font-semibold mt-1 text-destructive">{brl(totalPendente)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Pago</div><div className="text-2xl font-semibold mt-1 text-success">{brl(totalPago)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Faturas</div><div className="text-2xl font-semibold mt-1">{filtered.length}</div></Card>
      </div>

      <div className="flex gap-2">
        {(["todos", "pendentes", "pagos"] as const).map((k) => (
          <Button key={k} variant={filter === k ? "default" : "outline"} size="sm" onClick={() => setFilter(k)}>
            {k === "todos" ? "Todos" : k === "pendentes" ? "Pendentes" : "Pagos"}
          </Button>
        ))}
      </div>

      <div className="grid gap-3">
        {filtered.map((f) => (
          <Card key={f.militar_id} className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{f.militar?.nome}</h3>
                  {f.pago ? <Badge className="bg-success text-success-foreground">Pago</Badge> : <Badge variant="destructive">Pendente</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{f.militar?.identificacao} · {f.militar?.telefone}</div>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver {f.itens.length} compra(s)</summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">{f.itens.map((i, idx) => <li key={idx}>• {i}</li>)}</ul>
                </details>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold">{brl(f.total)}</div>
                <div className="flex gap-2 mt-2 justify-end">
                  <Button size="sm" variant="outline" onClick={() => enviarWhats(f)} disabled={f.pago}>
                    <MessageCircle className="h-4 w-4 mr-1" /> Cobrar
                  </Button>
                  {f.pago ? (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      try { await desmarcarPago(f.militar_id, range.periodo); toast.success("Reaberto"); qc.invalidateQueries(); }
                      catch (e: any) { toast.error(e.message); }
                    }}><RotateCcw className="h-4 w-4 mr-1" />Reabrir</Button>
                  ) : (
                    <Button size="sm" onClick={async () => {
                      try { await marcarPago({ militar_id: f.militar_id, periodo: range.periodo, valor: f.total }); toast.success("Marcado como pago"); qc.invalidateQueries(); }
                      catch (e: any) { toast.error(e.message); }
                    }}><CheckCircle2 className="h-4 w-4 mr-1" />Marcar pago</Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nenhuma fatura nesta seleção.</Card>}
      </div>
    </div>
  );
}
