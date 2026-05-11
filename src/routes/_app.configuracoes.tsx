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
          <p className="text-xs text-muted-foreground">Variáveis: <code>{`{nome}`}</code> <code>{`{mes}`}</code> <code>{`{valor}`}</code> <code>{`{resumo}`}</code> <code>{`{pix}`}</code></p>
          <Textarea rows={8} value={form.mensagem_template} onChange={(e) => set("mensagem_template", e.target.value)} />
          <div className="grid md:grid-cols-2 gap-3">
            <div><Label>Frequência (dias entre lembretes)</Label><Input type="number" min={1} value={form.frequencia_cobranca_dias} onChange={(e) => set("frequencia_cobranca_dias", Number(e.target.value))} /></div>
            <div><Label>Horário das mensagens</Label><Input type="time" value={form.horario_cobranca?.slice(0,5) ?? "09:00"} onChange={(e) => set("horario_cobranca", e.target.value)} /></div>
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">Z-API (WhatsApp)</h3>
          <p className="text-xs text-muted-foreground">Cole as credenciais da sua instância Z-API. Sem isso, o botão "Cobrar" abre o WhatsApp manualmente.</p>
          <div><Label>Instance ID</Label><Input value={form.z_api_instance} onChange={(e) => set("z_api_instance", e.target.value)} /></div>
          <div><Label>Token da instância</Label><Input value={form.z_api_token} onChange={(e) => set("z_api_token", e.target.value)} /></div>
          <div><Label>Client-Token (segurança da conta)</Label><Input value={form.z_api_client_token} onChange={(e) => set("z_api_client_token", e.target.value)} /></div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar configurações"}</Button>
        </div>
      </form>
    </div>
  );
}
