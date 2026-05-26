import { Navigate, useLocation } from "react-router-dom";
import { AppShell } from "../components/shell/AppShell";
import { useSession } from "../hooks/useSession";

export default function RootRoute() {
  const session = useSession();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.role === "client") return <Navigate to="/client" replace />;
  return <AppShell />;
}
