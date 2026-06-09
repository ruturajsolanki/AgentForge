import { createBrowserRouter, Navigate } from "react-router-dom";
import LoginRoute from "./routes/login";
import ClientHomeRoute from "./routes/client";
import RootRoute from "./routes/root";
import DemandsRoute from "./routes/demands";
import NewDemandRoute from "./routes/demand/new";
import DemandIndexRoute from "./routes/demand/$id";
import DemandPlanRoute from "./routes/demand/$id/plan";
import DemandAgentsRoute from "./routes/demand/$id/agents";
import DemandFilesRoute from "./routes/demand/$id/files";
import DemandPreviewRoute from "./routes/demand/$id/preview";
import DemandTerminalRoute from "./routes/demand/$id/terminal";
import DemandActivityRoute from "./routes/demand/$id/activity";
import DemandDeliveryRoute from "./routes/demand/$id/delivery";
import ModelsRoute from "./routes/models";
import SettingsRoute from "./routes/settings";
import TeamRoute from "./routes/team";
import RequestsRoute from "./routes/requests";
import ReportsRoute from "./routes/reports";
import AuditPage from "./routes/audit";
import RequireRole from "./components/auth/RequireRole";
import DeliveryGallery from "./routes/dev-delivery";
import ProfileRoute from "./routes/profile";
import ExecutiveDashboard from "./routes/dashboard/executive";
import HigherManagerDashboard from "./routes/dashboard/higher-manager";
import ManagerDashboard from "./routes/dashboard/manager";
import MiddlewareDashboard from "./routes/dashboard/middleware";
import LeaderDashboard from "./routes/dashboard/leader";
import DeliveryTeamDashboard from "./routes/dashboard/delivery";
import MemberDashboard from "./routes/dashboard/member";
import ContributorDashboard from "./routes/dashboard/contributor";
import ViewerDashboard from "./routes/dashboard/viewer";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/login" replace /> },
  { path: "/login", element: <LoginRoute /> },
  { path: "/client", element: <ClientHomeRoute /> },
  { path: "/demand/new", element: <NewDemandRoute /> },
  {
    path: "/",
    element: <RootRoute />,
    children: [
      { path: "demands", element: <DemandsRoute /> },
      { path: "requests", element: <RequestsRoute /> },
      { path: "team", element: <TeamRoute /> },
      { path: "demand/:id", element: <DemandIndexRoute /> },
      { path: "demand/:id/plan", element: <DemandPlanRoute /> },
      { path: "demand/:id/agents", element: <DemandAgentsRoute /> },
      { path: "demand/:id/files", element: <DemandFilesRoute /> },
      { path: "demand/:id/preview", element: <DemandPreviewRoute /> },
      { path: "demand/:id/terminal", element: <DemandTerminalRoute /> },
      { path: "demand/:id/activity", element: <DemandActivityRoute /> },
      { path: "demand/:id/delivery", element: <DemandDeliveryRoute /> },
      { path: "models", element: <ModelsRoute /> },
      { path: "settings", element: <SettingsRoute /> },
      {
        path: "reports",
        element: (
          <RequireRole slug={["manager", "higher_manager", "executive"]}>
            <ReportsRoute />
          </RequireRole>
        ),
      },
      {
        path: "audit",
        element: <AuditPage />,
      },
      { path: "dev/delivery", element: <DeliveryGallery /> },
      { path: "profile", element: <ProfileRoute /> },
      {
        path: "dashboard/executive",
        element: (
          <RequireRole slug={["executive", "higher_manager"]}>
            <ExecutiveDashboard />
          </RequireRole>
        ),
      },
      {
        path: "dashboard/higher-manager",
        element: (
          <RequireRole slug="higher_manager">
            <HigherManagerDashboard />
          </RequireRole>
        ),
      },
      {
        path: "dashboard/manager",
        element: (
          <RequireRole slug={["manager", "higher_manager", "executive"]}>
            <ManagerDashboard />
          </RequireRole>
        ),
      },
      {
        path: "dashboard/middleware",
        element: (
          <RequireRole slug={["middleware", "manager", "higher_manager", "executive"]}>
            <MiddlewareDashboard />
          </RequireRole>
        ),
      },
      {
        path: "dashboard/leader",
        element: (
          <RequireRole slug={["leader", "delivery_team", "manager", "higher_manager", "executive"]}>
            <LeaderDashboard />
          </RequireRole>
        ),
      },
      {
        path: "dashboard/delivery",
        element: (
          <RequireRole slug={["delivery_team", "leader", "manager", "higher_manager", "executive"]}>
            <DeliveryTeamDashboard />
          </RequireRole>
        ),
      },
      {
        path: "dashboard/member",
        element: (
          <RequireRole slug={["member", "contributor", "delivery_team", "leader", "manager", "higher_manager", "executive"]}>
            <MemberDashboard />
          </RequireRole>
        ),
      },
      {
        path: "dashboard/contributor",
        element: (
          <RequireRole slug={["contributor", "member", "delivery_team", "leader", "manager", "higher_manager", "executive"]}>
            <ContributorDashboard />
          </RequireRole>
        ),
      },
      {
        path: "dashboard/viewer",
        element: (
          <RequireRole slug={["viewer", "contributor", "member", "delivery_team", "leader", "middleware", "manager", "higher_manager", "executive"]}>
            <ViewerDashboard />
          </RequireRole>
        ),
      },
    ],
  },
]);
