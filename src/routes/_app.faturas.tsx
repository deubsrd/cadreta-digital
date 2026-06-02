import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCompras, listPagamentos, listMilitares, marcarPago, desmarcarPago, getConfig, militarLabel, listPixCobrancas, gerarPix, type PixCobranca } from "@/lib/api";
import { brl, ymd, startOfMonth, endOfMonth, monthLabel, onlyDigits, formatBrazilPhone } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, MessageCircle, MessageCircleMore, RotateCcw, FileDown, QrCode, Copy, Loader2, ExternalLink, Search, X, ChevronDown, ChevronUp } from "lucide-react";
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

// ─── Card de fatura de um mês específico ────────────────────────────────────
function FaturaCard({
  faturaId, militar, total, itens, pago, pix, periodo, periodoDate, busyId, setBusyId,
  onPix, onWhats, onMarcarPago, onDesmarcarPago,
}: {
  faturaId: string; militar: any; total: number; itens: string[];
  pago: any; pix: any; periodo: string; periodoDate: Date;
  busyId: string | null; setBusyId: (id: string | null) => void;
  onPix: () => void; onWhats: () => void;
  onMarcarPago: () => void; onDesmarcarPago: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-lg p-3 bg-muted/30">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium capitalize">{monthLabel(periodoDate)}</span>
          {pago
            ? <Badge className="bg-success/20 text-success text-xs">Pago</Badge>
            : <Badge variant="destructive" className="text-xs">Pendente</Badge>}
          {pix?.needs_review && <Badge variant="secondary" className="text-xs">Conferir</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-bold ${pago ? "text-success" : "text-destructive"}`}>{brl(total)}</span>
          <button onClick={() => setOpen((o) => !o)} className="text-muted-foreground hover:text-foreground">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <ul className="text-xs text-muted-foreground space-y-1">
            {itens.map((item, idx) => <li key={idx}>• {item}</li>)}
          </ul>
          {!pago && (
            <div className="flex gap-2 flex-wrap mt-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onPix} disabled={busyId === faturaId}>
                {busyId === faturaId ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <QrCode className="h-3 w-3 mr-1" />}PIX
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onWhats} disabled={busyId === faturaId}>
                <MessageCircle className="h-3 w-3 mr-1" />Cobrar
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={onMarcarPago}>
                <CheckCircle2 className="h-3 w-3 mr-1" />Marcar pago
              </Button>
            </div>
          )}
          {pago && (
            <Button size="sm" variant="ghost" className="h-7 text-xs mt-1" onClick={onDesmarcarPago}>
              <RotateCcw className="h-3 w-3 mr-1" />Reabrir
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
function FaturasPage() {
  const qc = useQueryClient();
  const today = new Date();
  const [mes, setMes] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [filter, setFilter] = useState<"todos" | "pendentes" | "pagos">("todos");
  const [buscaNome, setBuscaNome] = useState("");
  const [buscaPosto, setBuscaPosto] = useState("todos");

  const range = useMemo(() => {
    const [y, m] = mes.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return { from: ymd(startOfMonth(d)), to: ymd(endOfMonth(d)), periodo: ymd(startOfMonth(d)), date: d };
  }, [mes]);

  // Quando há busca por nome, carrega TODAS as compras (sem filtro de data)
  const modoHistorico = buscaNome.trim().length > 0;

  const { data: militares = [] } = useQuery({ queryKey: ["militares"], queryFn: listMilitares, staleTime: 0, refetchOnMount: true });
  const { data: comprasMes = [] } = useQuery({
    queryKey: ["compras", range],
    queryFn: () => listCompras({ from: range.from, to: range.to }),
    staleTime: 0, refetchOnMount: true,
    enabled: !modoHistorico,
  });
  const { data: comprasTodas = [] } = useQuery({
    queryKey: ["compras_todas"],
    queryFn: () => listCompras(),
    staleTime: 0,
    enabled: modoHistorico,
  });
  const compras = modoHistorico ? comprasTodas : comprasMes;

  const { data: pagamentos = [] } = useQuery({ queryKey: ["pagamentos"], queryFn: listPagamentos, staleTime: 0, refetchOnMount: true });
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: getConfig, staleTime: 0 });
  const { data: pixList = [] } = useQuery({ queryKey: ["pix_cobrancas"], queryFn: listPixCobrancas, staleTime: 0 });

  useEffect(() => {
    const ch = supabase.channel("pix_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pix_cobrancas" }, () => {
        qc.invalidateQueries({ queryKey: ["pix_cobrancas"] });
        qc.invalidateQueries({ queryKey: ["pagamentos"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // ── Modo mês: agrupa por militar no mês selecionado ──────────────────────
  const faturasMes = useMemo(() => {
    if (modoHistorico) return [];
    const map = new Map<string, { total: number; itens: string[] }>();
    compras.filter((c) => !c.pago_na_hora).forEach((c) => {
      const cur = map.get(c.militar_id) ?? { total: 0, itens: [] };
      cur.total += Number(c.valor);
      const obs = c.observacoes ? ` — obs: ${c.observacoes}` : "";
      cur.itens.push(`${new Date(c.data_compra + "T00:00").toLocaleDateString("pt-BR")} — ${c.itens} (${brl(Number(c.valor))})${obs}`);
      map.set(c.militar_id, cur);
    });
    return [...map.entries()].map(([militar_id, v]) => {
      const militar = militares.find((m) => m.id === militar_id);
      const pago = pagamentos.find((p) => p.militar_id === militar_id && p.periodo === range.periodo);
      const pix = pixList.find((p) => p.militar_id === militar_id && p.periodo === range.periodo);
      return { militar_id, militar, total: v.total, itens: v.itens, pago, pix };
    }).sort((a, b) => (a.militar?.nome_guerra ?? "").localeCompare(b.militar?.nome_guerra ?? ""));
  }, [compras, pagamentos, militares, pixList, range.periodo, modoHistorico]);

  // ── Modo histórico: agrupa por militar → por mês/período ─────────────────
  const historicoMilitar = useMemo(() => {
    if (!modoHistorico) return [];

    // Filtra militares pelo nome buscado
    const q = buscaNome.trim().toLowerCase();
    const militaresFiltrados = militares.filter((m) => {
      const nome = m.nome_guerra?.toLowerCase() ?? "";
      const posto = m.posto?.toLowerCase() ?? "";
      return nome.includes(q) || posto.includes(q);
    });

    return militaresFiltrados.map((militar) => {
      // Agrupa compras desse militar por período (mês)
      const porPeriodo = new Map<string, { total: number; itens: string[] }>();
      compras
        .filter((c) => c.militar_id === militar.id && !c.pago_na_hora)
        .forEach((c) => {
          const d = new Date(c.data_compra + "T00:00");
          const periodo = ymd(startOfMonth(d));
          const cur = porPeriodo.get(periodo) ?? { total: 0, itens: [] };
          cur.total += Number(c.valor);
          const obs = c.observacoes ? ` — obs: ${c.observacoes}` : "";
          cur.itens.push(`${d.toLocaleDateString("pt-BR")} — ${c.itens} (${brl(Number(c.valor))})${obs}`);
          porPeriodo.set(periodo, cur);
        });

      // Monta lista de meses com status de pagamento
      const meses = [...porPeriodo.entries()]
        .map(([periodo, v]) => {
          const pago = pagamentos.find((p) => p.militar_id === militar.id && p.periodo === periodo);
          const pix = pixList.find((p) => p.militar_id === militar.id && p.periodo === periodo);
          return { periodo, periodoDate: new Date(periodo + "T12:00:00Z"), total: v.total, itens: v.itens, pago, pix };
        })
        .sort((a, b) => b.periodo.localeCompare(a.periodo)); // mais recente primeiro

      const totalPendente = meses.filter((m) => !m.pago).reduce((s, m) => s + m.total, 0);
      const totalGeral = meses.reduce((s, m) => s + m.total, 0);
      const mesesPendentes = meses.filter((m) => !m.pago).length;

      return { militar, meses, totalPendente, totalGeral, mesesPendentes };
    }).filter((r) => r.meses.length > 0); // só mostra quem tem alguma compra
  }, [modoHistorico, buscaNome, militares, compras, pagamentos, pixList]);

  // Postos disponíveis no modo mês
  const postosDisponiveis = useMemo(() => {
    const postos = new Set(faturasMes.map((f) => f.militar?.posto ?? "").filter(Boolean));
    return [...postos].sort();
  }, [faturasMes]);

  // Filtro do modo mês
  const filteredMes = faturasMes.filter((f) => {
    if (filter === "pagos" && !f.pago) return false;
    if (filter === "pendentes" && !!f.pago) return false;
    if (buscaPosto && buscaPosto !== "todos" && f.militar?.posto !== buscaPosto) return false;
    return true;
  });

  const temFiltroAtivo = buscaNome.trim() !== "" || buscaPosto !== "todos";
  const limparFiltros = () => { setBuscaNome(""); setBuscaPosto("todos"); };

  const [pixDialog, setPixDialog] = useState<{ pix: PixCobranca; nome: string; mesLabel: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // ── Gera/reutiliza PIX por período único ────────────────────────────────────
  const obterOuGerarPixPeriodo = async (militar_id: string, periodo: string, total: number, nomeMilitar: string, periodoDate: Date): Promise<PixCobranca | null> => {
    const existing = pixList.find((p) => p.militar_id === militar_id && p.periodo === periodo);
    if (existing && Number(existing.valor) === Number(total) && existing.status !== "cancelled") return existing;
    const fatId = `${militar_id}_${periodo}`;
    setBusyId(fatId);
    try {
      const pix = await gerarPix(militar_id, periodo, total, `Fatura ${monthLabel(periodoDate)} - ${nomeMilitar}`);
      qc.invalidateQueries({ queryKey: ["pix_cobrancas"] });
      return pix;
    } catch (e: any) { toast.error(e.message); return null; }
    finally { setBusyId(null); }
  };

  // ── Gera/reutiliza PIX consolidado (múltiplos meses) ─────────────────────
  const obterOuGerarPixConsolidado = async (militar_id: string, totalConsolidado: number, nomeMilitar: string): Promise<PixCobranca | null> => {
    const periodo = "consolidado";
    const existing = pixList.find((p) => p.militar_id === militar_id && p.periodo === periodo);
    if (existing && Number(existing.valor) === Number(totalConsolidado) && existing.status !== "cancelled") return existing;
    setBusyId(`${militar_id}_consolidado`);
    try {
      const pix = await gerarPix(militar_id, periodo, totalConsolidado, `Débitos consolidados - ${nomeMilitar}`);
      qc.invalidateQueries({ queryKey: ["pix_cobrancas"] });
      return pix;
    } catch (e: any) { toast.error(e.message); return null; }
    finally { setBusyId(null); }
  };

  const handlePix = async (militar: any, periodo: string, total: number, periodoDate: Date) => {
    const pix = await obterOuGerarPixPeriodo(militar.id, periodo, total, militarLabel(militar), periodoDate);
    if (pix) setPixDialog({ pix, nome: militarLabel(militar), mesLabel: monthLabel(periodoDate) });
  };

  const handleWhats = async (militar: any, periodo: string, total: number, itens: string[], periodoDate: Date) => {
    if (!config) return;
    const pix = await obterOuGerarPixPeriodo(militar.id, periodo, total, militarLabel(militar), periodoDate);
    const pixBlock = pix
      ? `\n📱 *PIX Copia e Cola:*\n${pix.copia_cola ?? ""}${pix.ticket_url ? `\n\n🔗 Link: ${pix.ticket_url}` : ""}\n\n_Confirmação automática após o pagamento._`
      : `\nChave PIX: ${config.pix_key || "(configurar PIX)"}`;
    const msg = buildMessage(config.mensagem_template, {
      nome: militarLabel(militar), mes: monthLabel(periodoDate),
      valor: brl(total).replace("R$\u00a0", ""), resumo: itens.join("\n"), pix: pixBlock,
    });
    if (config.z_api_instance && config.z_api_token) {
      try {
        const { data, error } = await supabase.functions.invoke("send-whatsapp", {
          body: { phone: onlyDigits(formatBrazilPhone(militar?.telefone ?? "") ?? militar?.telefone ?? ""), message: msg },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast.success("Cobrança enviada via Z-API");
        return;
      } catch (e: any) { toast.error(`Falha Z-API: ${e.message}. Abrindo WhatsApp manual.`); }
    }
    const phone = onlyDigits(formatBrazilPhone(militar?.telefone ?? "") ?? militar?.telefone ?? "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  // ── Cobrança consolidada: todos os meses pendentes numa mensagem só ───────
  const handleWhatsConsolidado = async (r: typeof historicoMilitar[number]) => {
    if (!config) return;
    const mesesPendentes = r.meses.filter((m) => !m.pago);
    if (!mesesPendentes.length) return;

    const pix = await obterOuGerarPixConsolidado(r.militar.id, r.totalPendente, militarLabel(r.militar));

    const pixBlock = pix
      ? `\n📱 *PIX Copia e Cola:*\n${pix.copia_cola ?? ""}${pix.ticket_url ? `\n\n🔗 Link: ${pix.ticket_url}` : ""}\n\n_Confirmação automática após o pagamento._`
      : `\nChave PIX: ${config.pix_key || "(configurar PIX)"}`;

    // Resumo organizado por mês
    const resumoConsolidado = mesesPendentes.map((m) => {
      const label = m.periodoDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      return `📅 *${label.charAt(0).toUpperCase() + label.slice(1)}* — ${brl(m.total)}\n${m.itens.map((i) => `  • ${i}`).join("\n")}`;
    }).join("\n\n");

    const msg = buildMessage(config.mensagem_template, {
      nome: militarLabel(r.militar),
      mes: `${mesesPendentes.length} meses em aberto`,
      valor: brl(r.totalPendente).replace("R$\u00a0", ""),
      resumo: resumoConsolidado,
      pix: pixBlock,
    });

    if (config.z_api_instance && config.z_api_token) {
      try {
        const { data, error } = await supabase.functions.invoke("send-whatsapp", {
          body: { phone: onlyDigits(formatBrazilPhone(r.militar?.telefone ?? "") ?? r.militar?.telefone ?? ""), message: msg },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast.success("Cobrança consolidada enviada via Z-API");
        return;
      } catch (e: any) { toast.error(`Falha Z-API: ${e.message}. Abrindo WhatsApp manual.`); }
    }
    const phone = onlyDigits(formatBrazilPhone(r.militar?.telefone ?? "") ?? r.militar?.telefone ?? "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handlePixConsolidado = async (r: typeof historicoMilitar[number]) => {
    const pix = await obterOuGerarPixConsolidado(r.militar.id, r.totalPendente, militarLabel(r.militar));
    if (pix) setPixDialog({ pix, nome: militarLabel(r.militar), mesLabel: `${r.mesesPendentes} meses em aberto` });
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(`Faturas — ${monthLabel(range.date)}`, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["Posto/Grad", "Nome de guerra", "Total", "Status"]],
      body: filteredMes.map((f) => [f.militar?.posto ?? "", f.militar?.nome_guerra ?? "", brl(f.total), f.pago ? "Pago" : "Pendente"]),
    });
    doc.save(`faturas-${mes}.pdf`);
  };

  const totalPendenteMes = filteredMes.filter((f) => !f.pago).reduce((s, f) => s + f.total, 0);
  const totalPagoMes = filteredMes.filter((f) => !!f.pago).reduce((s, f) => s + f.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Faturas mensais</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {modoHistorico ? "Histórico completo" : monthLabel(range.date)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!modoHistorico && <Input type="month" className="max-w-[180px]" value={mes} onChange={(e) => setMes(e.target.value)} />}
          {!modoHistorico && <Button variant="outline" onClick={exportPdf}><FileDown className="h-4 w-4 mr-2" />PDF</Button>}
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Buscar por nome</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Nome de guerra..." value={buscaNome} onChange={(e) => setBuscaNome(e.target.value)} className="pl-9" />
            </div>
            {modoHistorico && <p className="text-xs text-primary mt-1">Mostrando histórico completo de todos os meses</p>}
          </div>
          {!modoHistorico && (
            <div className="min-w-[160px]">
              <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Posto / Graduação</label>
              <Select value={buscaPosto} onValueChange={setBuscaPosto}>
                <SelectTrigger><SelectValue placeholder="Todos os postos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os postos</SelectItem>
                  {postosDisponiveis.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {temFiltroAtivo && (
            <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-muted-foreground">
              <X className="h-4 w-4 mr-1" />Limpar filtros
            </Button>
          )}
        </div>
      </Card>

      {/* ── MODO MÊS ── */}
      {!modoHistorico && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Pendente</div><div className="text-2xl font-semibold mt-1 text-destructive">{brl(totalPendenteMes)}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Pago</div><div className="text-2xl font-semibold mt-1 text-success">{brl(totalPagoMes)}</div></Card>
            <Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Faturas</div><div className="text-2xl font-semibold mt-1">{filteredMes.length}</div></Card>
          </div>
          <div className="flex gap-2">
            {(["todos", "pendentes", "pagos"] as const).map((k) => (
              <Button key={k} variant={filter === k ? "default" : "outline"} size="sm" onClick={() => setFilter(k)}>
                {k === "todos" ? "Todos" : k === "pendentes" ? "Pendentes" : "Pagos"}
              </Button>
            ))}
          </div>
          <div className="grid gap-3">
            {filteredMes.map((f) => (
              <Card key={f.militar_id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{militarLabel(f.militar)}</h3>
                      {f.pago ? <Badge className="bg-success text-success-foreground">Pago</Badge> : <Badge variant="destructive">Pendente</Badge>}
                      {f.pix?.needs_review && <Badge variant="secondary">Conferir valor</Badge>}
                      {f.pix && f.pix.status === "pending" && !f.pago && <Badge variant="outline">PIX gerado</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{f.militar?.telefone}</div>
                    <details className="mt-2 text-sm">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver {f.itens.length} compra(s)</summary>
                      <ul className="mt-2 space-y-1 text-muted-foreground">{f.itens.map((i, idx) => <li key={idx}>• {i}</li>)}</ul>
                    </details>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold">{brl(f.total)}</div>
                    <div className="flex gap-2 mt-2 justify-end flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => handlePix(f.militar, range.periodo, f.total, range.date)} disabled={!!f.pago || busyId === `${f.militar_id}_${range.periodo}`}>
                        {busyId === `${f.militar_id}_${range.periodo}` ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <QrCode className="h-4 w-4 mr-1" />}PIX
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleWhats(f.militar, range.periodo, f.total, f.itens, range.date)} disabled={!!f.pago || busyId === `${f.militar_id}_${range.periodo}`}>
                        <MessageCircle className="h-4 w-4 mr-1" />Cobrar
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
            {filteredMes.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">Nenhuma fatura nesta seleção.</Card>
            )}
          </div>
        </>
      )}

      {/* ── MODO HISTÓRICO (busca por nome) ── */}
      {modoHistorico && (
        <div className="grid gap-4">
          {historicoMilitar.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">Nenhum militar encontrado com esse nome.</Card>
          )}
          {historicoMilitar.map((r) => (
            <Card key={r.militar.id} className="p-4">
              {/* Cabeçalho do militar */}
              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                <div>
                  <h3 className="font-semibold text-lg">{militarLabel(r.militar)}</h3>
                  <div className="text-xs text-muted-foreground">{r.militar.telefone}</div>
                </div>
                {/* Resumo financeiro + botões consolidados */}
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-3 flex-wrap text-right">
                    <div>
                      <div className="text-xs text-muted-foreground uppercase">Pendente</div>
                      <div className="text-lg font-bold text-destructive">{brl(r.totalPendente)}</div>
                      <div className="text-xs text-muted-foreground">{r.mesesPendentes} {r.mesesPendentes === 1 ? "mês" : "meses"}</div>
                    </div>
                    <div className="border-l pl-3">
                      <div className="text-xs text-muted-foreground uppercase">Total geral</div>
                      <div className="text-lg font-bold">{brl(r.totalGeral)}</div>
                      <div className="text-xs text-muted-foreground">{r.meses.length} {r.meses.length === 1 ? "mês" : "meses"}</div>
                    </div>
                  </div>
                  {r.mesesPendentes > 1 && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-8 text-xs"
                        onClick={() => handlePixConsolidado(r)}
                        disabled={busyId === `${r.militar.id}_consolidado`}>
                        {busyId === `${r.militar.id}_consolidado`
                          ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          : <QrCode className="h-3 w-3 mr-1" />}
                        PIX total
                      </Button>
                      <Button size="sm" className="h-8 text-xs"
                        onClick={() => handleWhatsConsolidado(r)}
                        disabled={busyId === `${r.militar.id}_consolidado`}>
                        <MessageCircleMore className="h-3 w-3 mr-1" />
                        Cobrar tudo ({brl(r.totalPendente)})
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Lista de meses */}
              <div className="space-y-2">
                {r.meses.map((m) => {
                  const fatId = `${r.militar.id}_${m.periodo}`;
                  return (
                    <FaturaCard
                      key={m.periodo}
                      faturaId={fatId}
                      militar={r.militar}
                      total={m.total}
                      itens={m.itens}
                      pago={m.pago}
                      pix={m.pix}
                      periodo={m.periodo}
                      periodoDate={m.periodoDate}
                      busyId={busyId}
                      setBusyId={setBusyId}
                      onPix={() => handlePix(r.militar, m.periodo, m.total, m.periodoDate)}
                      onWhats={() => handleWhats(r.militar, m.periodo, m.total, m.itens, m.periodoDate)}
                      onMarcarPago={async () => {
                        try { await marcarPago({ militar_id: r.militar.id, periodo: m.periodo, valor: m.total }); toast.success("Marcado como pago"); qc.invalidateQueries(); }
                        catch (e: any) { toast.error(e.message); }
                      }}
                      onDesmarcarPago={async () => {
                        try { await desmarcarPago(r.militar.id, m.periodo); toast.success("Reaberto"); qc.invalidateQueries(); }
                        catch (e: any) { toast.error(e.message); }
                      }}
                    />
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog PIX */}
      <Dialog open={!!pixDialog} onOpenChange={(o) => !o && setPixDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>PIX — {pixDialog?.nome}</DialogTitle>
            <DialogDescription>{pixDialog && `${pixDialog.mesLabel} · ${brl(Number(pixDialog.pix.valor))}`}</DialogDescription>
          </DialogHeader>
          {pixDialog && (
            <div className="space-y-4">
              {pixDialog.pix.qr_code_base64 && (
                <div className="flex justify-center">
                  <img src={`data:image/png;base64,${pixDialog.pix.qr_code_base64}`} alt="QR Code PIX" className="w-56 h-56 rounded border" />
                </div>
              )}
              {pixDialog.pix.ticket_url && (
                <Button size="sm" variant="outline" className="w-full" asChild>
                  <a href={pixDialog.pix.ticket_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />Abrir página de pagamento
                  </a>
                </Button>
              )}
              {pixDialog.pix.copia_cola && (
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase text-muted-foreground">Copia e Cola</div>
                  <div className="text-xs bg-muted p-2 rounded break-all max-h-24 overflow-auto">{pixDialog.pix.copia_cola}</div>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => {
                    navigator.clipboard.writeText(pixDialog.pix.copia_cola!); toast.success("Copiado");
                  }}><Copy className="h-4 w-4 mr-1" />Copiar código PIX</Button>
                </div>
              )}
              <div className="text-xs text-muted-foreground text-center">
                TXID: <code>{pixDialog.pix.txid}</code><br />
                Status: <strong>{pixDialog.pix.status}</strong> · Confirmação automática
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
