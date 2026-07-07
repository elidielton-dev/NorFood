import { Component, type ErrorInfo, type ReactNode, useState } from "react";
import { ChunkLoadFallback } from "@/components/shared/chunk-load-fallback";
import { isChunkLoadError } from "@/lib/shared/safe-dynamic-import";

type LazyChunkBoundaryProps = {
  children: ReactNode;
  fallbackTitle?: string;
  resetKey?: string | number;
};

type LazyChunkBoundaryState = {
  error: Error | null;
  blocked: boolean;
};

export class LazyChunkBoundary extends Component<
  LazyChunkBoundaryProps,
  LazyChunkBoundaryState
> {
  state: LazyChunkBoundaryState = { error: null, blocked: false };

  static getDerivedStateFromError(error: Error): LazyChunkBoundaryState {
    return { error, blocked: isChunkLoadError(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[lazy-chunk] Falha ao carregar modulo:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: LazyChunkBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, blocked: false });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <ChunkLoadFallback
          title={
            this.state.blocked
              ? "Recurso bloqueado pelo navegador"
              : "Nao foi possivel carregar este recurso"
          }
          description={
            this.state.blocked
              ? "Seu bloqueador de anuncios ou protecao contra rastreadores impediu o carregamento desta parte do app. Desative o bloqueio para este site ou adicione uma excecao e tente novamente."
              : this.state.error.message
          }
          onRetry={() => this.setState({ error: null, blocked: false })}
        />
      );
    }

    return this.props.children;
  }
}

export function useLazyChunkRetryKey() {
  const [retryKey, setRetryKey] = useState(0);
  return { retryKey, retry: () => setRetryKey((value) => value + 1) };
}
