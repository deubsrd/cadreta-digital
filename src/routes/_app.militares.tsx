import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listMilitares, upsertMilitar, deleteMilitar, type Militar } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/militares")({
  component: MilitaresPage,
});

function MilitaresPage() {
  const qc = useQueryClient();
  const { data: militares = [] } = useQuery({ queryKey: ["militares"], queryFn: listMilitares });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Militar | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = militares.filter(
    (m) => m.nome.toLowerCase().includes(search.toLowerCase()) || m.identificacao.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Militares</h1>
          <p className="text-sm text-muted-foreground">{militares.length} cadastrados</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Novo militar
        </Button>
      </div>

      <Card className="p-4">
        <div className="relative max-w-sm mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou identificação..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b text-muted-foreground">
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Identificação</th>
                <th className="px-4 py-2 font-medium">Telefone</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium">{m.nome}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.identificacao}</td>
                  <td className="px-4 py-3 text-muted-foreground">{m.telefone}</td>
                  <td className="px-4 py-3">
                    {m.ativo ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(m); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={async () => {
                      if (!confirm(`Excluir ${m.nome}? Todas as compras serão removidas.`)) return;
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
    </div>
  );
}

function MilitarDialog({ open, setOpen, editing, onSaved }: { open: boolean; setOpen: (b: boolean) => void; editing: Militar | null; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [identificacao, setIdentificacao] = useState("");
  const [telefone, setTelefone] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [busy, setBusy] = useState(false);

  // reset on open
  if (open && editing && nome !== editing.nome && identificacao !== editing.identificacao) {
    setNome(editing.nome); setIdentificacao(editing.identificacao); setTelefone(editing.telefone); setAtivo(editing.ativo);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await upsertMilitar({ id: editing?.id, nome, identificacao, telefone, ativo });
      toast.success(editing ? "Atualizado" : "Cadastrado");
      onSaved();
      setOpen(false);
      setNome(""); setIdentificacao(""); setTelefone(""); setAtivo(true);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setNome(""); setIdentificacao(""); setTelefone(""); setAtivo(true); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar militar" : "Novo militar"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>Nome completo</Label><Input required value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div><Label>Identificação militar</Label><Input required value={identificacao} onChange={(e) => setIdentificacao(e.target.value)} /></div>
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
