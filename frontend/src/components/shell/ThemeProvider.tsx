import { createContext, useContext, type ReactNode } from "react";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../lib/theme";

const ThemeContext = createContext<ReturnType<typeof useTheme> | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useTheme();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useThemeContext must be used inside ThemeProvider");
  return value;
}

export type { Theme };
