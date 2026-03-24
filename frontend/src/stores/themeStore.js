import { create } from "zustand";

const applyTheme = (resolved) => {
  if (resolved === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
};

const getResolved = (theme) => {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
};

const useThemeStore = create((set, get) => ({
  theme: "system",
  resolvedTheme: "light",

  initTheme: () => {
    const saved = localStorage.getItem("theme") || "system";
    const resolved = getResolved(saved);
    applyTheme(resolved);
    set({ theme: saved, resolvedTheme: resolved });

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", (e) => {
        if (get().theme === "system") {
          const resolved = e.matches ? "dark" : "light";
          applyTheme(resolved);
          set({ resolvedTheme: resolved });
        }
      });
  },

  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    const resolved = getResolved(theme);
    applyTheme(resolved);
    set({ theme, resolvedTheme: resolved });
  },
}));

export default useThemeStore;
