import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { LayoutDashboard, Users, ShoppingBag, FileText, Settings, LogOut, Shield, Menu, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/militares", label: "Militares", icon: Users },
  { to: "/itens", label: "Itens", icon: Package },
  { to: "/compras", label: "Compras", icon: ShoppingBag },
  { to: "/faturas", label: "Faturas", icon: FileText },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <Brand />
        <NavList pathname={loc.pathname} onNavigate={() => {}} />
        <Footer onSignOut={async () => { await signOut(); navigate({ to: "/login" }); }} email={user?.email ?? ""} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 bg-sidebar text-sidebar-foreground flex flex-col">
            <Brand />
            <NavList pathname={loc.pathname} onNavigate={() => setOpen(false)} />
            <Footer onSignOut={async () => { await signOut(); navigate({ to: "/login" }); }} email={user?.email ?? ""} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b bg-card">
          <button onClick={() => setOpen(true)} className="p-2 -ml-2"><Menu className="h-5 w-5" /></button>
          <div className="flex items-center gap-2 font-semibold">
            <Shield className="h-5 w-5 text-accent" /> Caderneta
          </div>
          <div className="w-9" />
        </header>
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="px-5 h-16 flex items-center gap-2 border-b border-sidebar-border">
      <div className="h-9 w-9 rounded-md bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center">
        <Shield className="h-5 w-5" />
      </div>
      <div>
        <div className="font-semibold leading-tight">Caderneta</div>
        <div className="text-xs opacity-70 leading-tight">Gestão de Fiados</div>
      </div>
    </div>
  );
}

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <nav className="flex-1 px-3 py-4 space-y-1">
      {nav.map((n) => {
        const active = pathname === n.to || (n.to !== "/" && pathname.startsWith(n.to));
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "hover:bg-sidebar-accent/60 text-sidebar-foreground/80"
            )}
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Footer({ onSignOut, email }: { onSignOut: () => void; email: string }) {
  return (
    <div className="p-3 border-t border-sidebar-border">
      <div className="px-2 pb-2 text-xs opacity-70 truncate">{email}</div>
      <Button variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={onSignOut}>
        <LogOut className="h-4 w-4 mr-2" /> Sair
      </Button>
    </div>
  );
}
