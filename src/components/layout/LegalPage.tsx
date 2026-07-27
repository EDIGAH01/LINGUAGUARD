import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Logo3D } from "@/components/Logo3D";

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  intro: string;
  children: ReactNode;
}

/**
 * Shared shell for the public legal documents. These routes deliberately sit
 * OUTSIDE ProtectedRoute: platform reviewers (TikTok, Meta, Google) open them
 * signed-out during app review, and a redirect to /login reads as a broken
 * link and fails the review.
 */
export function LegalPage({ title, lastUpdated, intro, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label="LinguaGuard home">
            <Logo3D size={32} />
            <span className="text-base font-bold leading-none">
              <span style={{ color: "#00A8CC" }}>Lingua</span>
              <span style={{ color: "#FF5A3C" }}>Guard</span>
            </span>
          </Link>
          <Link
            to="/login"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-xs uppercase tracking-wider text-muted-foreground">
          Last updated {lastUpdated}
        </p>
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{intro}</p>

        <div className="mt-10 space-y-9">{children}</div>

        <footer className="mt-16 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground">
            Questions about this document? Contact{" "}
            <a href="mailto:edigahclifford@gmail.com" className="text-primary hover:underline">
              edigahclifford@gmail.com
            </a>
            .
          </p>
        </footer>
      </main>
    </div>
  );
}

/** One numbered section of a legal document. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** Bulleted list with consistent spacing inside a legal section. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="ml-4 list-disc space-y-2 marker:text-muted-foreground/50">
      {items.map((item, i) => (
        <li key={i} className="pl-1">
          {item}
        </li>
      ))}
    </ul>
  );
}
