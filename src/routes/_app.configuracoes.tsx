import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getConfig, saveConfig } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/configuracoes")({
  component: ConfigPage,
});

function ConfigPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["config"], queryFn: getConfig });
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);

  if (!form) return <div className="text-muted-foreground">Carregando...</div>;

  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await saveConfig(form); toast.success("Configurações salvas"); qc.invalidateQueries({ queryKey: ["config"] }); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">PIX, mensagem de cobrança e integração Z-API.</p>
      </div>

      <form onSubmit={submit} className="space-y-6">
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">Chave PIX</h3>
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Chave PIX</Label><Input value={form.pix_key} onChange={(e) => set("pix_key", e.target.value)} placeholder="cpf/cnpj/email/telefone" /></div>
            <div><Label>Nome do recebedor</Label><Input value={form.pix_nome} onChange={(e) => set("pix_nome", e.target.value)} /></div>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">Mensagem de cobrança</h3>
          <p className="text-xs text-muted-foreground">Variáveis: <code>{`{nome}`}</code> <code>{`{mes}`}</code> <code>{`{valor}`}</code> <code>{`{resumo}`}</code> <code>{`{observacoes}`}</code> <code>{`{pix}`}</code></p>
          <Textarea rows={8} value={form.mensagem_template} onChange={(e) => set("mensagem_template", e.target.value)} />
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Frequência (dias entre lembretes)</Label><Input type="number" min={1} value={form.frequencia_cobranca_dias} onChange={(e) => set("frequencia_cobranca_dias", Number(e.target.value))} /></div>
            <div><Label>Horário das mensagens</Label><Input type="time" value={form.horario_cobranca?.slice(0,5) ?? "09:00"} onChange={(e) => set("horario_cobranca", e.target.value)} /></div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Próxima cobrança</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn("w-full md:w-[280px] justify-start text-left font-normal", !form.proxima_cobranca && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {form.proxima_cobranca
                    ? new Date(form.proxima_cobranca + "T00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
                    : "Selecionar data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={form.proxima_cobranca ? new Date(form.proxima_cobranca + "T00:00") : undefined}
                  onSelect={(d) => {
                    if (!d) { set("proxima_cobranca", null); return; }
                    const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
                    set("proxima_cobranca", `${y}-${m}-${day}`);
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            {form.proxima_cobranca && (
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground self-start" onClick={() => set("proxima_cobranca", null)}>
                Limpar data
              </button>
            )}
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">Z-API (WhatsApp)</h3>
          <p className="text-xs text-muted-foreground">Cole as credenciais da sua instância Z-API. Sem isso, o botão "Cobrar" abre o WhatsApp manualmente.</p>
          <div><Label>Instance ID</Label><Input value={form.z_api_instance} onChange={(e) => set("z_api_instance", e.target.value)} /></div>
          <div><Label>Token da instância</Label><Input value={form.z_api_token} onChange={(e) => set("z_api_token", e.target.value)} /></div>
          <div><Label>Client-Token (segurança da conta)</Label><Input value={form.z_api_client_token} onChange={(e) => set("z_api_client_token", e.target.value)} /></div>
        </Card>

        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">Mercado Pago (PIX automático)</h3>
          <p className="text-xs text-muted-foreground">
            Cole o <strong>Access Token</strong> da sua conta Mercado Pago (Produção). Cada fatura mensal gera um PIX único com QR Code, copia‑e‑cola e link, e a confirmação ocorre automaticamente via webhook.
          </p>
          <div><Label>Access Token</Label><Input type="password" value={form.mp_access_token ?? ""} onChange={(e) => set("mp_access_token", e.target.value)} placeholder="APP_USR-..." /></div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div><strong>URL do webhook</strong> (configure no painel MP → Suas integrações → Webhooks):</div>
            <code className="block break-all bg-muted p-2 rounded">{import.meta.env.VITE_SUPABASE_URL}/functions/v1/mp-webhook</code>
          </div>
        </Card>

        <div className="flex justify-between items-center gap-2 flex-wrap">
          <Button type="button" variant="outline" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const { data, error } = await (await import("@/integrations/supabase/client")).supabase.functions.invoke("cobranca-automatica", { body: { force: true } });
              if (error) throw error;
              if ((data as any)?.error) throw new Error((data as any).error);
              const r = data as any;
              if (r?.skipped) toast.info(`Pulado: ${r.reason}`);
              else toast.success(`Cobrança disparada: ${r?.processados ?? 0} militar(es) processado(s)`);
            } catch (e: any) { toast.error(e.message); }
            finally { setBusy(false); }
          }}>Disparar cobrança agora (forçar)</Button>
          <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar configurações"}</Button>
        </div>
      </form>
    </div>
  );
}
