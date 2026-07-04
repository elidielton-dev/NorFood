import { Link } from "@tanstack/react-router";
import { NorfoodLogo } from "@/components/brand/norfood-logo";
import { NORFOOD_DEMO_TENANT_SLUG } from "@/lib/tenant/constants";
import { lojaPath } from "@/lib/tenant/painel-routes";
import { cn } from "@/lib/utils";

type LandingSiteHeaderProps = {
  /** Destaca o item ativo no menu */
  active?: "home" | "parceiros";
};

const NAV = [
  { id: "como-pedir", label: "Como pedir", href: "/#como-funciona" },
  { id: "categorias", label: "Categorias", href: "/#categorias" },
  { id: "restaurantes", label: "Restaurantes", href: "/#para-restaurantes" },
  { id: "vantagens", label: "Vantagens", href: "/#vantagens" },
  { id: "parceiros", label: "Parceiros", href: "/parceiros", isRoute: true },
  { id: "depoimentos", label: "Depoimentos", href: "/#depoimentos" },
] as const;

export function LandingSiteHeader({ active = "home" }: LandingSiteHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-[#FF9100]/15 bg-white/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/">
          <NorfoodLogo size="md" />
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-[#5C4A3A] md:flex">
          {NAV.map((item) => {
            const isActive = item.id === "parceiros" && active === "parceiros";

            if (item.isRoute) {
              return (
                <Link
                  key={item.id}
                  to="/parceiros"
                  className={cn(
                    "transition hover:text-[#FF9100]",
                    isActive && "font-semibold text-[#FF9100]",
                  )}
                >
                  {item.label}
                </Link>
              );
            }

            return (
              <a
                key={item.id}
                href={item.href}
                className="transition hover:text-[#FF9100]"
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {active === "parceiros" ? (
            <a
              href="#contato"
              className="hidden rounded-full border-2 border-[#FF9100] px-4 py-2 text-sm font-semibold text-[#FF9100] transition hover:bg-[#FF9100]/10 sm:inline-flex"
            >
              Quero ser parceiro
            </a>
          ) : (
            <Link
              to="/parceiros"
              className="hidden rounded-full border-2 border-[#FF9100] px-4 py-2 text-sm font-semibold text-[#FF9100] transition hover:bg-[#FF9100]/10 sm:inline-flex"
            >
              Quero ser parceiro
            </Link>
          )}
          <Link
            to={lojaPath(NORFOOD_DEMO_TENANT_SLUG)}
            className="rounded-full bg-[#FF9100] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-[#FF9100]/30 transition hover:bg-[#FF5C00]"
          >
            Pedir agora
          </Link>
        </div>
      </div>
    </header>
  );
}
