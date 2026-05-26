import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { DEMO_USERS, login, loginAs, type UserRole } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";

export default function LoginRoute() {
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole>("client");
  const selected = DEMO_USERS.find((user) => user.role === role)!;
  const [email, setEmail] = useState(selected.email);
  const [password, setPassword] = useState(selected.password);

  const chooseRole = (next: UserRole) => {
    const user = DEMO_USERS.find((item) => item.role === next)!;
    setRole(next);
    setEmail(user.email);
    setPassword(user.password);
  };

  const submit = () => {
    const session = login(email, password);
    if (!session) {
      toast.error("Invalid demo credentials");
      return;
    }
    toast.success(`Signed in as ${session.role}`);
    navigate(session.role === "client" ? "/client" : "/demands", { replace: true });
  };

  const quickLogin = (next: UserRole) => {
    const session = loginAs(next);
    toast.success(`Signed in as ${session.role}`);
    navigate(session.role === "client" ? "/client" : "/demands", { replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section>
          <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-1 px-3 py-1 text-xs text-fg-muted">
            <LockKeyhole className="h-3.5 w-3.5 text-accent" />
            Role based demo access
          </div>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.02em] text-fg-strong">
            Client request in. AI brief out. Manager assigns the team.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-fg-muted">
            Clients submit plain-language demand. ForgeOS turns it into structure, recommendation, route, owner, and team suggestions for manager review.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {["Client intake", "AI planning", "Manager staffing"].map((item) => (
              <div key={item} className="rounded-xl border border-hairline bg-surface-1 p-4">
                <div className="text-sm font-medium text-fg-strong">{item}</div>
                <div className="mt-1 text-xs text-fg-muted">End-to-end demo flow</div>
              </div>
            ))}
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-2">
              <button
                className={role === "client" ? "rounded-xl border border-accent bg-accent-soft p-4 text-left" : "rounded-xl border border-hairline bg-surface-2 p-4 text-left"}
                onClick={() => chooseRole("client")}
              >
                <UserRound className="h-5 w-5 text-accent" />
                <div className="mt-3 text-sm font-semibold text-fg-strong">Client</div>
                <div className="mt-1 text-xs text-fg-muted">Submit demand</div>
              </button>
              <button
                className={role === "manager" ? "rounded-xl border border-accent bg-accent-soft p-4 text-left" : "rounded-xl border border-hairline bg-surface-2 p-4 text-left"}
                onClick={() => chooseRole("manager")}
              >
                <UsersRound className="h-5 w-5 text-accent" />
                <div className="mt-3 text-sm font-semibold text-fg-strong">Manager</div>
                <div className="mt-1 text-xs text-fg-muted">Review and staff</div>
              </button>
            </div>

            <label className="grid gap-1.5">
              <span className="text-xs text-fg-muted">Email</span>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-fg-muted">Password</span>
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }} />
            </label>

            <div className="rounded-xl border border-hairline bg-surface-2 p-3">
              <div className="text-xs font-medium text-fg-strong">Default credentials</div>
              <div className="mt-2 grid gap-1 font-mono text-xs text-fg-muted">
                {DEMO_USERS.map((user) => (
                  <div key={user.email}>{user.role}: {user.email} / {user.password}</div>
                ))}
              </div>
            </div>

            <Button className="w-full" variant="primary" onClick={submit}>
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => quickLogin("client")}>Use client</Button>
              <Button variant="secondary" onClick={() => quickLogin("manager")}>Use manager</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
