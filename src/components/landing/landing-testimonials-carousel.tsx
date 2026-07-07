import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/shared/utils";

export type Testimonial = {
  name: string;
  city: string;
  text: string;
};

export function LandingTestimonialsCarousel({ items }: { items: Testimonial[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % items.length);
  }, [items.length]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + items.length) % items.length);
  }, [items.length]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(next, 5500);
    return () => window.clearInterval(id);
  }, [next, paused]);

  const current = items[index];

  return (
    <div
      className="relative mx-auto max-w-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <blockquote
        key={current.name + index}
        className="landing-carousel-enter rounded-3xl border border-[#FF9100]/15 bg-[#FFF8F0] p-8 shadow-lg sm:p-10"
      >
        <div className="flex gap-1 text-[#F5C842]">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star key={i} className="size-5 fill-current" />
          ))}
        </div>
        <p className="mt-6 text-lg leading-relaxed text-[#1A1A1A] sm:text-xl">
          &ldquo;{current.text}&rdquo;
        </p>
        <footer className="mt-6 flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-full bg-[#FF9100] text-lg font-bold text-white">
            {current.name.charAt(0)}
          </div>
          <div>
            <p className="font-display text-lg font-bold text-[#1A1A1A]">{current.name}</p>
            <p className="text-sm text-[#8B7355]">{current.city}</p>
          </div>
        </footer>
      </blockquote>

      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={prev}
          aria-label="Depoimento anterior"
          className="grid size-10 place-items-center rounded-full border border-[#FF9100]/25 bg-white text-[#FF9100] transition hover:bg-[#FF9100]/10"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex gap-2">
          {items.map((t, i) => (
            <button
              key={t.name}
              type="button"
              aria-label={`Ir para depoimento ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === index ? "w-8 bg-[#FF9100]" : "w-2 bg-[#FF9100]/30 hover:bg-[#FF9100]/50",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={next}
          aria-label="Próximo depoimento"
          className="grid size-10 place-items-center rounded-full border border-[#FF9100]/25 bg-white text-[#FF9100] transition hover:bg-[#FF9100]/10"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
