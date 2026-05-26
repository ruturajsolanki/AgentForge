import { Link, useLocation, useParams } from "react-router-dom";

function title(part: string) {
  if (part === "demands") return "Demands";
  if (part === "demand") return "Demand";
  if (part === "models") return "Models";
  if (part === "team") return "Team";
  if (part === "settings") return "Settings";
  if (part === "new") return "New";
  return part.replace(/-/g, " ");
}

export function Breadcrumbs() {
  const location = useLocation();
  const params = useParams();
  const parts = location.pathname.split("/").filter(Boolean);
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-fg-muted">
      <Link to="/demands" className="font-medium text-fg-strong">ForgeOS</Link>
      {parts.map((part, index) => {
        const href = `/${parts.slice(0, index + 1).join("/")}`;
        const label = part === params.id ? part : title(part);
        return (
          <span key={href} className="flex min-w-0 items-center gap-2">
            <span className="text-fg-faint">/</span>
            <Link to={href} className="truncate capitalize hover:text-fg-strong">{label}</Link>
          </span>
        );
      })}
    </div>
  );
}
