import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, FilePlus, LogOut } from "lucide-react";
import { logout } from "../../lib/auth";
import { useSession } from "../../hooks/useSession";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";

export default function ClientHomeRoute() {
  const session = useSession();
  const [params] = useSearchParams();
  const submitted = params.get("submitted");

  if (!session) return <Navigate to="/login" replace />;
  if (session.role !== "client") return <Navigate to="/demands" replace />;

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="border-b border-hairline bg-surface-1">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div>
            <div className="text-sm font-semibold text-fg-strong">ForgeOS Client Intake</div>
            <div className="text-xs text-fg-muted">{session.company} · {session.email}</div>
          </div>
          <Button variant="ghost" onClick={() => { logout(); window.location.href = "/login"; }}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          {submitted && (
            <div className="mb-5 rounded-xl border border-success/30 bg-surface-1 p-4 text-sm text-fg">
              <div className="flex items-center gap-2 font-medium text-fg-strong">
                <CheckCircle2 className="h-4 w-4 text-success" />
                Request {submitted} submitted for manager review.
              </div>
            </div>
          )}
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Client</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.02em] text-fg-strong">
            Describe the outcome. ForgeOS turns it into a structured AI demand.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-fg-muted">
            Submit the business problem in normal language. The AI intake will classify domain, complexity, urgency, recommendation route, fulfillment mix, and suggested team for manager approval.
          </p>
          <Button asChild className="mt-7" variant="primary" size="lg">
            <Link to="/demand/new">
              <FilePlus className="h-4 w-4" />
              Start demand
            </Link>
          </Button>
        </section>

        <aside className="grid gap-3">
          {[
            ["1", "Describe", "Plain-language requirement and industry context."],
            ["2", "AI classification", "ForgeOS structures the request for delivery review."],
            ["3", "Manager review", "The manager approves scope and sends it to execution."],
          ].map(([num, title, body]) => (
            <Card key={num}>
              <CardContent className="flex gap-3 p-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-accent bg-accent-soft text-sm font-semibold text-accent">{num}</div>
                <div>
                  <div className="text-sm font-semibold text-fg-strong">{title}</div>
                  <div className="mt-1 text-sm text-fg-muted">{body}</div>
                </div>
              </CardContent>
            </Card>
          ))}
          <Button asChild variant="secondary">
            <Link to="/login">
              Switch role
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </aside>
      </main>
    </div>
  );
}
