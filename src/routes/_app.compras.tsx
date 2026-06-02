import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCompras, listMilitares, listPagamentos, listItens, createComprasBulk, updateCompra, deleteCompra, militarLabel, type Compra, type Militar, type Item } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { brl, ymd, startOfMonth, endOfMonth } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Search, FileDown, Check, ChevronsUpDown, X, Wallet, Clock, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/compras")({
  component: ComprasPage,
});

type CartLine = { item: Item; qtd: number; pago_na_hora: boolean };

function ComprasPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const today = new Date();
  const [mes, setMes] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Compra | null>(null);

  const range = useMemo(() => {
    const [y, m] = mes.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return { from: ymd(startOfMonth(d)), to: ymd(endOfMonth(d)) };
  }, [mes]);

  const { data: militares = [] } = useQuery({ queryKey: ["militares", uid], queryFn: listMilitares });
  const { data: itens = [] } = useQuery({ queryKey: ["itens", uid], queryFn: listItens });
  const { data: compras = [] } = useQuery({ queryKey: ["compras", uid, range], queryFn: () => listCompras(range) });
  const { data: pagamentos = [] } = useQuery({ queryKey: ["pagamentos", uid], queryFn: listPagamentos });

  const filtered = compras.filter((c) => {
    const s = search.toLowerCase();
    return !s || c.militares?.nome_guerra.toLowerCase().includes(s) || c.militares?.posto.toLowerCase().includes(s) || c.itens.toLowerCase().includes(s);
  });

  const totalGeral = filtered.reduce((s, c) => s + Number(c.valor), 0);
  const totalNaHora = filtered.filter((c) => c.pago_na_hora).reduce((s, c) => s + Number(c.valor), 0);
  const totalFiado = totalGeral - totalNaHora;

  const exportXlsx = () => {
    const rows = filtered.map((c) => ({
      Data: c.data_compra,
      "Posto/Grad": c.militares?.posto,
      "Nome de guerra": c.militares?.nome_guerra,
      Itens: c.itens,
      Qtd: c.quantidade,
      Valor: Number(c.valor),
      "Pago na hora": c.pago_na_hora ? "Sim" : "Não",
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
          <p className="text-sm text-muted-foreground">PDV — registre compras pagas na hora ou no fiado</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportXlsx}><FileDown className="h-4 w-4 mr-2" />Excel</Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="h-4 w-4 mr-2" />Importar planilha</Button>
          <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-2" />Nova venda</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground uppercase">Total</div><div className="text-lg md:text-xl font-semibold">{brl(totalGeral)}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground uppercase flex items-center gap-1"><Wallet className="h-3 w-3" />Pago na hora</div><div className="text-lg md:text-xl font-semibold text-success">{brl(totalNaHora)}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground uppercase flex items-center gap-1"><Clock className="h-3 w-3" />Fiado</div><div className="text-lg md:text-xl font-semibold text-destructive">{brl(totalFiado)}</div></Card>
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
                <th className="px-4 py-2 font-medium text-center">Tipo</th>
                <th className="px-4 py-2 font-medium text-right">Valor</th>
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
                  <td className="px-4 py-3 max-w-[280px]">
                    <div className="truncate" title={c.itens}>{c.itens}</div>
                    {c.quantidade > 1 && <div className="text-xs text-muted-foreground">Qtd: {c.quantidade}</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.pago_na_hora
                      ? <Badge className="bg-success text-success-foreground">Na hora</Badge>
                      : <Badge variant="outline">Fiado</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{brl(Number(c.valor))}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={async () => {
                      if (!confirm("Excluir compra?")) return;
                      try { await deleteCompra(c.id); toast.success("Compra excluída"); qc.invalidateQueries({ queryKey: ["compras", uid] }); }
                      catch (e: any) { toast.error(e.message); }
                    }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhuma compra no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <PdvDialog open={open} setOpen={setOpen} editing={editing} militares={militares} itens={itens} compras={compras} pagamentos={pagamentos} onSaved={() => { qc.invalidateQueries({ queryKey: ["compras", uid] }); qc.invalidateQueries({ queryKey: ["pagamentos", uid] }); }} />
      <ImportComprasDialog open={importOpen} setOpen={setImportOpen} militares={militares} onDone={() => qc.invalidateQueries({ queryKey: ["compras", uid] })} />
    </div>
  );
}

function PdvDialog({ open, setOpen, editing, militares, itens, compras, pagamentos, onSaved }: { open: boolean; setOpen: (b: boolean) => void; editing: Compra | null; militares: Militar[]; itens: Item[]; compras: Compra[]; pagamentos: any[]; onSaved: () => void }) {
  const [militar_id, setMilitarId] = useState("");
  const [data_compra, setData] = useState(ymd(new Date()));
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [defaultMode, setDefaultMode] = useState<"avista" | "fiado">("fiado");
  const [cart, setCart] = useState<CartLine[]>([]);

  // Edit mode: free-form single line
  const [editValor, setEditValor] = useState("");
  const [editItens, setEditItens] = useState("");
  const [editPagoNaHora, setEditPagoNaHora] = useState(false);

  if (open && editing && editValor === "" && editing.itens) {
    setMilitarId(editing.militar_id); setData(editing.data_compra);
    setEditItens(editing.itens); setEditValor(String(editing.valor));
    setObs(editing.observacoes ?? ""); setEditPagoNaHora(editing.pago_na_hora);
  }

  const reset = () => {
    setMilitarId(""); setData(ymd(new Date())); setObs("");
    setCart([]); setEditValor(""); setEditItens(""); setEditPagoNaHora(false);
  };
  const selected = militares.find((m) => m.id === militar_id);

  const periodoStr = ymd(startOfMonth(new Date(data_compra + "T00:00")));
  const pendenteMes = useMemo(() => {
    if (!militar_id) return 0;
    const ms = startOfMonth(new Date(data_compra + "T00:00"));
    const me = endOfMonth(ms);
    const total = compras.filter((c) => c.militar_id === militar_id && !c.pago_na_hora && c.data_compra >= ymd(ms) && c.data_compra <= ymd(me))
      .reduce((s, c) => s + Number(c.valor), 0);
    const pago = pagamentos.find((p) => p.militar_id === militar_id && p.periodo === periodoStr);
    return pago ? 0 : total;
  }, [militar_id, compras, pagamentos, data_compra, periodoStr]);

  const addToCart = (it: Item) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.item.id === it.id && l.pago_na_hora === (defaultMode === "avista"));
      if (idx >= 0) {
        const copy = [...prev]; copy[idx] = { ...copy[idx], qtd: copy[idx].qtd + 1 }; return copy;
      }
      return [...prev, { item: it, qtd: 1, pago_na_hora: defaultMode === "avista" }];
    });
    setItemPickerOpen(false);
  };

  const lineValor = (l: CartLine) => (l.pago_na_hora ? Number(l.item.preco_avista) : Number(l.item.preco_fiado)) * l.qtd;
  const totalNaHora = cart.filter((l) => l.pago_na_hora).reduce((s, l) => s + lineValor(l), 0);
  const totalFiado = cart.filter((l) => !l.pago_na_hora).reduce((s, l) => s + lineValor(l), 0);
  const totalCart = totalNaHora + totalFiado;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await updateCompra(editing.id, {
          militar_id, data_compra, itens: editItens,
          valor: parseFloat(editValor.replace(",", ".")),
          observacoes: obs || null, pago_na_hora: editPagoNaHora,
        });
      } else {
        if (!cart.length) { toast.error("Adicione ao menos um item"); setBusy(false); return; }
        const rows = cart.map((l) => ({
          militar_id, data_compra,
          itens: l.qtd > 1 ? `${l.qtd}x ${l.item.nome}` : l.item.nome,
          valor: lineValor(l),
          quantidade: l.qtd,
          item_id: l.item.id,
          pago_na_hora: l.pago_na_hora,
          observacoes: obs || null,
        }));
        await createComprasBulk(rows);
      }
      toast.success(editing ? "Atualizada" : "Venda registrada");
      onSaved(); setOpen(false); reset();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const itensAtivos = itens.filter((i) => i.ativo);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Editar compra" : "Nova venda"}</DialogTitle></DialogHeader>
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
                        <CommandItem key={m.id} value={`${m.posto} ${m.nome_guerra} ${m.telefone}`} onSelect={() => { setMilitarId(m.id); setPickerOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", militar_id === m.id ? "opacity-100" : "opacity-0")} />
                          <span className="font-medium">{m.posto}</span><span className="ml-1">{m.nome_guerra}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selected && (
              <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs flex justify-between">
                <span className="text-muted-foreground">{selected.telefone}</span>
                <span>Pendente: <strong className={pendenteMes > 0 ? "text-destructive" : "text-success"}>{brl(pendenteMes)}</strong></span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data</Label><Input type="date" required value={data_compra} onChange={(e) => setData(e.target.value)} /></div>
            {!editing && (
              <div>
                <Label>Modo padrão</Label>
                <div className="grid grid-cols-2 gap-1 rounded-md border p-1">
                  <button type="button" onClick={() => setDefaultMode("avista")} className={cn("rounded-sm py-1.5 text-xs font-medium", defaultMode === "avista" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>Pago na hora</button>
                  <button type="button" onClick={() => setDefaultMode("fiado")} className={cn("rounded-sm py-1.5 text-xs font-medium", defaultMode === "fiado" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>Fiado</button>
                </div>
              </div>
            )}
          </div>

          {editing ? (
            <>
              <div><Label>Itens (descrição)</Label><Textarea required rows={2} value={editItens} onChange={(e) => setEditItens(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor (R$)</Label><Input required type="number" step="0.01" min="0" inputMode="decimal" value={editValor} onChange={(e) => setEditValor(e.target.value)} /></div>
                <div>
                  <Label>Tipo</Label>
                  <div className="grid grid-cols-2 gap-1 rounded-md border p-1">
                    <button type="button" onClick={() => setEditPagoNaHora(true)} className={cn("rounded-sm py-1.5 text-xs", editPagoNaHora ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>Na hora</button>
                    <button type="button" onClick={() => setEditPagoNaHora(false)} className={cn("rounded-sm py-1.5 text-xs", !editPagoNaHora ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>Fiado</button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Itens</Label>
                  <Popover open={itemPickerOpen} onOpenChange={setItemPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Adicionar item</Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      <Command>
                        <CommandInput placeholder="Buscar item..." />
                        <CommandList>
                          <CommandEmpty>Nenhum item.</CommandEmpty>
                          <CommandGroup>
                            {itensAtivos.map((it) => (
                              <CommandItem key={it.id} value={`${it.nome} ${it.categoria ?? ""}`} onSelect={() => addToCart(it)}>
                                <div className="flex-1">
                                  <div className="font-medium">{it.nome}</div>
                                  <div className="text-xs text-muted-foreground">À vista {brl(Number(it.preco_avista))} · Fiado {brl(Number(it.preco_fiado))}</div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="rounded-md border divide-y max-h-60 overflow-y-auto">
                  {cart.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">Carrinho vazio</div>}
                  {cart.map((l, idx) => (
                    <div key={idx} className="p-2 flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{l.item.nome}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <button type="button" onClick={() => setCart((p) => { const c = [...p]; c[idx] = { ...c[idx], pago_na_hora: !c[idx].pago_na_hora }; return c; })}
                            className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", l.pago_na_hora ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground")}>
                            {l.pago_na_hora ? "Na hora" : "Fiado"}
                          </button>
                          <span className="text-xs text-muted-foreground">{brl(l.pago_na_hora ? Number(l.item.preco_avista) : Number(l.item.preco_fiado))} cada</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => setCart((p) => { const c = [...p]; c[idx] = { ...c[idx], qtd: Math.max(1, c[idx].qtd - 1) }; return c; })}>-</Button>
                        <span className="w-6 text-center text-sm">{l.qtd}</span>
                        <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => setCart((p) => { const c = [...p]; c[idx] = { ...c[idx], qtd: c[idx].qtd + 1 }; return c; })}>+</Button>
                      </div>
                      <div className="w-20 text-right text-sm font-medium">{brl(lineValor(l))}</div>
                      <Button type="button" size="icon" variant="ghost" onClick={() => setCart((p) => p.filter((_, i) => i !== idx))}><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
                {cart.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded bg-muted/50 p-2"><div className="text-muted-foreground">Na hora</div><div className="font-semibold text-success">{brl(totalNaHora)}</div></div>
                    <div className="rounded bg-muted/50 p-2"><div className="text-muted-foreground">Fiado</div><div className="font-semibold text-destructive">{brl(totalFiado)}</div></div>
                    <div className="rounded bg-primary/10 p-2"><div className="text-muted-foreground">Total</div><div className="font-semibold">{brl(totalCart)}</div></div>
                  </div>
                )}
              </div>
            </>
          )}

          <div><Label>Observações</Label><Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy || !militar_id}>{busy ? "Salvando..." : editing ? "Salvar" : `Registrar ${brl(totalCart)}`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ImpRow = {
  data_compra: string;
  militar_nome: string;
  militar_id: string;
  itens: string;
  valor: string;
  quantidade: string;
  pago_na_hora: boolean;
  observacoes: string;
  item_id?: string;
  _error?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseDateCell(v: any): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (!isNaN(d.getTime())) return ymd(d);
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (br) {
    const [, dd, mm, yyRaw] = br;
    const yy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
    return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return ymd(d);
  return s;
}

function parseValor(v: any): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return String(v);
  const s = String(v).replace(/[^\d,.\-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return s;
}

function parseBool(v: any): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "sim" || s === "s" || s === "true" || s === "1" || s === "yes" || s === "y";
}

function ImportComprasDialog({ open, setOpen, militares, onDone }: { open: boolean; setOpen: (b: boolean) => void; militares: Militar[]; onDone: () => void }) {
  const [rows, setRows] = useState<ImpRow[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const militaresByName = useMemo(() => {
    const map = new Map<string, Militar>();
    militares.forEach((m) => map.set(m.nome_guerra.trim().toLowerCase(), m));
    return map;
  }, [militares]);

  const validate = (list: ImpRow[]): ImpRow[] => {
    return list.map((r) => {
      let _error: string | undefined;
      let militar_id = r.militar_id;
      if (!militar_id && r.militar_nome) {
        const found = militaresByName.get(r.militar_nome.trim().toLowerCase());
        if (found) militar_id = found.id;
      }
      const valorNum = parseFloat(r.valor);
      if (!r.data_compra || !/^\d{4}-\d{2}-\d{2}$/.test(r.data_compra)) _error = "Data inválida";
      else if (!militar_id) _error = `Militar não encontrado: ${r.militar_nome || "(vazio)"}`;
      else if (!r.itens?.trim()) _error = "Item vazio";
      else if (!r.valor || isNaN(valorNum) || valorNum <= 0) _error = "Valor inválido";
      else if (r.item_id && !UUID_RE.test(r.item_id)) _error = "item_id inválido";
      return { ...r, militar_id, _error };
    });
  };

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
    const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
    const parsed: ImpRow[] = json.map((r) => {
      const entries = Object.entries(r).map(([k, v]) => [norm(k), v] as const);
      const get = (...keys: string[]) => entries.find(([k]) => keys.includes(k))?.[1] ?? "";
      const dataRaw = get("data", "datacompra", "datadacompra");
      const valorRaw = get("valor", "preco", "preço", "total");
      const qtdRaw = get("quantidade", "qtd");
      const itemIdRaw = String(get("itemid") ?? "").trim();
      return {
        data_compra: parseDateCell(dataRaw),
        militar_nome: String(get("militar", "nomedeguerra", "nomeguerra", "nome") ?? "").trim(),
        militar_id: "",
        itens: String(get("item", "produto", "descricao", "descrição", "itens") ?? "").trim(),
        valor: parseValor(valorRaw),
        quantidade: qtdRaw === "" || qtdRaw === null || qtdRaw === undefined ? "1" : String(qtdRaw),
        pago_na_hora: parseBool(get("pagonahora", "pago")),
        observacoes: String(get("observacoes", "observações", "obs") ?? "").trim(),
        item_id: itemIdRaw || undefined,
      };
    });
    setRows(validate(parsed));
  };

  const updateRow = (i: number, patch: Partial<ImpRow>) => {
    setRows((rs) => validate(rs.map((r, idx) => (idx === i ? { ...r, ...patch, militar_id: patch.militar_nome !== undefined ? "" : r.militar_id } : r))));
  };
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const valid = rows.filter((r) => !r._error);
  const invalid = rows.filter((r) => r._error);

  const confirmar = async () => {
    if (!valid.length) return;
    setBusy(true);
    try {
      const qtd = (r: ImpRow) => Math.max(1, parseInt(r.quantidade, 10) || 1);
      await createComprasBulk(valid.map((r) => ({
        militar_id: r.militar_id,
        data_compra: r.data_compra,
        itens: r.itens,
        valor: parseFloat(r.valor),
        quantidade: qtd(r),
        item_id: r.item_id || null,
        pago_na_hora: r.pago_na_hora,
        observacoes: r.observacoes || null,
      })));
      toast.success(`${valid.length} compra(s) importada(s)`);
      setRows([]); setOpen(false); onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setRows([]); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Importar planilha de compras</DialogTitle>
        </DialogHeader>
        {rows.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A planilha deve conter as colunas: <b>Data</b>, <b>Militar</b> (nome de guerra), <b>Item</b>, <b>Valor</b>, <b>Quantidade</b> (opcional), <b>Pago na hora</b> (Sim/Não), <b>Observações</b> (opcional).
            </p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="hidden" />
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Selecionar arquivo
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3 text-sm">
              <Badge>{valid.length} válidos</Badge>
              {invalid.length > 0 && <Badge variant="destructive">{invalid.length} com erro</Badge>}
            </div>
            <div className="max-h-[55vh] overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-2 w-32">Data</th>
                    <th className="px-2 py-2">Militar</th>
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2 w-16">Qtd</th>
                    <th className="px-2 py-2 w-24">Valor</th>
                    <th className="px-2 py-2 w-20">Na hora</th>
                    <th className="px-2 py-2">Observações</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t ${r._error ? "bg-destructive/5" : ""}`}>
                      <td className="px-2 py-1"><Input className="h-8" type="date" value={r.data_compra} onChange={(e) => updateRow(i, { data_compra: e.target.value })} /></td>
                      <td className="px-2 py-1">
                        <Input className="h-8" value={r.militar_nome} onChange={(e) => updateRow(i, { militar_nome: e.target.value })} />
                        {r._error && <div className="text-xs text-destructive flex items-center gap-1 mt-1"><AlertTriangle className="h-3 w-3" />{r._error}</div>}
                      </td>
                      <td className="px-2 py-1"><Input className="h-8" value={r.itens} onChange={(e) => updateRow(i, { itens: e.target.value })} /></td>
                      <td className="px-2 py-1"><Input className="h-8" type="number" min="1" value={r.quantidade} onChange={(e) => updateRow(i, { quantidade: e.target.value })} /></td>
                      <td className="px-2 py-1"><Input className="h-8" type="number" step="0.01" value={r.valor} onChange={(e) => updateRow(i, { valor: e.target.value })} /></td>
                      <td className="px-2 py-1 text-center">
                        <input type="checkbox" checked={r.pago_na_hora} onChange={(e) => updateRow(i, { pago_na_hora: e.target.checked })} />
                      </td>
                      <td className="px-2 py-1"><Input className="h-8" value={r.observacoes} onChange={(e) => updateRow(i, { observacoes: e.target.value })} /></td>
                      <td className="px-2 py-1 text-right">
                        <Button size="icon" variant="ghost" onClick={() => removeRow(i)}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => { setOpen(false); setRows([]); }}>Cancelar</Button>
          <Button onClick={confirmar} disabled={busy || !valid.length}>{busy ? "Importando..." : `Importar ${valid.length}`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
