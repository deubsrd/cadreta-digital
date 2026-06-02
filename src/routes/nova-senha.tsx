import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Shield, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/nova-senha")({
  component: NovaSenhaPage,
});

function NovaSenhaPage() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  // O Supabase redireciona com #access_token na URL — precisa processar o hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      supabase.auth.getSession().then(({ data }) => {
        setTokenValid(!!data.session);
      });
    } else {
      // Verifica se já há sessão ativa (token já foi processado)
      supabase.auth.getSession().then(({ data }) => {
        setTokenValid(!!data.session);
      });
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    if (password.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres.");
    setBusy(true);
    const { error } = await updatePassword(password);
    setBusy(false);
    if (error) return toast.error(error);
    setDone(true);
    setTimeout(() => navigate({ to: "/" }), 3000);
  };

  const SidePanel = () => (
    <div className="hidden md:flex flex-col justify-between p-12 bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-md bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center">
          <Shield className="h-5 w-5" />
        </div>
        <span className="font-semibold text-lg">Caderneta Digital</span>
      </div>
      <div>
        <h1 className="text-3xl font-semibold leading-tight mb-3">Gestão e cobrança<br />de fiados militares</h1>
        <p className="opacity-80 text-sm max-w-md">Registre compras, gere faturas mensais e cobre via WhatsApp automaticamente.</p>
      </div>
      <div className="text-xs opacity-60">© Caderneta · Uso interno</div>
    </div>
  );

  // Token inválido ou expirado
  if (tokenValid === false) {
    return (
      <div className="min-h-screen grid md:grid-cols-2 bg-background">
        <SidePanel />
        <div className="flex items-center justify-center p-6">
          <Card className="w-full max-w-sm p-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Link inválido ou expirado</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Este link de recuperação não é mais válido. Solicite um novo link na tela de login.
            </p>
            <Button className="w-full" onClick={() => navigate({ to: "/login" })}>
              Voltar para o login
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // Senha alterada com sucesso
  if (done) {
    return (
      <div className="min-h-screen grid md:grid-cols-2 bg-background">
        <SidePanel />
        <div className="flex items-center justify-center p-6">
          <Card className="w-full max-w-sm p-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Senha alterada!</h2>
            <p className="text-sm text-muted-foreground">
              Sua senha foi atualizada com sucesso. Redirecionando para o painel...
            </p>
          </Card>
        </div>
      </div>
    );
  }

  // Formulário de nova senha
  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <SidePanel />
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-sm p-6">
          <div className="md:hidden flex items-center gap-2 mb-6">
            <Shield className="h-5 w-5 text-accent" />
            <span className="font-semibold">Caderneta</span>
          </div>
          <h2 className="text-xl font-semibold mb-1">Nova senha</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Escolha uma nova senha para sua conta.
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Nova senha</Label>
              <Input
                type="password"
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div>
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                required
                minLength={6}
                placeholder="Repita a senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || tokenValid === null}>
              {busy ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
