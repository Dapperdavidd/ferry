import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { StorageService } from "@/utils/storage";

export type AppThemeId = "olive" | "slate" | "sand" | "onyx" | "lilac";

export type AppTheme = {
  id: AppThemeId;
  name: string;
  description: string;
  dark: boolean;
  background: string;
  card: string;
  cardStrong: string;
  text: string;
  muted: string;
  faint: string;
  border: string;
  accent: string;
  accentSoft: string;
  primary: string;
  primaryText: string;
  chrome: string;
};

export const APP_THEMES: Record<AppThemeId, AppTheme> = {
  olive: {
    id: "olive",
    name: "Olive",
    description: "Clean, minimal, timeless",
    dark: false,
    background: "#F7F7F4",
    card: "#FFFFFF",
    cardStrong: "#EFF0EB",
    text: "#121310",
    muted: "#6D6F69",
    faint: "#A7A8A3",
    border: "rgba(18,19,16,0.07)",
    accent: "#A7A04F",
    accentSoft: "#E7E3C8",
    primary: "#121310",
    primaryText: "#FFFFFF",
    chrome: "rgba(247,247,244,0.92)",
  },
  slate: {
    id: "slate",
    name: "Slate Blue",
    description: "Modern, calm, premium",
    dark: false,
    background: "#F2F6FB",
    card: "#FFFFFF",
    cardStrong: "#E6EEF8",
    text: "#0E1116",
    muted: "#647184",
    faint: "#9AA8BA",
    border: "rgba(14,17,22,0.07)",
    accent: "#3882F6",
    accentSoft: "#D6E5FA",
    primary: "#0E1116",
    primaryText: "#FFFFFF",
    chrome: "rgba(242,246,251,0.92)",
  },
  sand: {
    id: "sand",
    name: "Warm Sand",
    description: "Unique, warm, sophisticated",
    dark: false,
    background: "#FCF6F4",
    card: "#FFFFFF",
    cardStrong: "#F2E7DF",
    text: "#1A120B",
    muted: "#786A60",
    faint: "#AA9C91",
    border: "rgba(26,18,11,0.07)",
    accent: "#D4A273",
    accentSoft: "#F0DCC9",
    primary: "#1A120B",
    primaryText: "#FFFFFF",
    chrome: "rgba(252,246,244,0.92)",
  },
  onyx: {
    id: "onyx",
    name: "Onyx",
    description: "Bold, modern, moody",
    dark: true,
    background: "#0B0C0C",
    card: "#171918",
    cardStrong: "#1E2120",
    text: "#F3F3EE",
    muted: "#A8ACA7",
    faint: "#737873",
    border: "rgba(255,255,255,0.09)",
    accent: "#B8B15F",
    accentSoft: "#373823",
    primary: "#B8B15F",
    primaryText: "#10110F",
    chrome: "rgba(11,12,12,0.94)",
  },
  lilac: {
    id: "lilac",
    name: "Lilac",
    description: "Clean, distinctive, modern",
    dark: false,
    background: "#F7F7FF",
    card: "#FFFFFF",
    cardStrong: "#EEEAFE",
    text: "#1A1633",
    muted: "#716B8A",
    faint: "#A9A3C0",
    border: "rgba(26,22,51,0.07)",
    accent: "#8E5CF6",
    accentSoft: "#E2D8FC",
    primary: "#1A1633",
    primaryText: "#FFFFFF",
    chrome: "rgba(247,247,255,0.93)",
  },
};

const THEME_KEY = "ferry.appearance-theme";

type AppThemeContextValue = {
  theme: AppTheme;
  themeId: AppThemeId;
  setTheme: (theme: AppThemeId) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<AppThemeId>("olive");

  useEffect(() => {
    let mounted = true;
    void StorageService.getItem<AppThemeId>(THEME_KEY).then((saved) => {
      if (mounted && saved && APP_THEMES[saved]) setThemeId(saved);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setTheme = useCallback((nextTheme: AppThemeId) => {
    setThemeId(nextTheme);
    void StorageService.setItem(THEME_KEY, nextTheme);
  }, []);

  const value = useMemo(
    () => ({ theme: APP_THEMES[themeId], themeId, setTheme }),
    [setTheme, themeId]
  );

  return (
    <AppThemeContext.Provider value={value}>
      {children}
    </AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) {
    throw new Error("useAppTheme must be used within AppThemeProvider");
  }
  return context;
}
