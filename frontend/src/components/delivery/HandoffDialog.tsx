import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  taskPublicId: string;
  onConfirm: (toUserId: string, reason: string) => void;
  teamMembers: { id: string; name: string }[];
}

export default function HandoffDialog({
  open,
  onClose,
  taskPublicId,
  onConfirm,
  teamMembers,
}: Props) {
  const [toUser, setToUser] = useState("");
  const [reason, setReason] = useState("");

  const handleSubmit = () => {
    if (!toUser) return;
    onConfirm(toUser, reason);
    setToUser("");
    setReason("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hand off {taskPublicId}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Transfer to</label>
            <select
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              value={toUser}
              onChange={(e) => setToUser(e.target.value)}
            >
              <option value="">Select team member...</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Reason</label>
            <textarea
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this being handed off?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!toUser}>
            Confirm Handoff
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
