import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";

type GateMode =
  | { kind: "inline" }
  | { kind: "modal"; title: string; summary: string[]; cooldownMs?: number; requireTyped?: string }
  | { kind: "max"; title: string; endpoint: string; payload: unknown; blastRadius: string; cooldownMs?: number; requireTyped?: string };

export function Gate(props: {
  mode: GateMode;
  onConfirm: () => Promise<void> | void;
  children: (open: () => void) => ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState("");
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!open || props.mode.kind === "inline") return undefined;
    const cooldown = props.mode.cooldownMs ?? (props.mode.kind === "max" ? 3000 : 0);
    setRemaining(cooldown);
    if (!cooldown) return undefined;
    const started = Date.now();
    const id = window.setInterval(() => {
      const next = Math.max(0, cooldown - (Date.now() - started));
      setRemaining(next);
      if (next === 0) window.clearInterval(id);
    }, 100);
    return () => window.clearInterval(id);
  }, [open, props.mode]);

  const confirm = async () => {
    setBusy(true);
    try {
      await props.onConfirm();
      setOpen(false);
      setTyped("");
    } finally {
      setBusy(false);
    }
  };

  const requireTyped = props.mode.kind !== "inline" ? props.mode.requireTyped : undefined;
  const disabled = busy || remaining > 0 || Boolean(requireTyped && typed !== requireTyped);

  if (props.mode.kind === "inline") {
    return (
      <span className="inline-flex items-center gap-2">
        {props.children(() => setOpen(true))}
        {open && (
          <span className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface-2 px-2 py-1 text-sm">
            <span className="text-fg-muted">Confirm?</span>
            <button className="text-success" onClick={confirm}>Yes</button>
            <button className="text-fg-muted" onClick={() => setOpen(false)}>No</button>
          </span>
        )}
      </span>
    );
  }

  const title = props.mode.title;
  const summary = props.mode.kind === "modal" ? props.mode.summary : [props.mode.blastRadius];

  return (
    <>
      {props.children(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={props.mode.kind === "max" ? "max-w-3xl" : undefined} onClose={() => setOpen(false)}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-accent" />
              <DialogTitle>{title}</DialogTitle>
            </div>
            <DialogDescription>Human approval is required before this action runs.</DialogDescription>
          </DialogHeader>
          <ul className="mt-4 space-y-2 text-sm text-fg">
            {summary.map((item) => <li key={item}>• {item}</li>)}
          </ul>
          {props.mode.kind === "max" && (
            <div className="mt-4 rounded-lg border border-hairline bg-canvas p-3">
              <div className="text-xs text-fg-muted">{props.mode.endpoint}</div>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-fg">{JSON.stringify(props.mode.payload, null, 2)}</pre>
            </div>
          )}
          {requireTyped && (
            <Input
              className="mt-4"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={`Type ${requireTyped} to confirm`}
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant={props.mode.kind === "max" ? "destructive" : "primary"} disabled={disabled} onClick={confirm}>
              {remaining > 0 ? `Wait ${Math.ceil(remaining / 1000)}s` : busy ? "Working..." : "Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
