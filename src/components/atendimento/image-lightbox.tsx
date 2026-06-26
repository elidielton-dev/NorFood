import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, RotateCcw, X } from "lucide-react";

const MIN_SCALE = 1;
const MAX_SCALE = 4;

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function touchDistance(touches: TouchList) {
  if (touches.length < 2) return 0;
  const [a, b] = [touches[0], touches[1]];
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function ImageLightboxOverlay({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPoint = useRef({ x: 0, y: 0 });
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const applyZoomDelta = useCallback((delta: number) => {
    setScale((current) => {
      const next = clampScale(current + delta);
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.deltaY < 0 ? 0.2 : -0.2;
      applyZoomDelta(delta);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [applyZoomDelta]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (scale <= MIN_SCALE) return;
    dragging.current = true;
    lastPoint.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || scale <= MIN_SCALE) return;
    const dx = event.clientX - lastPoint.current.x;
    const dy = event.clientY - lastPoint.current.y;
    lastPoint.current = { x: event.clientX, y: event.clientY };
    setOffset((current) => ({ x: current.x + dx, y: current.y + dy }));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      pinchStart.current = {
        distance: touchDistance(event.touches),
        scale,
      };
    }
  };

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchStart.current) return;
    event.preventDefault();
    const distance = touchDistance(event.touches);
    if (distance <= 0) return;
    const ratio = distance / pinchStart.current.distance;
    const next = clampScale(pinchStart.current.scale * ratio);
    setScale(next);
    if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
  };

  const onTouchEnd = () => {
    pinchStart.current = null;
  };

  const onDoubleClick = () => {
    if (scale > MIN_SCALE) {
      resetView();
      return;
    }
    setScale(2);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/92"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <div
        className="flex items-center justify-end gap-1 p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Diminuir zoom"
          className="rounded-full p-2 text-white/90 transition hover:bg-white/10"
          onClick={() => applyZoomDelta(-0.25)}
        >
          <Minus className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Aumentar zoom"
          className="rounded-full p-2 text-white/90 transition hover:bg-white/10"
          onClick={() => applyZoomDelta(0.25)}
        >
          <Plus className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Resetar zoom"
          className="rounded-full p-2 text-white/90 transition hover:bg-white/10"
          onClick={resetView}
        >
          <RotateCcw className="size-5" />
        </button>
        <button
          type="button"
          aria-label="Fechar imagem"
          className="rounded-full p-2 text-white/90 transition hover:bg-white/10"
          onClick={onClose}
        >
          <X className="size-5" />
        </button>
      </div>

      <div
        ref={viewportRef}
        className="flex flex-1 touch-none items-center justify-center overflow-hidden"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={onDoubleClick}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
          className="max-h-[85vh] max-w-[95vw] select-none object-contain transition-transform duration-100"
        />
      </div>

      <p className="pointer-events-none pb-4 text-center text-xs text-white/60">
        Scroll ou pinça para zoom · arraste para mover · duplo clique para ampliar
      </p>
    </div>,
    document.body,
  );
}

export function ZoomableChatImage({
  src,
  alt,
  className,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  onError?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Abrir imagem ampliada"
        className="block cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/50"
        onClick={() => setOpen(true)}
      >
        <img src={src} alt={alt} className={className} onError={onError} />
      </button>
      {open ? <ImageLightboxOverlay src={src} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
