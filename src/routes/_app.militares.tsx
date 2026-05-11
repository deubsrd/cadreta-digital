import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listMilitares, upsertMilitar, deleteMilitar, bulkInsertMilitares, militarLabel, type Militar } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Search, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { onlyDigits } from "@/lib/format";
import * as XLSX from "xlsx";

export const Route = createFileRoute("/_app/militares")({
  component: MilitaresPage,
});

function MilitaresPage() {
  const qc = useQueryClient();
  const { data: militares = [] } = useQuery({ queryKey: ["militares"], queryFn: listMilitares });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Militar | null>(null);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const filtered = militares.filter((m) => {
    const s = search.toLowerCase();
    return !s || m.nome_guerra.toLowerCase().includes(s) || m.posto.toLowerCase().includes(s) || m.telefone.includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Militares</h1>
          <p className="text-sm text-muted-foreground">{militares.length} cadastrados</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Importar planilha
          </Button>
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Novo militar
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="relative max-w-sm mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por posto, nome de guerra ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b text-muted-foreground">
                <th className="px-4 py-2 font-medium">Posto/Grad.</th>
                <th className="px-4 py-2 font-medium">Nome de guerra</th>
                <th className="px-4 py-2 font-medium">Telefone</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{m.posto}</td>
                  <td className="px-4 py-3">{m.nome_guerra}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.telefone}</td>
                  <td className="px-4 py-3">
                    {m.ativo ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(m); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={async () => {
                      if (!confirm(`Excluir ${militarLabel(m)}? Todas as compras serão removidas.`)) return;
                      try { await deleteMilitar(m.id); toast.success("Militar excluído"); qc.invalidateQueries(); }
                      catch (e: any) { toast.error(e.message); }
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum militar encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <MilitarDialog open={open} setOpen={setOpen} editing={editing} onSaved={() => qc.invalidateQueries()} />
      <ImportDialog open={importOpen} setOpen={setImportOpen} existing={militares} onDone={() => qc.invalidateQueries()} />
    </div>
  );
}

function MilitarDialog({ open, setOpen, editing, onSaved }: { open: boolean; setOpen: (b: boolean) => void; editing: Militar | null; onSaved: () => void }) {
  const [posto, setPosto] = useState("");
  const [nomeGuerra, setNomeGuerra] = useState("");
  const [telefone, setTelefone] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [busy, setBusy] = useState(false);

  if (open && editing && nomeGuerra !== editing.nome_guerra && posto !== editing.posto) {
    setPosto(editing.posto); setNomeGuerra(editing.nome_guerra); setTelefone(editing.telefone); setAtivo(editing.ativo);
  }

  const reset = () => { setPosto(""); setNomeGuerra(""); setTelefone(""); setAtivo(true); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await upsertMilitar({ id: editing?.id, posto: posto.trim().toUpperCase(), nome_guerra: nomeGuerra.trim(), telefone: telefone.trim(), ativo });
      toast.success(editing ? "Atualizado" : "Cadastrado");
      onSaved(); setOpen(false); reset();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar militar" : "Novo militar"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <div><Label>Posto/Graduação</Label><Input required placeholder="3º SGT" value={posto} onChange={(e) => setPosto(e.target.value)} /></div>
            <div><Label>Nome de guerra</Label><Input required placeholder="Albuquerque" value={nomeGuerra} onChange={(e) => setNomeGuerra(e.target.value)} /></div>
          </div>
          <div><Label>Telefone (WhatsApp)</Label><Input required placeholder="55 11 9 9999-9999" value={telefone} onChange={(e) => setTelefone(e.target.value)} /></div>
          <div className="flex items-center justify-between"><Label>Ativo</Label><Switch checked={ativo} onCheckedChange={setAtivo} /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Row = { posto: string; nome_guerra: string; telefone: string; _error?: string };

function ImportDialog({ open, setOpen, existing, onDone }: { open: boolean; setOpen: (b: boolean) => void; existing: Militar[]; onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const existingPhones = useMemo(() => new Set(existing.map((m) => onlyDigits(m.telefone))), [existing]);

  const validate = (list: Row[]): Row[] => {
    const seen = new Set<string>();
    return list.map((r) => {
      const tel = onlyDigits(r.telefone);
      let _error: string | undefined;
      if (!r.posto?.trim()) _error = "Posto vazio";
      else if (!r.nome_guerra?.trim()) _error = "Nome de guerra vazio";
      else if (!tel || tel.length < 10) _error = "Telefone inválido";
      else if (existingPhones.has(tel)) _error = "Telefone já cadastrado";
      else if (seen.has(tel)) _error = "Telefone duplicado na planilha";
      seen.add(tel);
      return { ...r, _error };
    });
  };

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
    const norm = (k: string) => k.toLowerCase().replace(/[^a-z]/g, "");
    const parsed: Row[] = json.map((r) => {
      const entries = Object.entries(r).map(([k, v]) => [norm(k), String(v ?? "").trim()] as const);
      const get = (...keys: string[]) => entries.find(([k]) => keys.includes(k))?.[1] ?? "";
      return {
        posto: get("posto", "postograduacao", "graduacao", "postograd"),
        nome_guerra: get("nomedeguerra", "nomeguerra", "nome"),
        telefone: get("telefone", "celular", "whatsapp", "fone"),
      };
    });
    setRows(validate(parsed));
  };

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((rs) => validate(rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r))));
  };

  const removeRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const valid = rows.filter((r) => !r._error);
  const invalid = rows.filter((r) => r._error);

  const confirmar = async () => {
    if (!valid.length) return;
    setBusy(true);
    try {
      await bulkInsertMilitares(valid.map((r) => ({
        posto: r.posto.trim().toUpperCase(),
        nome_guerra: r.nome_guerra.trim(),
        telefone: r.telefone.trim(),
      })));
      toast.success(`${valid.length} militar(es) importado(s)`);
      setRows([]); setOpen(false); onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setRows([]); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar planilha de militares</DialogTitle>
        </DialogHeader>
        {rows.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A planilha deve conter as colunas: <b>Posto/Graduação</b>, <b>Nome de guerra</b>, <b>Telefone</b>.
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
            <div className="max-h-[50vh] overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-2">Posto</th>
                    <th className="px-2 py-2">Nome de guerra</th>
                    <th className="px-2 py-2">Telefone</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t ${r._error ? "bg-destructive/5" : ""}`}>
                      <td className="px-2 py-1"><Input className="h-8" value={r.posto} onChange={(e) => updateRow(i, { posto: e.target.value })} /></td>
                      <td className="px-2 py-1"><Input className="h-8" value={r.nome_guerra} onChange={(e) => updateRow(i, { nome_guerra: e.target.value })} /></td>
                      <td className="px-2 py-1">
                        <Input className="h-8" value={r.telefone} onChange={(e) => updateRow(i, { telefone: e.target.value })} />
                        {r._error && <div className="text-xs text-destructive flex items-center gap-1 mt-1"><AlertTriangle className="h-3 w-3" />{r._error}</div>}
                      </td>
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
