import { Moon, Sun } from "lucide-react";
import { Button } from "../ui/button";
import { useThemeContext } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeContext();
  const light = theme === "light";
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={toggleTheme}>
      {light ? <Moon /> : <Sun />}
    </Button>
  );
}
