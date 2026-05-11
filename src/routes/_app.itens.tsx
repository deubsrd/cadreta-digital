import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listItens, upsertItem, deleteItem, listItemPriceHistory, listCompras, type Item } from "@/lib/api";
import { brl, startOfMonth, ymd } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, History, TrendingUp } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/itens")({
  component: ItensPage,
});

function ItensPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("todas");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [historyFor, setHistoryFor] = useState<Item | null>(null);

  const { data: itens = [] } = useQuery({ queryKey: ["itens"], queryFn: listItens });

  // estatísticas mensais
  const monthFrom = ymd(startOfMonth());
  const { data: comprasMes = [] } = useQuery({ queryKey: ["compras-mes-itens", monthFrom], queryFn: () => listCompras({ from: monthFrom }) });
  const stats = useMemo(() => {
    const map = new Map<string, { qtd: number; total: number }>();
    comprasMes.forEach((c) => {
      if (!c.item_id) return;
      const cur = map.get(c.item_id) ?? { qtd: 0, total: 0 };
      cur.qtd += c.quantidade ?? 1;
      cur.total += Number(c.valor);
      map.set(c.item_id, cur);
    });
    return map;
  }, [comprasMes]);

  const categorias = useMemo(() => Array.from(new Set(itens.map((i) => i.categoria).filter(Boolean))) as string[], [itens]);

  const filtered = itens.filter((i) => {
    const s = search.toLowerCase();
    const matchSearch = !s || i.nome.toLowerCase().includes(s) || (i.categoria ?? "").toLowerCase().includes(s);
    const matchCat = cat === "todas" || i.categoria === cat;
    return matchSearch && matchCat;
  });

  const topVendidos = useMemo(() => {
    return [...stats.entries()]
      .map(([id, v]) => ({ item: itens.find((i) => i.id === id), ...v }))
      .filter((x) => x.item)
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 5);
  }, [stats, itens]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Itens</h1>
          <p className="text-sm text-muted-foreground">Cadastro de produtos com preços à vista e fiado</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Novo item</Button>
      </div>

      {topVendidos.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3"><TrendingUp className="h-4 w-4 text-primary" /><h3 className="font-semibold">Mais vendidos do mês</h3></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {topVendidos.map((t) => (
              <div key={t.item!.id} className="rounded-md border bg-muted/30 p-3">
                <div className="font-medium text-sm truncate">{t.item!.nome}</div>
                <div className="text-xs text-muted-foreground">{t.qtd} un · {brl(t.total)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar item..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant={cat === "todas" ? "default" : "outline"} onClick={() => setCat("todas")}>Todas</Button>
            {categorias.map((c) => (
              <Button key={c} size="sm" variant={cat === c ? "default" : "outline"} onClick={() => setCat(c)}>{c}</Button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b text-muted-foreground">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Categoria</th>
                <th className="px-4 py-2 font-medium text-right">À vista</th>
                <th className="px-4 py-2 font-medium text-right">Fiado</th>
                <th className="px-4 py-2 font-medium text-right">Vendidos/mês</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const st = stats.get(i.id);
                return (
                  <tr key={i.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 font-medium">{i.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{i.categoria ?? "—"}</td>
                    <td className="px-4 py-3 text-right">{brl(Number(i.preco_avista))}</td>
                    <td className="px-4 py-3 text-right">{brl(Number(i.preco_fiado))}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{st ? `${st.qtd}` : "—"}</td>
                    <td className="px-4 py-3">{i.ativo ? <Badge>Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => setHistoryFor(i)}><History className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(i); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={async () => {
                        if (!confirm(`Excluir "${i.nome}"?`)) return;
                        try { await deleteItem(i.id); toast.success("Excluído"); qc.invalidateQueries(); }
                        catch (e: any) { toast.error(e.message); }
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhum item cadastrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ItemDialog open={open} setOpen={setOpen} editing={editing} onSaved={() => qc.invalidateQueries()} />
      <HistoryDialog item={historyFor} onClose={() => setHistoryFor(null)} />
    </div>
  );
}

function ItemDialog({ open, setOpen, editing, onSaved }: { open: boolean; setOpen: (b: boolean) => void; editing: Item | null; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precoAv, setPrecoAv] = useState("");
  const [precoFi, setPrecoFi] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  if (open && editing && nome !== editing.nome) {
    setNome(editing.nome); setCategoria(editing.categoria ?? "");
    setPrecoAv(String(editing.preco_avista)); setPrecoFi(String(editing.preco_fiado));
    setAtivo(editing.ativo); setObs(editing.observacoes ?? "");
  }

  const reset = () => { setNome(""); setCategoria(""); setPrecoAv(""); setPrecoFi(""); setAtivo(true); setObs(""); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await upsertItem({
        id: editing?.id,
        nome,
        categoria: categoria.trim() || null,
        preco_avista: parseFloat(precoAv.replace(",", ".")) || 0,
        preco_fiado: parseFloat(precoFi.replace(",", ".")) || 0,
        ativo,
        observacoes: obs || null,
      });
      toast.success(editing ? "Atualizado" : "Cadastrado");
      onSaved(); setOpen(false); reset();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar item" : "Novo item"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>Nome</Label><Input required value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div><Label>Categoria (opcional)</Label><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Bebidas, Lanches..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Preço à vista (R$)</Label><Input required type="number" step="0.01" min="0" inputMode="decimal" value={precoAv} onChange={(e) => setPrecoAv(e.target.value)} /></div>
            <div><Label>Preço fiado (R$)</Label><Input required type="number" step="0.01" min="0" inputMode="decimal" value={precoFi} onChange={(e) => setPrecoFi(e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={ativo} onCheckedChange={setAtivo} id="a" /><Label htmlFor="a">Ativo</Label></div>
          <div><Label>Observações</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const { data: history = [] } = useQuery({
    queryKey: ["item-history", item?.id],
    queryFn: () => listItemPriceHistory(item!.id),
    enabled: !!item,
  });
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Histórico de preços — {item?.nome}</DialogTitle></DialogHeader>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b text-muted-foreground"><th className="py-2">Data</th><th className="text-right">À vista</th><th className="text-right">Fiado</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="py-2">{new Date(h.changed_at).toLocaleString("pt-BR")}</td>
                  <td className="text-right">{brl(Number(h.preco_avista))}</td>
                  <td className="text-right">{brl(Number(h.preco_fiado))}</td>
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Sem alterações registradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
