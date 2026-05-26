import { useParams } from "react-router-dom";

export default function DemandPreviewRoute() {
  const { id } = useParams();
  return <div className="p-4 sm:p-6"><h1 className="text-2xl font-semibold text-fg-strong">Preview</h1><p className="mt-2 text-sm text-fg-muted">{id}</p></div>;
}
