import { Download, ExternalLink, FileCode2 } from "lucide-react";
import { Button } from "../ui/button";

export function ArtifactCard({
  files,
}: {
  files: string[];
}) {
  return (
    <div className="animate-in rounded-xl border border-hairline bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileCode2 className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-fg-strong">Artifacts ready</h3>
        </div>
        <span className="font-mono text-xs text-fg-muted">{files.length} files</span>
      </div>
      <div className="mt-3 grid gap-2">
        {files.map((file) => (
          <div key={file} className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-surface-1 p-2">
            <span className="truncate font-mono text-xs text-fg">{file}</span>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" aria-label={`Open ${file}`}>
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Download ${file}`}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
