import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getConfig, saveConfig, listAgendamentos, saveAgendamento, listCobrancaLogs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bell, Clock, CheckCircle2, AlertCircle, Loader2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/configuracoes")({
  component: ConfigPage,
});

// Converte "2026-06-01T09:00" (local) → ISO UTC p/ salvar no banco
// Converte data/hora do dispositivo → ISO UTC para salvar no banco
// Usa o offset REAL do browser (não assume Brasília hardcoded)
function localToIso(dateStr: string, timeStr: string): string | null {
  if (!dateStr || !timeStr) return null;
  // new Date("YYYY-MM-DDTHH:MM:00") sem timezone = interpretado como LOCAL pelo browser
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Converte ISO UTC → { date: "YYYY-MM-DD", time: "HH:MM" } no fuso LOCAL do dispositivo
function isoToLocal(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  // Usa o fuso real do dispositivo
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

function AgStatusBadge({ ag }: { ag: any }) {
  if (!ag.ativo) return <Badge variant="secondary">Inativo</Badge>;
  if (ag.executado_at) return <Badge className="bg-success text-success-foreground"><CheckCircle2 className="h-3 w-3 mr-1" />Executado</Badge>;
  if (!ag.scheduled_at) return <Badge variant="outline">Sem data</Badge>;
  const d = new Date(ag.scheduled_at);
  if (d < new Date()) return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Atrasado</Badge>;
  return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Agendado</Badge>;
}

function AgendamentosSection() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const { data: ags = [], isLoading } = useQuery({ queryKey: ["agendamentos", uid], queryFn: listAgendamentos });
  const [localAgs, setLocalAgs] = useState<any[]>([]);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [logDialog, setLogDialog] = useState<number | null>(null);
  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["cobranca_logs", uid, logDialog],
    staleTime: 0,
    refetchOnMount: true,
    queryFn: () => listCobrancaLogs(logDialog ?? undefined),
    enabled: logDialog !== null,
  });

  useEffect(() => {
    if (ags.length && !localAgs.length) setLocalAgs(ags.map((a) => ({ ...a, _date: isoToLocal(a.scheduled_at).date, _time: isoToLocal(a.scheduled_at).time })));
  }, [ags, localAgs.length]);

  const update = (id: number, patch: any) =>
    setLocalAgs((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const salvar = async (ag: any) => {
    setBusyIds((s) => new Set(s).add(ag.id));
    try {
      const scheduled_at = localToIso(ag._date, ag._time);
      await saveAgendamento({ id: ag.id, ativo: ag.ativo, scheduled_at, intervalo_min: ag.intervalo_min, intervalo_max: ag.intervalo_max, executado_at: null });
      toast.success(`Cobrança ${ag.id} salva`);
      qc.invalidateQueries({ queryKey: ["agendamentos", uid] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyIds((s) => { const n = new Set(s); n.delete(ag.id); return n; }); }
  };

  const salvarTodas = async () => {
    setBusyIds(new Set(localAgs.map((a) => a.id)));
    try {
      await Promise.all(
        localAgs.map((ag) =>
          saveAgendamento({
            id: ag.id,
            ativo: ag.ativo,
            scheduled_at: localToIso(ag._date, ag._time),
            intervalo_min: ag.intervalo_min,
            intervalo_max: ag.intervalo_max,
            executado_at: null,
          })
        )
      );
      toast.success("Todas as cobranças recorrentes foram salvas");
      qc.invalidateQueries({ queryKey: ["agendamentos", uid] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyIds(new Set());
    }
  };

  const resetar = async (ag: any) => {
    if (!confirm(`Resetar status da cobrança ${ag.id}? Ela poderá ser executada novamente.`)) return;
    setBusyIds((s) => new Set(s).add(ag.id));
    try {
      await saveAgendamento({ id: ag.id, executado_at: null });
      toast.success(`Cobrança ${ag.id} resetada`);
      qc.invalidateQueries({ queryKey: ["agendamentos", uid] });
      setLocalAgs([]);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyIds((s) => { const n = new Set(s); n.delete(ag.id); return n; }); }
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando agendamentos...</div>;

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button size="sm" onClick={salvarTodas} disabled={busyIds.size > 0 || !localAgs.length}>
          {busyIds.size > 0 ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
          Salvar todas as cobranças
        </Button>
      </div>
      <div className="space-y-3">
        {localAgs.map((ag) => (
          <Card key={ag.id} className={`p-4${!ag.ativo ? " opacity-60" : ""}`}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-semibold">{ag.id}</span>
                <span className="font-medium text-sm">Cobrança {ag.id}</span>
                <AgStatusBadge ag={ag} />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={ag.ativo}
                  disabled={busyIds.has(ag.id)}
                  onCheckedChange={async (v) => {
                    update(ag.id, { ativo: v });
                    setBusyIds((s) => new Set(s).add(ag.id));
                    try {
                      await saveAgendamento({
                        id: ag.id,
                        ativo: v,
                        scheduled_at: localToIso(ag._date, ag._time),
                        intervalo_min: ag.intervalo_min,
                        intervalo_max: ag.intervalo_max,
                        executado_at: null,
                      });
                      toast.success(`Cobrança ${ag.id} ${v ? "ativada" : "desativada"}`);
                      qc.invalidateQueries({ queryKey: ["agendamentos", uid] });
                    } catch (e: any) {
                      update(ag.id, { ativo: !v });
                      toast.error(e.message);
                    } finally {
                      setBusyIds((s) => { const n = new Set(s); n.delete(ag.id); return n; });
                    }
                  }}
                />
                <span className="text-xs text-muted-foreground">{ag.ativo ? "Ativa" : "Inativa"}</span>
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-3 mb-3">
              <div className="md:col-span-1">
                <Label className="text-xs">Data</Label>
                <Input type="date" value={ag._date} onChange={(e) => update(ag.id, { _date: e.target.value })} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Horário (horário local)</Label>
                <Input type="time" value={ag._time} onChange={(e) => update(ag.id, { _time: e.target.value })} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Intervalo mín. (seg)</Label>
                <Input type="number" min={10} max={600} value={ag.intervalo_min} onChange={(e) => update(ag.id, { intervalo_min: Number(e.target.value) })} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Intervalo máx. (seg)</Label>
                <Input type="number" min={10} max={600} value={ag.intervalo_max} onChange={(e) => update(ag.id, { intervalo_max: Number(e.target.value) })} className="h-8 text-sm" />
              </div>
            </div>

            {ag.executado_at && (
              <p className="text-xs text-muted-foreground mb-2">
                Executado em {new Date(ag.executado_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
              </p>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => salvar(ag)} disabled={busyIds.has(ag.id)}>
                {busyIds.has(ag.id) ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                Salvar
              </Button>
              {ag.executado_at && (
                <Button size="sm" variant="outline" onClick={() => resetar(ag)} disabled={busyIds.has(ag.id)}>
                  Resetar
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setLogDialog(ag.id)}>
                Ver logs
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={logDialog !== null} onOpenChange={(o) => !o && setLogDialog(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Logs — Cobrança {logDialog}</DialogTitle>
          </DialogHeader>
          {logsLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : logs.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum log ainda.</div>
          ) : (
            <div className="space-y-2">
              {logs.map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-2 text-sm p-2 rounded bg-muted/50">
                  <div>
                    <span className="font-medium">{l.militares ? `${l.militares.posto} ${l.militares.nome_guerra}` : l.militar_id}</span>
                    {l.erro_msg && <div className="text-xs text-destructive">{l.erro_msg}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant={l.status === "enviado" ? "default" : l.status === "erro" ? "destructive" : "secondary"} className="text-xs">
                      {l.status}
                    </Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(l.enviado_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

const CONFIG_DEFAULTS = {
  id: 1, pix_key: "", pix_nome: "", mensagem_template: "",
  frequencia_cobranca_dias: 3, horario_cobranca: "09:00",
  z_api_instance: "", z_api_token: "", z_api_client_token: "",
  proxima_cobranca: null, admin_phone: "",
};

function ConfigPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const { data } = useQuery({ queryKey: ["config", uid], queryFn: getConfig, staleTime: 0, refetchOnMount: true });
  const [overrides, setOverrides] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);

  // Abre imediatamente com defaults, preenche com dados do banco quando chegar
  const form = { ...CONFIG_DEFAULTS, ...(data ?? {}), ...overrides };

  const set = (k: string, v: any) => setOverrides((prev) => ({ ...prev, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveConfig(form);
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["config", uid] });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">PIX, mensagem de cobrança, Z-API e agendamentos.</p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {/* PIX */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">Chave PIX</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Chave PIX</Label><Input value={form.pix_key} onChange={(e) => set("pix_key", e.target.value)} placeholder="cpf/cnpj/email/telefone" /></div>
            <div><Label>Nome do recebedor</Label><Input value={form.pix_nome} onChange={(e) => set("pix_nome", e.target.value)} /></div>
          </div>
        </Card>

        {/* Mensagem */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">Mensagem de cobrança</h3>
          <p className="text-xs text-muted-foreground">Variáveis: <code>{`{nome}`}</code> <code>{`{mes}`}</code> <code>{`{valor}`}</code> <code>{`{resumo}`}</code> <code>{`{observacoes}`}</code> <code>{`{pix}`}</code></p>
          <Textarea rows={8} value={form.mensagem_template} onChange={(e) => set("mensagem_template", e.target.value)} />
        </Card>

        {/* Z-API */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">Z-API (WhatsApp)</h3>
          <p className="text-xs text-muted-foreground">Cole as credenciais da sua instância Z-API. Sem isso, o botão "Cobrar" abre o WhatsApp manualmente.</p>
          <div><Label>Instance ID</Label><Input value={form.z_api_instance} onChange={(e) => set("z_api_instance", e.target.value)} /></div>
          <div><Label>Token da instância</Label><Input value={form.z_api_token} onChange={(e) => set("z_api_token", e.target.value)} /></div>
          <div><Label>Client-Token (segurança da conta)</Label><Input value={form.z_api_client_token} onChange={(e) => set("z_api_client_token", e.target.value)} /></div>
          <div>
            <Label className="flex items-center gap-2"><Bell className="h-4 w-4" />Número do admin (notificações de pagamento)</Label>
            <Input
              className="mt-1"
              value={form.admin_phone ?? ""}
              onChange={(e) => set("admin_phone", e.target.value)}
              placeholder="+55 92 99999-9999"
            />
            <p className="text-xs text-muted-foreground mt-1">Quando um PIX for pago automaticamente, você receberá uma notificação neste número.</p>
          </div>
        </Card>

        <div className="flex justify-between items-center gap-2 flex-wrap">
          <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar configurações"}</Button>
        </div>
      </form>

      {/* Agendamentos de cobrança recorrente */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Cobranças recorrentes</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Configure até 5 disparos automáticos. Cada um envia WhatsApp com PIX para todos os militares com fatura pendente no mês.
          Um intervalo aleatório é aplicado entre cada envio para evitar bloqueios. Se o militar pagar antes de um disparo, ele é pulado automaticamente.
        </p>
        <AgendamentosSection />
      </div>

    </div>
  );
}
