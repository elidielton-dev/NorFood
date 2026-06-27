import { Theme } from "@react-navigation/native";
import { useColorScheme } from "react-native";

/** Paleta NorFood — alinhada à plataforma web */
export const lightTheme = {
  background: "#F6F7F9",
  backgroundElevated: "#FFFFFF",
  backgroundMuted: "#EEF0F4",
  backgroundSoft: "#FFF4E8",
  text: "#1A1A1A",
  textMuted: "#6B7280",
  textSoft: "#9CA3AF",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  primary: "#FF7A00",
  primarySoft: "#FF9100",
  primaryDeep: "#FF5A00",
  accent: "#FF9100",
  accentBright: "#FF7A00",
  accentSoft: "#FFD4A8",
  success: "#22C55E",
  danger: "#EF4444",
  shadow: "rgba(26, 26, 26, 0.12)",
  map: "#EEF0F4",
  route: "#FF7A00",
  cardGlass: "rgba(255,255,255,0.88)",
};

export const darkTheme = {
  background: "#0F1115",
  backgroundElevated: "#181B21",
  backgroundMuted: "#22262E",
  backgroundSoft: "#2A1F14",
  text: "#F9FAFB",
  textMuted: "#9CA3AF",
  textSoft: "#6B7280",
  border: "#2D333B",
  borderStrong: "#3D4450",
  primary: "#FF9100",
  primarySoft: "#FF7A00",
  primaryDeep: "#FF5A00",
  accent: "#FF9100",
  accentBright: "#FFB347",
  accentSoft: "#8A4A12",
  success: "#4ADE80",
  danger: "#F87171",
  shadow: "rgba(0,0,0,0.35)",
  map: "#1A1D24",
  route: "#FF9100",
  cardGlass: "rgba(24,27,33,0.92)",
};

export type AppPalette = typeof lightTheme;

export function useAppTheme(): AppPalette {
  return useColorScheme() === "dark" ? darkTheme : lightTheme;
}

export const navigationLightTheme: Theme = {
  dark: false,
  colors: {
    primary: lightTheme.primary,
    background: lightTheme.background,
    card: lightTheme.background,
    text: lightTheme.text,
    border: lightTheme.border,
    notification: lightTheme.accent,
  },
  fonts: {
    regular: { fontFamily: "Manrope_500Medium", fontWeight: "400" },
    medium: { fontFamily: "Manrope_600SemiBold", fontWeight: "500" },
    bold: { fontFamily: "Manrope_700Bold", fontWeight: "700" },
    heavy: { fontFamily: "Manrope_800ExtraBold", fontWeight: "800" },
  },
};

export const navigationDarkTheme: Theme = {
  ...navigationLightTheme,
  dark: true,
  colors: {
    primary: darkTheme.primary,
    background: darkTheme.background,
    card: darkTheme.background,
    text: darkTheme.text,
    border: darkTheme.border,
    notification: darkTheme.accent,
  },
};

export const radii = {
  sm: 14,
  md: 20,
  lg: 28,
  pill: 999,
};

export const spacing = {
  page: 20,
  section: 18,
};
