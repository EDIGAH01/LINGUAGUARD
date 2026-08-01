import { useState } from "react";
import { Link } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Menu, Settings } from "lucide-react";
import { Logo3D } from "@/components/Logo3D";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Mobile top bar */}
        <header className="flex items-center gap-2.5 px-4 h-16 border-b border-border bg-card shadow-brand-sm">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 border-0">
              <Sidebar collapsed={false} onToggle={() => {}} />
            </SheetContent>
          </Sheet>
          <Logo3D size={36} className="flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-base font-bold leading-tight truncate">
              <span style={{ color: "#00A8CC" }}>Lingua</span>
              <span style={{ color: "#FF5A3C" }}>Guard</span>
            </p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-[0.14em] leading-tight">Language, Protected</p>
          </div>
          <div className="flex-1" />
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" asChild aria-label="Settings">
            <Link to="/settings">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
    </div>
  );
}
