import { RouterProvider } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "./components/shell/ThemeProvider";
import { router } from "./router";

export default function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" toastOptions={{ className: "border border-hairline-hi bg-surface-3 text-fg" }} />
    </ThemeProvider>
  );
}
