function hexPoints(cx: number, cy: number, size: number) {
  return Array.from({ length: 6 })
    .map((_, index) => {
      const angle = (Math.PI / 3) * index;
      return `${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`;
    })
    .join(" ");
}

const patternCells: Array<[number, number, number, number]> = [
  [332, 60, 16, 0.12],
  [356, 80, 16, 0.12],
  [308, 82, 16, 0.12],
  [332, 104, 16, 0.12],
  [48, 700, 19, 0.1],
  [76, 720, 19, 0.1],
  [328, 760, 13, 0.1],
];

type BrandSvgProps = {
  bgTop: string;
  bgMid: string;
  accent: string;
  border: string;
  gradientId: string;
};

function BrandSvg({ bgTop, bgMid, accent, border, gradientId }: BrandSvgProps) {
  return (
    <svg
      className="h-full w-full"
      viewBox="0 0 400 900"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={bgTop} />
          <stop offset="70%" stopColor={bgMid} />
          <stop offset="100%" stopColor={bgTop} />
        </linearGradient>
      </defs>
      <path d="M0 0 H400 V900 H0 Z" fill={`url(#${gradientId})`} />
      <path
        d="M-10 0 C100 40, 180 20, 280 68 C330 92, 380 78, 420 120"
        stroke={accent}
        strokeOpacity={0.14}
        strokeWidth={18}
        fill="none"
      />
      {patternCells.map(([x, y, size, opacity], index) => (
        <polygon
          key={`${x}-${y}-${index}`}
          points={hexPoints(x, y, size)}
          stroke={border}
          strokeWidth={1}
          fill="transparent"
          opacity={opacity}
        />
      ))}
    </svg>
  );
}

/** Fundo sutil da loja — neutro com toque da cor do tenant */
export function HoneyBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 dark:hidden">
        <BrandSvg
          gradientId="norfood-bg-light"
          bgTop="#F6F7F9"
          bgMid="#FFFFFF"
          accent="var(--tenant-primary, #FF7A00)"
          border="#E5E7EB"
        />
      </div>
      <div className="absolute inset-0 hidden dark:block">
        <BrandSvg
          gradientId="norfood-bg-dark"
          bgTop="#111111"
          bgMid="#1A1A1A"
          accent="var(--tenant-primary, #FF7A00)"
          border="#2E2E2E"
        />
      </div>
    </div>
  );
}
