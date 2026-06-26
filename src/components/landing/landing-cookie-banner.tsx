import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";

const STORAGE_KEY = "norfood-cookie-consent";

export function LandingCookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const accepted = localStorage.getItem(STORAGE_KEY);
      if (!accepted) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] border-t border-[#FF9100]/20 bg-white/95 p-4 shadow-2xl backdrop-blur-md sm:p-5">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#FF9100]/15 text-[#FF9100]">
            <Cookie className="size-5" />
          </div>
          <div className="text-sm text-[#5C4A3A]">
            <p className="font-semibold text-[#1A1A1A]">Nós usamos cookies</p>
            <p className="mt-0.5 leading-relaxed">
              Para melhorar sua experiência, analisar o tráfego e personalizar conteúdo. Ao
              continuar, você concorda com nossa política de privacidade.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={accept}
          className="shrink-0 rounded-full bg-[#FF9100] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#FF5C00]"
        >
          Ok, entendi
        </button>
      </div>
    </div>
  );
}
