import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "../../hooks/useSession";
import type { UserRole } from "../../lib/auth";

interface Props {
  slug: UserRole | UserRole[];
  children?: React.ReactNode;
}

export default function RequireRole({ slug, children }: Props) {
  const session = useSession();
  const allowed = Array.isArray(slug) ? slug : [slug];

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const hasAccess = session.roles?.some((r) => allowed.includes(r as UserRole));
  if (!hasAccess) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-700">Access Denied</h2>
          <p className="mt-2 text-sm text-gray-500">
            You need one of these roles: {allowed.join(", ")}
          </p>
        </div>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
