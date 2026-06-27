import { useMemo } from "react";
import { useAppData } from "../context/AppDataContext";
import { darkTheme, lightTheme, type AppPalette } from "../styles/theme";
import { useColorScheme } from "react-native";

export function useTenantTheme(): AppPalette {
  const scheme = useColorScheme();
  const base = scheme === "dark" ? darkTheme : lightTheme;
  const { state } = useAppData();
  const tenant = state.tenant;

  return useMemo(() => {
    if (!tenant?.primaryColor) return base;
    return {
      ...base,
      primary: tenant.primaryColor,
      primarySoft: tenant.accentColor || tenant.primaryColor,
      primaryDeep: tenant.secondaryColor || base.primaryDeep,
      accent: tenant.accentColor || tenant.primaryColor,
      accentBright: tenant.primaryColor,
    };
  }, [base, tenant]);
}
