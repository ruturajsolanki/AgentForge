import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, persistTheme, type Theme } from "../lib/theme";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  const setTheme = (next: Theme) => setThemeState(next);
  const toggleTheme = () => setThemeState((current) => current === "dark" ? "light" : "dark");

  return { theme, setTheme, toggleTheme };
}
