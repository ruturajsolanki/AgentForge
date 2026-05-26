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
import ModelsRoute from "./routes/models";
import SettingsRoute from "./routes/settings";
import TeamRoute from "./routes/team";

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
      { path: "team", element: <TeamRoute /> },
      { path: "demand/:id", element: <DemandIndexRoute /> },
      { path: "demand/:id/plan", element: <DemandPlanRoute /> },
      { path: "demand/:id/agents", element: <DemandAgentsRoute /> },
      { path: "demand/:id/files", element: <DemandFilesRoute /> },
      { path: "demand/:id/preview", element: <DemandPreviewRoute /> },
      { path: "demand/:id/terminal", element: <DemandTerminalRoute /> },
      { path: "models", element: <ModelsRoute /> },
      { path: "settings", element: <SettingsRoute /> },
    ],
  },
]);
