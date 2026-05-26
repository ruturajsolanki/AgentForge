import { useNavigate, useParams } from "react-router-dom";
import { DemandWorkspace } from "../../../components/demand/DemandWorkspace";
import IDELayout from "../../../components/ide/IDELayout";
import { useShell } from "../../../components/shell/ShellContext";

export default function DemandFilesRoute() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { wsRef } = useShell();

  return (
    <DemandWorkspace publicId={id} active="files">
      {({ demand }) => (
        <div className="h-[calc(100vh-236px)] min-h-[620px] overflow-hidden p-4 sm:p-6">
          <div className="h-full overflow-hidden rounded-xl border border-hairline bg-surface-1">
            <IDELayout
              projectId={id}
              projectPrompt={demand?.raw_text || id}
              onBack={() => navigate(`/demand/${id}/plan`)}
              onOpenSettings={() => navigate("/settings")}
              wsRef={wsRef}
              embedded
            />
          </div>
        </div>
      )}
    </DemandWorkspace>
  );
}
