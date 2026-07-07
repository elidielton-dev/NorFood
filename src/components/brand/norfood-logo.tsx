import { cn } from "@/lib/shared/utils";
import { NORFOOD_BRAND_NAME, NORFOOD_LOGO_URL, NORFOOD_TAGLINE, norfoodLogoSrc } from "@/lib/brand/norfood";

type NorfoodLogoProps = {
  /** sm = sidebar colapsada / favicon; md = header; lg = login; xl = hero */
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  imgClassName?: string;
  /** Usa /logo-norfood.png em vez do import do bundler */
  staticUrl?: boolean;
};

const sizeClass: Record<NonNullable<NorfoodLogoProps["size"]>, string> = {
  sm: "h-8 max-w-[2.75rem] object-contain",
  md: "h-10 max-w-[10rem] object-contain",
  lg: "h-14 max-w-[12rem] object-contain",
  xl: "h-20 max-w-[16rem] object-contain sm:h-24",
};

export function NorfoodLogo({
  size = "md",
  className,
  imgClassName,
  staticUrl = false,
}: NorfoodLogoProps) {
  const src = staticUrl ? NORFOOD_LOGO_URL : norfoodLogoSrc;
  return (
    <div className={cn("flex shrink-0 items-center", className)}>
      <img
        src={src}
        alt={`${NORFOOD_BRAND_NAME} — ${NORFOOD_TAGLINE}`}
        className={cn("w-auto", sizeClass[size], imgClassName)}
      />
    </div>
  );
}

/** Logo do tenant ou NorFood como fallback da plataforma */
export function TenantBrandLogo({
  logoUrl,
  name,
  primaryColor,
  size = "md",
  expanded = true,
}: {
  logoUrl: string | null;
  name: string;
  primaryColor: string;
  size?: "sm" | "md";
  expanded?: boolean;
}) {
  const src = logoUrl ?? NORFOOD_LOGO_URL;
  const compact = size === "sm" || !expanded;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn(
          "shrink-0 object-contain",
          compact ? "size-9" : "h-10 w-auto max-w-[11rem]",
        )}
      />
    );
  }

  const dim = size === "sm" ? "size-9" : "size-10";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className={cn(dim, "grid shrink-0 place-items-center rounded-xl text-xs font-bold text-white")}
      style={{ backgroundColor: primaryColor }}
    >
      {initials}
    </div>
  );
}
