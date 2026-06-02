import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Shield, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn, signUp, resetPassword, session, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/" });
  }, [session, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    if (mode === "reset") {
      const { error } = await resetPassword(email);
      setBusy(false);
      if (error) return toast.error(error);
      setResetSent(true);
      return;
    }

    const fn = mode === "signin" ? signIn : signUp;
    const { error } = await fn(email, password);
    setBusy(false);
    if (error) return toast.error(error);
    if (mode === "signup") toast.success("Conta criada. Você é o administrador.");
    navigate({ to: "/" });
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
        <h1 className="text-3xl font-semibold leading-tight mb-3">Gestão e cobrança<br/>de fiados militares</h1>
        <p className="opacity-80 text-sm max-w-md">
          Registre compras, gere faturas mensais e cobre via WhatsApp automaticamente.
          Marque como pago e as cobranças param.
        </p>
      </div>
      <div className="text-xs opacity-60">© Caderneta · Uso interno</div>
    </div>
  );

  // ── Tela de confirmação de envio de email ──
  if (resetSent) {
    return (
      <div className="min-h-screen grid md:grid-cols-2 bg-background">
        <SidePanel />
        <div className="flex items-center justify-center p-6">
          <Card className="w-full max-w-sm p-6 text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="h-12 w-12 text-success" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Email enviado!</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Enviamos um link de recuperação para <strong>{email}</strong>.
              Verifique sua caixa de entrada e spam.
            </p>
            <Button variant="outline" className="w-full" onClick={() => { setMode("signin"); setResetSent(false); }}>
              <ArrowLeft className="h-4 w-4 mr-2" />Voltar para o login
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  // ── Tela de recuperação de senha ──
  if (mode === "reset") {
    return (
      <div className="min-h-screen grid md:grid-cols-2 bg-background">
        <SidePanel />
        <div className="flex items-center justify-center p-6">
          <Card className="w-full max-w-sm p-6">
            <div className="md:hidden flex items-center gap-2 mb-6">
              <Shield className="h-5 w-5 text-accent" />
              <span className="font-semibold">Caderneta</span>
            </div>
            <h2 className="text-xl font-semibold mb-1">Recuperar senha</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Informe seu email e enviaremos um link para criar uma nova senha.
            </p>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Enviando..." : "Enviar link de recuperação"}
              </Button>
            </form>
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="text-sm text-muted-foreground hover:text-foreground mt-4 w-full text-center flex items-center justify-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" />Voltar para o login
            </button>
          </Card>
        </div>
      </div>
    );
  }

  // ── Tela de login / cadastro ──
  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <SidePanel />
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-sm p-6">
          <div className="md:hidden flex items-center gap-2 mb-6">
            <Shield className="h-5 w-5 text-accent" />
            <span className="font-semibold">Caderneta</span>
          </div>
          <h2 className="text-xl font-semibold mb-1">{mode === "signin" ? "Acessar painel" : "Criar conta"}</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "signin" ? "Entre com seu email de administrador." : "O primeiro cadastro vira administrador."}
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Senha</Label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => setMode("reset")}
                    className="text-xs text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-sm text-muted-foreground hover:text-foreground mt-4 w-full text-center"
          >
            {mode === "signin" ? "Não tem conta? Criar" : "Já tem conta? Entrar"}
          </button>
          <Link to="/" className="hidden">.</Link>
        </Card>
      </div>
    </div>
  );
}
