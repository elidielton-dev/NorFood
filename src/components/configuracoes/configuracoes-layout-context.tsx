import { createContext, useContext, type ReactNode } from "react";

const ConfiguracoesLayoutContext = createContext(false);

export function ConfiguracoesLayoutProvider({ children }: { children: ReactNode }) {
  return (
    <ConfiguracoesLayoutContext.Provider value={true}>{children}</ConfiguracoesLayoutContext.Provider>
  );
}

export function useConfiguracoesEmbedded() {
  return useContext(ConfiguracoesLayoutContext);
}
