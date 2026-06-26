import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Hook de tema claro/escuro.
 * - Persiste a escolha em localStorage.
 * - Respeita a preferência do sistema na primeira visita.
 * - Alterna a classe `dark` no <html>.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = (typeof window !== "undefined" &&
      localStorage.getItem("am-theme")) as Theme | null;
    const prefersDark =
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial: Theme = stored ?? (prefersDark ? "dark" : "light");
    setTheme(initial);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("am-theme", theme);
  }, [theme]);

  return {
    theme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}
