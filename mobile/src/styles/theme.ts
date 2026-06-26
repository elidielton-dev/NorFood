import { Theme } from "@react-navigation/native";
import { useColorScheme } from "react-native";

export const lightTheme = {
  background: "#FAF5EB",
  backgroundElevated: "#FFFFFF",
  backgroundMuted: "#F8F0E2",
  backgroundSoft: "#FFF9EF",
  text: "#1E2B20",
  textMuted: "#6A705F",
  textSoft: "#8C846F",
  border: "#ECE7DD",
  borderStrong: "#E1D6C4",
  primary: "#3D5A40",
  primarySoft: "#556B57",
  primaryDeep: "#2E4631",
  accent: "#D8A03D",
  accentBright: "#F2C14E",
  accentSoft: "#F6D98B",
  success: "#6EBC73",
  danger: "#D06351",
  shadow: "rgba(97, 72, 29, 0.14)",
  map: "#EDE3D1",
  route: "#2F5A3E",
  cardGlass: "rgba(255,255,255,0.72)",
};

export const darkTheme = {
  background: "#101713",
  backgroundElevated: "#18211C",
  backgroundMuted: "#202B24",
  backgroundSoft: "#1B251F",
  text: "#F8F4EB",
  textMuted: "#C9C2B4",
  textSoft: "#9B958A",
  border: "#233128",
  borderStrong: "#304037",
  primary: "#79957A",
  primarySoft: "#5E7A60",
  primaryDeep: "#425744",
  accent: "#D8A03D",
  accentBright: "#F2C14E",
  accentSoft: "#8A6A26",
  success: "#77C17B",
  danger: "#E17B6A",
  shadow: "rgba(0,0,0,0.3)",
  map: "#1C241E",
  route: "#C9A24D",
  cardGlass: "rgba(24,33,28,0.8)",
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
    heavy: { fontFamily: "CormorantGaramond_700Bold", fontWeight: "700" },
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
