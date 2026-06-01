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
import { CheckCircle2, MessageCircle, RotateCcw, FileDown, QrCode, Copy, Loader2, ExternalLink, Search, X } from "lucide-react";
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

  // Filtros novos
  const [buscaNome, setBuscaNome] = useState("");
  const [buscaPosto, setBuscaPosto] = useState("todos");

  const range = useMemo(() => {
    const [y, m] = mes.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return { from: ymd(startOfMonth(d)), to: ymd(endOfMonth(d)), periodo: ymd(startOfMonth(d)), date: d };
  }, [mes]);

  const { data: militares = [] } = useQuery({ queryKey: ["militares"], queryFn: listMilitares, staleTime: 0, refetchOnMount: true });
  const { data: compras = [] } = useQuery({ queryKey: ["compras", range], queryFn: () => listCompras({ from: range.from, to: range.to }), staleTime: 0, refetchOnMount: true });
  const { data: pagamentos = [] } = useQuery({ queryKey: ["pagamentos"], queryFn: listPagamentos, staleTime: 0, refetchOnMount: true });
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: getConfig, staleTime: 0 });
  const { data: pixList = [] } = useQuery({ queryKey: ["pix_cobrancas"], queryFn: listPixCobrancas, staleTime: 0 });

  // Realtime: atualiza quando webhook MP marcar como pago
  useEffect(() => {
    const ch = supabase.channel("pix_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "pix_cobrancas" }, () => {
        qc.invalidateQueries({ queryKey: ["pix_cobrancas"] });
        qc.invalidateQueries({ queryKey: ["pagamentos"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const faturas = useMemo(() => {
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
  }, [compras, pagamentos, militares, pixList, range.periodo]);

  // Lista de postos únicos para o select
  const postosDisponiveis = useMemo(() => {
    const postos = new Set(faturas.map((f) => f.militar?.posto ?? "").filter(Boolean));
    return [...postos].sort();
  }, [faturas]);

  const filtered = faturas.filter((f) => {
    if (filter === "pagos" && !f.pago) return false;
    if (filter === "pendentes" && !!f.pago) return false;
    if (buscaNome.trim()) {
      const q = buscaNome.trim().toLowerCase();
      const nomeGuerra = f.militar?.nome_guerra?.toLowerCase() ?? "";
      const posto = f.militar?.posto?.toLowerCase() ?? "";
      if (!nomeGuerra.includes(q) && !posto.includes(q)) return false;
    }
    if (buscaPosto && buscaPosto !== "todos") {
      if (f.militar?.posto !== buscaPosto) return false;
    }
    return true;
  });

  const temFiltroAtivo = buscaNome.trim() !== "" || buscaPosto !== "todos";

  const limparFiltros = () => {
    setBuscaNome("");
    setBuscaPosto("todos");
  };

  const [pixDialog, setPixDialog] = useState<{ pix: PixCobranca; nome: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const obterOuGerarPix = async (f: typeof faturas[number]): Promise<PixCobranca | null> => {
    if (f.pix && Number(f.pix.valor) === Number(f.total) && f.pix.status !== "cancelled") return f.pix;
    setBusyId(f.militar_id);
    try {
      const pix = await gerarPix(f.militar_id, range.periodo, f.total, `Fatura ${monthLabel(range.date)} - ${militarLabel(f.militar)}`);
      qc.invalidateQueries({ queryKey: ["pix_cobrancas"] });
      return pix;
    } catch (e: any) { toast.error(e.message); return null; }
    finally { setBusyId(null); }
  };

  const abrirPix = async (f: typeof faturas[number]) => {
    const pix = await obterOuGerarPix(f);
    if (pix) setPixDialog({ pix, nome: militarLabel(f.militar) });
  };

  const enviarWhats = async (f: typeof faturas[number]) => {
    if (!config) return;
    const pix = await obterOuGerarPix(f);

    const pixBlock = pix
      ? `\n📱 *PIX Copia e Cola:*\n${pix.copia_cola ?? ""}${pix.ticket_url ? `\n\n🔗 Link: ${pix.ticket_url}` : ""}\n\n_Confirmação automática após o pagamento._`
      : `\nChave PIX: ${config.pix_key || "(configurar PIX)"}`;

    const msg = buildMessage(config.mensagem_template, {
      nome: militarLabel(f.militar),
      mes: monthLabel(range.date),
      valor: brl(f.total).replace("R$\u00a0", ""),
      resumo: f.itens.join("\n"),
      pix: pixBlock,
    });

    if (config.z_api_instance && config.z_api_token) {
      try {
        const { data, error } = await supabase.functions.invoke("send-whatsapp", {
          body: { phone: onlyDigits(formatBrazilPhone(f.militar?.telefone ?? "") ?? f.militar?.telefone ?? ""), message: msg },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        toast.success("Cobrança enviada via Z-API");
        return;
      } catch (e: any) {
        toast.error(`Falha Z-API: ${e.message}. Abrindo WhatsApp manual.`);
      }
    }
    const phoneDigits = onlyDigits(formatBrazilPhone(f.militar?.telefone ?? "") ?? f.militar?.telefone ?? "");
    const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text(`Faturas — ${monthLabel(range.date)}`, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["Posto/Grad", "Nome de guerra", "Total", "Status"]],
      body: filtered.map((f) => [f.militar?.posto ?? "", f.militar?.nome_guerra ?? "", brl(f.total), f.pago ? "Pago" : "Pendente"]),
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

      {/* Filtros de busca */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Buscar por nome</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nome de guerra..."
                value={buscaNome}
                onChange={(e) => setBuscaNome(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="min-w-[160px]">
            <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1 block">Posto / Graduação</label>
            <Select value={buscaPosto} onValueChange={setBuscaPosto}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os postos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os postos</SelectItem>
                {postosDisponiveis.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {temFiltroAtivo && (
            <Button variant="ghost" size="sm" onClick={limparFiltros} className="text-muted-foreground">
              <X className="h-4 w-4 mr-1" />Limpar filtros
            </Button>
          )}
        </div>
      </Card>

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
                  <Button size="sm" variant="outline" onClick={() => abrirPix(f)} disabled={!!f.pago || busyId === f.militar_id}>
                    {busyId === f.militar_id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <QrCode className="h-4 w-4 mr-1" />}
                    PIX
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => enviarWhats(f)} disabled={!!f.pago || busyId === f.militar_id}>
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
        {filtered.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            {temFiltroAtivo ? "Nenhuma fatura encontrada com esses filtros." : "Nenhuma fatura nesta seleção."}
          </Card>
        )}
      </div>

      <Dialog open={!!pixDialog} onOpenChange={(o) => !o && setPixDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>PIX — {pixDialog?.nome}</DialogTitle>
            <DialogDescription>
              {pixDialog && `${monthLabel(range.date)} · ${brl(Number(pixDialog.pix.valor))}`}
            </DialogDescription>
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
