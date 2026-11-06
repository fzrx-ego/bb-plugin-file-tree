import { useState, type FormEvent } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { rpcContract, Workspace } from "../contract";

export type CreateRequest = {
  directoryRelativePath: string;
  kind: "file" | "directory";
};

export function CreateEntryDialog({
  request,
  workspace,
  showCreated,
  onClose,
}: {
  request: CreateRequest;
  workspace: Workspace;
  showCreated: (relativePath: string) => Promise<void>;
  onClose: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const noun = request.kind === "directory" ? "folder" : "file";
  const place = request.directoryRelativePath === "" ? workspace.rootName : request.directoryRelativePath;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    void rpc
      .call("createEntry", { rootId: workspace.rootId, ...request, name })
      .then(async (result) => {
        if (!result.ok) {
          setError(result.message);
          return;
        }
        await showCreated(result.relativePath);
        onClose();
      })
      .catch(() => setError(`Could not create the ${noun}.`))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="break-words">New {noun} in {place}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            aria-label={`Name of the new ${noun}`}
            placeholder={request.kind === "directory" ? "Folder name" : "File name with extension"}
            value={name}
            onChange={(event) => { setName(event.target.value); setError(null); }}
          />
          {error !== null ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy || name.trim() === ""}>Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
