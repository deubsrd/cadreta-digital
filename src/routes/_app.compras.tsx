import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCompras, listMilitares, createCompra, updateCompra, deleteCompra, type Compra } from "@/lib/api";
import { brl, ymd, startOfMonth, endOfMonth } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, FileDown } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_app/compras")({
  component: ComprasPage,
});

function ComprasPage() {
  const qc = useQueryClient();
  const today = new Date();
  const [mes, setMes] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Compra | null>(null);

  const range = useMemo(() => {
    const [y, m] = mes.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return { from: ymd(startOfMonth(d)), to: ymd(endOfMonth(d)) };
  }, [mes]);

  const { data: militares = [] } = useQuery({ queryKey: ["militares"], queryFn: listMilitares });
  const { data: compras = [] } = useQuery({ queryKey: ["compras", range], queryFn: () => listCompras(range) });

  const filtered = compras.filter((c) => {
    const s = search.toLowerCase();
    return !s || c.militares?.nome.toLowerCase().includes(s) || c.militares?.identificacao.toLowerCase().includes(s) || c.itens.toLowerCase().includes(s);
  });

  const totalGeral = filtered.reduce((s, c) => s + Number(c.valor), 0);
  const porMilitar = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((c) => map.set(c.militar_id, (map.get(c.militar_id) ?? 0) + Number(c.valor)));
    return map;
  }, [filtered]);

  const exportXlsx = () => {
    const rows = filtered.map((c) => ({
      Data: c.data_compra,
      Militar: c.militares?.nome,
      Identificação: c.militares?.identificacao,
      Itens: c.itens,
      Valor: Number(c.valor),
      Observações: c.observacoes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compras");
    XLSX.writeFile(wb, `compras-${mes}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Compras</h1>
          <p className="text-sm text-muted-foreground">Caderneta inteligente — registre e edite compras do mês</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportXlsx}><FileDown className="h-4 w-4 mr-2" />Excel</Button>
          <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Nova compra</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar militar ou item..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Input type="month" className="max-w-[180px]" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>

        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b text-muted-foreground">
                <th className="px-4 py-2 font-medium">Data</th>
                <th className="px-4 py-2 font-medium">Militar</th>
                <th className="px-4 py-2 font-medium">Itens</th>
                <th className="px-4 py-2 font-medium text-right">Valor</th>
                <th className="px-4 py-2 font-medium text-right">Total militar</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">{new Date(c.data_compra + "T00:00").toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.militares?.nome}</div>
                    <div className="text-xs text-muted-foreground">{c.militares?.identificacao}</div>
                  </td>
                  <td className="px-4 py-3 max-w-[280px] truncate" title={c.itens}>{c.itens}</td>
                  <td className="px-4 py-3 text-right font-medium">{brl(Number(c.valor))}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{brl(porMilitar.get(c.militar_id) ?? 0)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={async () => {
                      if (!confirm("Excluir compra?")) return;
                      try { await deleteCompra(c.id); toast.success("Compra excluída"); qc.invalidateQueries(); }
                      catch (e: any) { toast.error(e.message); }
                    }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhuma compra no período.</td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td colSpan={3} className="px-4 py-3">Total geral</td>
                  <td className="px-4 py-3 text-right">{brl(totalGeral)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <CompraDialog open={open} setOpen={setOpen} editing={editing} militares={militares} onSaved={() => qc.invalidateQueries()} />
    </div>
  );
}

function CompraDialog({ open, setOpen, editing, militares, onSaved }: any) {
  const [militar_id, setMilitarId] = useState("");
  const [data_compra, setData] = useState(ymd(new Date()));
  const [itens, setItens] = useState("");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  if (open && editing && itens !== editing.itens) {
    setMilitarId(editing.militar_id); setData(editing.data_compra); setItens(editing.itens);
    setValor(String(editing.valor)); setObs(editing.observacoes ?? "");
  }

  const reset = () => { setMilitarId(""); setData(ymd(new Date())); setItens(""); setValor(""); setObs(""); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { militar_id, data_compra, itens, valor: parseFloat(valor.replace(",", ".")), observacoes: obs || null };
      if (editing) await updateCompra(editing.id, payload);
      else await createCompra(payload);
      toast.success(editing ? "Atualizada" : "Registrada");
      onSaved(); setOpen(false); reset();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar compra" : "Nova compra"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Militar</Label>
            <Select value={militar_id} onValueChange={setMilitarId} required>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {militares.filter((m: any) => m.ativo).map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.nome} — {m.identificacao}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data</Label><Input type="date" required value={data_compra} onChange={(e) => setData(e.target.value)} /></div>
            <div><Label>Valor (R$)</Label><Input required type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
          </div>
          <div><Label>Itens</Label><Textarea required rows={2} value={itens} onChange={(e) => setItens(e.target.value)} placeholder="Ex.: 1 refrigerante, 1 salgado..." /></div>
          <div><Label>Observações</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy || !militar_id}>{busy ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
