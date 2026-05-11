import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCompras, listMilitares, listPagamentos, createCompra, updateCompra, deleteCompra, militarLabel, type Compra, type Militar } from "@/lib/api";
import { brl, ymd, startOfMonth, endOfMonth } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, FileDown, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

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
  const { data: pagamentos = [] } = useQuery({ queryKey: ["pagamentos"], queryFn: listPagamentos });

  const filtered = compras.filter((c) => {
    const s = search.toLowerCase();
    return !s || c.militares?.nome_guerra.toLowerCase().includes(s) || c.militares?.posto.toLowerCase().includes(s) || c.itens.toLowerCase().includes(s);
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
      "Posto/Grad": c.militares?.posto,
      "Nome de guerra": c.militares?.nome_guerra,
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
                    <div className="font-medium">{militarLabel(c.militares)}</div>
                    <div className="text-xs text-muted-foreground">{c.militares?.telefone}</div>
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

      <CompraDialog open={open} setOpen={setOpen} editing={editing} militares={militares} compras={compras} pagamentos={pagamentos} onSaved={() => qc.invalidateQueries()} />
    </div>
  );
}

function CompraDialog({ open, setOpen, editing, militares, compras, pagamentos, onSaved }: { open: boolean; setOpen: (b: boolean) => void; editing: Compra | null; militares: Militar[]; compras: Compra[]; pagamentos: any[]; onSaved: () => void }) {
  const [militar_id, setMilitarId] = useState("");
  const [data_compra, setData] = useState(ymd(new Date()));
  const [itens, setItens] = useState("");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (open && editing && itens !== editing.itens) {
    setMilitarId(editing.militar_id); setData(editing.data_compra); setItens(editing.itens);
    setValor(String(editing.valor)); setObs(editing.observacoes ?? "");
  }

  const reset = () => { setMilitarId(""); setData(ymd(new Date())); setItens(""); setValor(""); setObs(""); };
  const selected = militares.find((m) => m.id === militar_id);

  const periodoStr = ymd(startOfMonth(new Date(data_compra + "T00:00")));
  const historico = compras.filter((c) => c.militar_id === militar_id).slice(0, 5);
  const pendenteMes = useMemo(() => {
    if (!militar_id) return 0;
    const ms = startOfMonth(new Date(data_compra + "T00:00"));
    const me = endOfMonth(ms);
    const total = compras.filter((c) => c.militar_id === militar_id && c.data_compra >= ymd(ms) && c.data_compra <= ymd(me))
      .reduce((s, c) => s + Number(c.valor), 0);
    const pago = pagamentos.find((p) => p.militar_id === militar_id && p.periodo === periodoStr);
    return pago ? 0 : total;
  }, [militar_id, compras, pagamentos, data_compra, periodoStr]);

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
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selected ? militarLabel(selected) : "Buscar por posto ou nome de guerra..."}
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
                  <CommandInput placeholder="Digite o posto ou nome..." />
                  <CommandList>
                    <CommandEmpty>Nenhum militar encontrado.</CommandEmpty>
                    <CommandGroup>
                      {militares.filter((m) => m.ativo).map((m) => (
                        <CommandItem
                          key={m.id}
                          value={`${m.posto} ${m.nome_guerra} ${m.telefone}`}
                          onSelect={() => { setMilitarId(m.id); setPickerOpen(false); }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", militar_id === m.id ? "opacity-100" : "opacity-0")} />
                          <span className="font-medium">{m.posto}</span>
                          <span className="ml-1">{m.nome_guerra}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selected && (
              <div className="mt-2 rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{militarLabel(selected)}</div>
                    <div className="text-xs text-muted-foreground">{selected.telefone}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Pendente do mês</div>
                    <div className={cn("font-semibold", pendenteMes > 0 ? "text-destructive" : "text-success")}>{brl(pendenteMes)}</div>
                  </div>
                </div>
                {historico.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground">Histórico recente ({historico.length})</summary>
                    <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                      {historico.map((h) => (
                        <li key={h.id}>{new Date(h.data_compra + "T00:00").toLocaleDateString("pt-BR")} — {h.itens} ({brl(Number(h.valor))})</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data</Label><Input type="date" required value={data_compra} onChange={(e) => setData(e.target.value)} /></div>
            <div><Label>Valor (R$)</Label><Input required type="number" step="0.01" min="0" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
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
