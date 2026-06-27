import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  Heart,
  Home as HomeIcon,
  MapPinned,
  Minus,
  Moon,
  Plus,
  Search,
  Share2,
  ShoppingBag,
  Star,
  Sun,
  Ticket as TicketIcon,
  Trash2,
  User,
} from "lucide-react";
import { HoneyBackground } from "@/components/honey-background";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTenantOptional } from "@/lib/tenant/tenant-context";
import { getTenantInitials } from "@/lib/tenant/tenant-branding";
import { NORFOOD_LOGO_URL } from "@/lib/brand/norfood";
import {
  categoriasFallback,
  docesFallback,
  formatBRL,
  inferCategoryEmoji,
  inferCategorySlug,
  resolveProductImage,
  type CategoriaCardapio,
  type CategoriaId,
  type Doce,
} from "@/lib/cardapio";
import {
  CarrinhoProvider,
  buildCarrinhoItemKey,
  getCarrinhoUnitPrice,
  mapCartItemToOrderItem,
  useCarrinho,
} from "@/lib/carrinho";
import { fetchCatalogExtrasServer, type CatalogExtras } from "@/lib/api/catalog-extras.functions";
import { fetchOperationalStatusServer } from "@/lib/api/operational-config.functions";
import { ProductCustomizerSheet } from "@/components/product-customizer-sheet";
import {
  getMercadoPagoCheckoutUrlFromOrder,
  getOrderPaymentModeFromOrder,
  getMercadoPagoPixQrCodeBase64FromOrder,
  getMercadoPagoPixQrCodeFromOrder,
  getMercadoPagoPaymentStatusFromOrder,
  getMercadoPagoTicketUrlFromOrder,
  itensDoPedido,
  listarCategorias,
  listarPedidos,
  listarProdutos,
  type PedidoItem,
  type PedidoStatus,
} from "@/lib/db";
import {
  completeCustomerPasswordReset,
  ensureDemoLocalCustomerAccount,
  getCurrentCustomerAccount,
  isCustomerRecoveryMode,
  signInCustomerAccount,
  signOutCustomerAccount,
  signUpCustomerAccount,
  startCustomerPasswordReset,
  subscribeCustomerAuth,
  updateCurrentCustomerAccount,
  verifyCustomerPasswordResetCode,
  type CustomerAccount,
} from "@/lib/customer-auth";
import { getDeliveryFeeForNeighborhood } from "@/lib/delivery-pricing";
import { supabase } from "@/integrations/supabase/client";
import {
  SERVICE_CITY_CONFIG,
  getSupportedNeighborhoods,
  isSupportedCityCep,
} from "@/lib/city-config";
import { fetchAddressByCep, formatCep, normalizeCep } from "@/lib/viacep";
import { useTheme } from "@/hooks/use-theme";
import { OrderTrackingMap } from "@/components/order-tracking-map-lazy";
import { createDeliveryOrder } from "@/lib/api/orders.functions";
import { getTenantAccessStatusServer } from "@/lib/api/platform-billing.functions";
import { createMesaQrOrder, resolveMesaByToken } from "@/lib/api/mesa-order.functions";
import { validateCouponServer } from "@/lib/api/coupons.functions";
import { expirePendingMercadoPagoOrders } from "@/lib/api/mercado-pago.functions";
import {
  requestBrowserDeviceLocation,
  type BrowserDeviceLocation,
} from "@/lib/browser-geolocation";

type Tab = "home" | "favoritos" | "carrinho" | "ofertas" | "perfil";

type PaymentMethodOption = "pix" | "credito" | "debito" | "dinheiro";

type DeliveryOrderResponse = {
  id: string;
  numero: number;
  status: PedidoStatus;
  payment_pix_qr_code?: string;
  payment_pix_qr_code_base64?: string;
  payment_ticket_url?: string | null;
  payment_redirect_required?: boolean;
  payment_checkout_url?: string;
};

type CustomerOrderPreview = {
  id: string;
  numero: number;
  total: number;
  subtotal: number;
  taxaEntrega: number;
  trocoPara: number | null;
  status: PedidoStatus;
  createdAt: string;
  endereco: string | null;
  observacoes: string | null;
  formaPagamento: string | null;
  paymentMode: string | null;
  paymentStatus: string | null;
  paymentCheckoutUrl: string | null;
  paymentPixQrCode: string | null;
  paymentPixQrCodeBase64: string | null;
  paymentTicketUrl: string | null;
};

type CustomerOrderDetail = CustomerOrderPreview & {
  itens: PedidoItem[];
};

const CUSTOMER_REALTIME_ENABLED = Boolean(
  (import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL) &&
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY),
);
const SUPPORTED_NEIGHBORHOODS = getSupportedNeighborhoods();
const SUPPORTED_NEIGHBORHOOD_NAMES = SUPPORTED_NEIGHBORHOODS.map((item) => item.name);

async function getCustomerAuthorizationHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return undefined;
  return { Authorization: `Bearer ${token}` };
}

export function AppAbelhaMel({
  mesaToken = null,
  menuSourceLabel = null,
}: {
  mesaToken?: string | null;
  menuSourceLabel?: string | null;
}) {
  return (
    <CarrinhoProvider>
      <Shell mesaToken={mesaToken} menuSourceLabel={menuSourceLabel} />
    </CarrinhoProvider>
  );
}

function Shell({
  mesaToken,
  menuSourceLabel,
}: {
  mesaToken: string | null;
  menuSourceLabel: string | null;
}) {
  const [tab, setTab] = useState<Tab>("home");
  const [doceAtivo, setDoceAtivo] = useState<Doce | null>(null);
  const [customer, setCustomer] = useState<CustomerAccount | null>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrderPreview[]>([]);
  const [catalogCategories, setCatalogCategories] =
    useState<CategoriaCardapio[]>(categoriasFallback);
  const [catalogProducts, setCatalogProducts] = useState<Doce[]>(docesFallback);
  const [catalogExtras, setCatalogExtras] = useState<CatalogExtras | null>(null);
  const [lojaAberta, setLojaAberta] = useState(true);
  const [customizingDoce, setCustomizingDoce] = useState<Doce | null>(null);
  const [ordersVersion, setOrdersVersion] = useState(0);
  const [mesaInfo, setMesaInfo] = useState<{ numero: number; status: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const mesaMode = Boolean(mesaToken);
  const tenantCtx = useTenantOptional();
  const brandName = tenantCtx?.tenant.name ?? "NorFood";
  const brandColor = tenantCtx?.tenant.primary_color ?? "#FF9100";
  const brandLogo = tenantCtx?.tenant.logo_url ?? NORFOOD_LOGO_URL;
  const tenantSlug = tenantCtx?.tenant.slug;

  const { data: tenantAccess } = useQuery({
    queryKey: ["tenant-access-loja", tenantSlug],
    queryFn: () => getTenantAccessStatusServer({ data: tenantSlug! }),
    enabled: Boolean(tenantSlug),
    staleTime: 30_000,
  });

  useEffect(() => {
    ensureDemoLocalCustomerAccount();
  }, []);

  useEffect(() => {
    if (!mesaToken) return;
    void resolveMesaByToken({ data: { qrcodeToken: mesaToken } })
      .then((mesa) => setMesaInfo({ numero: mesa.numero, status: mesa.status }))
      .catch(() => setMesaInfo(null));
  }, [mesaToken]);
  const { totalItens, adicionar } = useCarrinho();

  function handleQuickAdd(doce: Doce) {
    const variacoes = catalogExtras?.variacoesByProduto[doce.id] ?? [];
    const adicionais = catalogExtras?.adicionais ?? [];
    if (variacoes.length || adicionais.length) {
      setCustomizingDoce(doce);
      return;
    }
    const promo = catalogExtras?.promocoesByProduto[doce.id];
    adicionar(doce, 1, { precoUnitario: promo?.precoPromocional ?? doce.preco });
  }

  useEffect(() => {
    if (!mesaMode) return;
    if (tab === "favoritos" || tab === "ofertas") {
      setTab("home");
    }
  }, [mesaMode, tab]);

  useEffect(() => {
    let active = true;

    const loadCatalog = async () => {
      try {
        const [categoriasDb, produtosDb] = await Promise.all([
          listarCategorias(),
          listarProdutos(),
        ]);
        if (!active) return;

        const nextCategories: CategoriaCardapio[] = [
          { id: "todos", nome: "Todos", emoji: "?" },
          ...categoriasDb.map((categoria) => ({
            id: categoria.id,
            nome: categoria.nome,
            emoji: categoria.emoji ?? inferCategoryEmoji(categoria.nome),
          })),
        ];

        const nextProducts: Doce[] = produtosDb
          .filter((produto) => produto.ativo)
          .map((produto) => {
            const categoria = categoriasDb.find((item) => item.id === produto.categoria_id);
            const categoriaId = categoria?.id ?? inferCategorySlug(produto.nome);

            return {
              id: produto.id,
              nome: produto.nome,
              descricao: produto.descricao ?? `Item do cardápio ${brandName}.`,
              preco: produto.preco,
              imagem: resolveProductImage(categoriaId, produto.imagem_url),
              categoria: categoriaId,
              tempoPreparoMin: produto.tempo_preparo_min,
              calorias: produto.calorias ?? 0,
              destaque: produto.destaque,
              avaliacao: 4.9,
            };
          });

        setCatalogCategories(nextCategories);
        setCatalogProducts(nextProducts.length ? nextProducts : docesFallback);
      } catch {
        if (!active) return;
        setCatalogCategories(categoriasFallback);
        setCatalogProducts(docesFallback);
      }
    };

    void loadCatalog();
    void fetchCatalogExtrasServer()
      .then(setCatalogExtras)
      .catch(() => setCatalogExtras(null));
    void fetchOperationalStatusServer()
      .then((config) => setLojaAberta(config.loja_aberta))
      .catch(() => setLojaAberta(true));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const syncCustomer = async () => {
      const account = await getCurrentCustomerAccount();
      if (active) setCustomer(account);
    };

    void syncCustomer();
    const unsubscribe = subscribeCustomerAuth((change) => {
      if (!active) return;
      setCustomer(change.account);
    });

    const onStorage = () => {
      void syncCustomer();
    };

    window.addEventListener("storage", onStorage);

    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!customer) {
      setCustomerOrders([]);
      return;
    }

    let active = true;

    const loadOrders = async () => {
      const pedidos = await listarPedidos();
      if (!active) return;

      setCustomerOrders(
        pedidos
          .filter((pedido) => pedido.cliente_id === customer.id)
          .slice(0, 12)
          .map((pedido) => ({
            id: pedido.id,
            numero: pedido.numero,
            total: pedido.total,
            subtotal: pedido.subtotal,
            taxaEntrega: pedido.taxa_entrega,
            trocoPara: pedido.troco_para ?? null,
            status: pedido.status,
            createdAt: pedido.created_at,
            endereco: pedido.endereco,
            observacoes: pedido.observacoes,
            formaPagamento: pedido.forma_pagamento,
            paymentMode: getOrderPaymentModeFromOrder(pedido),
            paymentStatus: getMercadoPagoPaymentStatusFromOrder(pedido),
            paymentCheckoutUrl: getMercadoPagoCheckoutUrlFromOrder(pedido),
            paymentPixQrCode: getMercadoPagoPixQrCodeFromOrder(pedido),
            paymentPixQrCodeBase64: getMercadoPagoPixQrCodeBase64FromOrder(pedido),
            paymentTicketUrl: getMercadoPagoTicketUrlFromOrder(pedido),
          })),
      );
    };

    void loadOrders();
    const channel = CUSTOMER_REALTIME_ENABLED
      ? supabase
          .channel(`customer-orders-${customer.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "pedidos",
              filter: `cliente_id=eq.${customer.id}`,
            },
            () => {
              void loadOrders();
            },
          )
          .subscribe()
      : null;

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [customer, ordersVersion]);

  useEffect(() => {
    if (!customer) return;

    let active = true;

    const syncExpiredPixOrders = async () => {
      try {
        await expirePendingMercadoPagoOrders();
        if (active) {
          setOrdersVersion((value) => value + 1);
        }
      } catch {
        // noop
      }
    };

    void syncExpiredPixOrders();
    const intervalId = window.setInterval(() => {
      void syncExpiredPixOrders();
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [customer, customer?.id]);

  return (
    <div className="relative isolate min-h-screen overflow-hidden text-foreground">
      <HoneyBackground />
      <div className="relative z-10 mx-auto min-h-screen max-w-md pb-28">
        {doceAtivo ? (
          <DetalheDoce
            doce={doceAtivo}
            extras={catalogExtras}
            onVoltar={() => setDoceAtivo(null)}
          />
        ) : (
          <>
            <Header
              theme={theme}
              onToggleTheme={toggle}
              customer={customer}
              onOpenProfile={() => setTab("perfil")}
              onOpenSearch={() => setSearchOpen(true)}
              menuSourceLabel={menuSourceLabel}
              mesaInfo={mesaInfo}
              brandName={brandName}
              brandColor={brandColor}
              brandLogo={brandLogo}
            />
            {!lojaAberta ? (
              <div className="mx-4 mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                A loja está fechada no momento. Novos pedidos ficam temporariamente indisponíveis.
              </div>
            ) : null}
            {tenantAccess && !tenantAccess.allowed ? (
              <div className="mx-4 mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                {tenantAccess.message}
              </div>
            ) : null}
            {tab === "home" && (
              <Home
                categories={catalogCategories}
                products={catalogProducts}
                onAbrirDoce={setDoceAtivo}
                onQuickAdd={handleQuickAdd}
                mesaInfo={mesaInfo}
              />
            )}
            {tab === "favoritos" && (
              <Placeholder
                titulo="Seus favoritos"
                subtitulo="Seus itens salvos aparecem aqui para facilitar os proximos pedidos."
              />
            )}
            {tab === "carrinho" && (
              tenantAccess && !tenantAccess.allowed ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  <p>{tenantAccess.message}</p>
                  <p className="mt-2">O carrinho ficará disponível após regularizar o plano.</p>
                </div>
              ) : (
              <Carrinho
                customer={customer}
                mesaToken={mesaToken}
                mesaInfo={mesaInfo}
                tenantSlug={tenantSlug}
                onRequireProfile={() => setTab("perfil")}
                onOrderCreated={(options) => {
                  setOrdersVersion((value) => value + 1);
                  if (!options?.keepCheckoutVisible) {
                    setTab(mesaMode ? "home" : "perfil");
                  }
                }}
              />
              )
            )}
            {tab === "ofertas" && (
              <Placeholder
                titulo="Cupons e Ofertas"
                subtitulo="Quando houver promocoes ativas, elas vao aparecer aqui."
              />
            )}
            {tab === "perfil" && (
              <PerfilCliente
                customer={customer}
                orders={customerOrders}
                onProfileChanged={() => setOrdersVersion((value) => value + 1)}
              />
            )}
          </>
        )}

        {!doceAtivo ? (
          <BottomNav tab={tab} onChange={setTab} badge={totalItens} mesaMode={mesaMode} />
        ) : null}
        {customizingDoce ? (
          <ProductCustomizerSheet
            doce={customizingDoce}
            extras={catalogExtras}
            onClose={() => setCustomizingDoce(null)}
            onConfirm={(payload) => {
              adicionar(customizingDoce, payload.quantidade, {
                variacaoId: payload.variacaoId,
                variacaoNome: payload.variacaoNome,
                adicionais: payload.adicionais,
                precoUnitario: payload.precoUnitario,
              });
              setCustomizingDoce(null);
            }}
          />
        ) : null}
        <CatalogSearchPanel
          open={searchOpen}
          onOpenChange={setSearchOpen}
          products={catalogProducts}
          onSelect={(doce) => {
            setSearchOpen(false);
            setDoceAtivo(doce);
          }}
          onQuickAdd={(doce) => {
            setSearchOpen(false);
            handleQuickAdd(doce);
          }}
        />
      </div>
    </div>
  );
}

function CatalogSearchPanel({
  open,
  onOpenChange,
  products,
  onSelect,
  onQuickAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Doce[];
  onSelect: (doce: Doce) => void;
  onQuickAdd: (doce: Doce) => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open]);

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return products.slice(0, 16);
    return products.filter(
      (doce) =>
        doce.nome.toLowerCase().includes(normalized) ||
        doce.descricao.toLowerCase().includes(normalized),
    );
  }, [products, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[8%] max-h-[84vh] max-w-md translate-y-0 gap-0 overflow-hidden rounded-3xl p-0">
        <DialogHeader className="border-b border-border px-5 pb-4 pt-5 text-left">
          <DialogTitle className="font-display text-xl">Buscar no cardapio</DialogTitle>
          <DialogDescription>Busque pelo nome do item no cardápio.</DialogDescription>
        </DialogHeader>
        <div className="px-5 pt-4">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 shadow-soft">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex.: acarajé, combo, suco..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>
        <div className="max-h-[52vh] overflow-y-auto px-5 py-4">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum produto encontrado para &quot;{query.trim()}&quot;.
            </p>
          ) : (
            <ul className="space-y-3">
              {results.map((doce) => (
                <li key={doce.id}>
                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft">
                    <button
                      type="button"
                      onClick={() => onSelect(doce)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <img
                        src={doce.imagem}
                        alt={doce.nome}
                        className="size-14 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{doce.nome}</p>
                        <p className="truncate text-xs text-muted-foreground">{doce.descricao}</p>
                        <p className="mt-1 text-sm font-semibold text-gold">{formatBRL(doce.preco)}</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Adicionar ${doce.nome}`}
                      onClick={() => onQuickAdd(doce)}
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-sage text-primary-foreground"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Header({
  theme,
  onToggleTheme,
  customer,
  onOpenProfile,
  onOpenSearch,
  menuSourceLabel,
  mesaInfo,
  brandName,
  brandColor,
  brandLogo,
}: {
  theme: string;
  onToggleTheme: () => void;
  customer: CustomerAccount | null;
  onOpenProfile: () => void;
  onOpenSearch: () => void;
  menuSourceLabel: string | null;
  mesaInfo: { numero: number; status: string } | null;
  brandName: string;
  brandColor: string;
  brandLogo: string | null;
}) {
  return (
    <header className="flex items-center justify-between px-5 pb-3 pt-6 animate-fade-up">
      <div className="flex items-center gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center">
          {brandLogo ? (
            <img src={brandLogo} alt="" className="h-10 w-auto max-w-[3rem] object-contain" />
          ) : (
            <div
              className="grid size-12 place-items-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: brandColor }}
            >
              {getTenantInitials(brandName)}
            </div>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {mesaInfo
              ? `Mesa ${mesaInfo.numero} · pedido pelo QR`
              : customer
                ? `Ola, ${firstName(customer.name)}`
                : "Ola, seja bem-vindo(a)"}
          </p>
          <h1 className="text-xl font-semibold leading-tight">{brandName}</h1>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <IconBtn onClick={onToggleTheme} label="Alternar tema">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </IconBtn>
        <IconBtn onClick={onOpenSearch} label="Buscar">
          <Search className="size-4" />
        </IconBtn>
        <button
          onClick={onOpenProfile}
          aria-label={customer ? "Abrir perfil" : "Entrar"}
          className="grid size-10 place-items-center rounded-full gradient-sage text-primary-foreground shadow-soft transition hover:shadow-glow active:scale-95"
        >
          <User className="size-4" />
        </button>
      </div>
    </header>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="grid size-10 place-items-center rounded-full border border-border bg-card text-foreground/80 transition-all hover:text-foreground hover:shadow-soft active:scale-95"
    >
      {children}
    </button>
  );
}

function Home({
  categories,
  products,
  onAbrirDoce,
  onQuickAdd,
  mesaInfo,
}: {
  categories: CategoriaCardapio[];
  products: Doce[];
  onAbrirDoce: (doce: Doce) => void;
  onQuickAdd: (doce: Doce) => void;
  mesaInfo: { numero: number; status: string } | null;
}) {
  const [cat, setCat] = useState<CategoriaId>("todos");
  const lista = cat === "todos" ? products : products.filter((doce) => doce.categoria === cat);
  const destaques = products.filter((doce) => doce.destaque);

  return (
    <main className="space-y-6 px-5">
      {mesaInfo ? (
        <div className="rounded-2xl border border-[color:var(--honey-line)] bg-[color:var(--gestao-cream)]/40 px-4 py-3 text-sm text-muted-foreground">
          Voce esta na <strong className="text-foreground">Mesa {mesaInfo.numero}</strong>. Adicione
          itens ao carrinho e envie o pedido direto para a cozinha.
        </div>
      ) : null}
      <section className="animate-fade-up" style={{ animationDelay: "60ms" }}>
        <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
          {categories.map((categoria) => {
            const ativo = cat === categoria.id;
            return (
              <button
                key={categoria.id}
                onClick={() => setCat(categoria.id)}
                className={`shrink-0 flex flex-col items-center gap-1.5 rounded-2xl border px-4 py-3 transition-all ${
                  ativo
                    ? "gradient-sage border-transparent text-primary-foreground shadow-soft"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <span className="text-2xl">{categoria.emoji}</span>
                <span className="text-xs font-medium">{categoria.nome}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="animate-fade-up" style={{ animationDelay: "120ms" }}>
        <div className="relative overflow-hidden rounded-3xl shadow-soft">
          <div className="h-40 w-full bg-gradient-to-br from-[#FF9100] to-[#FF5C00]" />
          <div className="absolute inset-0 flex flex-col justify-center p-5 text-white">
            <span className="text-xs uppercase tracking-widest text-white/80">Promoção</span>
            <p className="text-2xl font-semibold leading-tight">Delivery rápido</p>
            <p className="mb-3 text-xs text-white/90">Peça pelo app e acompanhe em tempo real</p>
            <button className="self-start rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#FF9100] shadow transition hover:scale-[1.03]">
              Ver cardápio
            </button>
          </div>
        </div>
      </section>

      <section className="animate-fade-up" style={{ animationDelay: "180ms" }}>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl">Mais Pedidos</h2>
            <p className="text-xs text-muted-foreground">Os queridinhos da casa</p>
          </div>
          <button className="text-xs font-medium text-gold">Ver todos</button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {destaques.slice(0, 2).map((doce) => (
            <CardDoce
              key={doce.id}
              doce={doce}
              onClick={() => onAbrirDoce(doce)}
              onQuickAdd={onQuickAdd}
            />
          ))}
        </div>
      </section>

      <section className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <h2 className="mb-3 font-display text-2xl">Cardapio</h2>
        <div className="grid grid-cols-2 gap-4">
          {lista.map((doce) => (
            <CardDoce
              key={doce.id}
              doce={doce}
              onClick={() => onAbrirDoce(doce)}
              onQuickAdd={onQuickAdd}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function CardDoce({
  doce,
  onClick,
  onQuickAdd,
}: {
  doce: Doce;
  onClick: () => void;
  onQuickAdd: (doce: Doce) => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-3xl border border-border bg-card p-3 text-left shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-glow"
    >
      <div className="mb-3 aspect-square overflow-hidden rounded-2xl bg-blush-soft">
        <img
          src={doce.imagem}
          alt={doce.nome}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </div>
      <p className="line-clamp-1 text-sm font-medium leading-snug">{doce.nome}</p>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Flame className="size-3 text-gold" /> {doce.calorias} kcal
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" /> {doce.tempoPreparoMin} min
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-lg font-medium text-foreground">{formatBRL(doce.preco)}</span>
        <span
          role="button"
          onClick={(event) => {
            event.stopPropagation();
            onQuickAdd(doce);
          }}
          className="grid size-8 place-items-center rounded-full bg-sage text-primary-foreground shadow-soft transition hover:scale-110"
        >
          <Plus className="size-4" />
        </span>
      </div>
    </button>
  );
}

function useBrandName() {
  const tenantCtx = useTenantOptional();
  return tenantCtx?.tenant.name ?? "NorFood";
}

function DetalheDoce({
  doce,
  extras,
  onVoltar,
}: {
  doce: Doce;
  extras: CatalogExtras | null;
  onVoltar: () => void;
}) {
  const brandName = useBrandName();
  const { adicionar } = useCarrinho();
  const variacoes = extras?.variacoesByProduto[doce.id] ?? [];
  const promo = extras?.promocoesByProduto[doce.id];
  const basePrice = promo?.precoPromocional ?? doce.preco;

  const [qtd, setQtd] = useState(1);
  const [variacaoId, setVariacaoId] = useState(variacoes[0]?.id ?? "");
  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});

  const variacao = variacoes.find((item) => item.id === variacaoId);
  const unitBase = variacao?.preco ?? basePrice;

  const adicionais = (extras?.adicionais ?? [])
    .map((addon) => ({
      id: addon.id,
      nome: addon.nome,
      quantidade: selectedAddons[addon.id] ?? 0,
      preco: addon.preco,
      max: addon.max,
    }))
    .filter((addon) => addon.quantidade > 0)
    .map(({ max: _max, ...addon }) => addon);

  const totalUnit =
    unitBase + adicionais.reduce((sum, addon) => sum + addon.preco * addon.quantidade, 0);
  const total = totalUnit * qtd;

  return (
    <div className="animate-fade-up">
      <div className="relative h-80 bg-blush-soft">
        <img src={doce.imagem} alt={doce.nome} className="h-full w-full object-cover" />
        <div className="absolute inset-x-5 top-5 flex items-center justify-between">
          <IconBtn onClick={onVoltar} label="Voltar">
            <ArrowLeft className="size-4" />
          </IconBtn>
          <div className="flex gap-2">
            <IconBtn label="Favoritar">
              <Heart className="size-4" />
            </IconBtn>
            <IconBtn label="Compartilhar">
              <Share2 className="size-4" />
            </IconBtn>
          </div>
        </div>
      </div>

      <div className="relative -mt-6 rounded-t-3xl bg-background px-5 pt-5">
        <h2 className="font-display text-3xl">{doce.nome}</h2>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{brandName}</span>
          <span className="inline-flex items-center gap-1 text-gold">
            <Star className="size-3 fill-current" /> {doce.avaliacao}
          </span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{doce.descricao}</p>

        {promo?.precoPromocional != null ? (
          <p className="mt-3 text-sm font-medium text-sage">
            Promoção: {formatBRL(promo.precoPromocional)}
          </p>
        ) : null}

        {variacoes.length > 0 ? (
          <div className="mt-6 rounded-2xl border border-border bg-blush-soft p-4 dark:bg-card">
            <p className="mb-2 text-xs font-medium">Variação</p>
            <div className="flex flex-wrap gap-2">
              {variacoes.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setVariacaoId(item.id)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    variacaoId === item.id ? "border-sage bg-sage/10" : "border-border"
                  }`}
                >
                  {item.nome} · {formatBRL(item.preco)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {(extras?.adicionais?.length ?? 0) > 0 ? (
          <div className="mt-6 rounded-2xl border border-border bg-blush-soft p-4 dark:bg-card">
            <p className="mb-2 text-xs font-medium">Adicionais</p>
            {extras?.adicionais.map((addon) => (
              <div key={addon.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p>{addon.nome}</p>
                  <p className="text-xs text-muted-foreground">{formatBRL(addon.preco)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="grid size-7 place-items-center rounded-full border"
                    onClick={() =>
                      setSelectedAddons((current) => ({
                        ...current,
                        [addon.id]: Math.max(0, (current[addon.id] ?? 0) - 1),
                      }))
                    }
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className="w-5 text-center">{selectedAddons[addon.id] ?? 0}</span>
                  <button
                    className="grid size-7 place-items-center rounded-full bg-sage text-primary-foreground"
                    onClick={() =>
                      setSelectedAddons((current) => ({
                        ...current,
                        [addon.id]: Math.min(addon.max, (current[addon.id] ?? 0) + 1),
                      }))
                    }
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mb-6 mt-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 rounded-full border border-border bg-card px-2 py-1">
            <button
              onClick={() => setQtd((value) => Math.max(1, value - 1))}
              className="grid size-9 place-items-center rounded-full hover:bg-muted"
            >
              <Minus className="size-4" />
            </button>
            <span className="w-6 text-center font-medium">{qtd}</span>
            <button
              onClick={() => setQtd((value) => value + 1)}
              className="grid size-9 place-items-center rounded-full bg-sage text-primary-foreground"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <button
            onClick={() => {
              adicionar(doce, qtd, {
                variacaoId: variacao?.id,
                variacaoNome: variacao?.nome,
                adicionais: adicionais.length ? adicionais : undefined,
                precoUnitario: unitBase,
              });
              onVoltar();
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-full gradient-sage py-3.5 font-medium text-primary-foreground shadow-soft transition hover:shadow-glow"
          >
            <ShoppingBag className="size-4" />
            <span className="font-medium">Adicionar - {formatBRL(total)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Carrinho({
  customer,
  mesaToken,
  mesaInfo,
  tenantSlug,
  onRequireProfile,
  onOrderCreated,
}: {
  customer: CustomerAccount | null;
  mesaToken: string | null;
  mesaInfo: { numero: number; status: string } | null;
  tenantSlug?: string;
  onRequireProfile: () => void;
  onOrderCreated: (options?: { keepCheckoutVisible?: boolean }) => void;
}) {
  const brandName = useBrandName();
  const { itens, ajustar, remover, total, limpar } = useCarrinho();
  const mesaMode = Boolean(mesaToken);
  const [paymentMode, setPaymentMode] = useState<"online" | "delivery" | null>(null);
  const [payment, setPayment] = useState<PaymentMethodOption | null>(null);
  const [cashChange, setCashChange] = useState("");
  const [cupomInput, setCupomInput] = useState("");
  const [cupomCodigo, setCupomCodigo] = useState<string | null>(null);
  const [cupomDesconto, setCupomDesconto] = useState(0);
  const [cupomMessage, setCupomMessage] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<PedidoStatus | null>(null);
  const [showTrackingMap, setShowTrackingMap] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [pendingPixPayment, setPendingPixPayment] = useState<{
    orderNumber: number;
    qrCode: string;
    qrCodeBase64: string;
    ticketUrl: string | null;
  } | null>(null);
  const [deviceLocation, setDeviceLocation] = useState<BrowserDeviceLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const cep = customer?.cep ?? "";
  const address = customer?.address ?? "";
  const addressNumber = customer?.addressNumber ?? "";
  const neighborhood = customer?.neighborhood ?? "";
  const city = customer?.city ?? "";
  const stateCode = customer?.stateCode ?? "";
  const reference = customer?.reference ?? "";
  const entrega = mesaMode || itens.length === 0 ? 0 : getDeliveryFeeForNeighborhood(neighborhood);
  const totalComDesconto = Math.max(0, total - cupomDesconto);
  const totalFinal = totalComDesconto + entrega;
  const availablePaymentMethods = useMemo((): PaymentMethodOption[] => {
    if (paymentMode === "online") return ["pix", "credito", "debito"];
    if (paymentMode === "delivery") return ["pix", "dinheiro", "credito", "debito"];
    return [];
  }, [paymentMode]);

  useEffect(() => {
    if (paymentMode && !payment) {
      setPayment(availablePaymentMethods[0] ?? null);
      return;
    }
    if (payment && !availablePaymentMethods.includes(payment)) {
      setPayment(availablePaymentMethods[0] ?? null);
    }
    if (paymentMode === "online") {
      setCashChange("");
    }
  }, [availablePaymentMethods, payment, paymentMode]);

  useEffect(() => {
    if (!orderNumber) return;

    let active = true;

    const sync = async () => {
      const pedidos = await listarPedidos();
      if (!active) return;
      const current = pedidos.find((pedido) => pedido.numero === orderNumber);
      if (current) {
        setOrderId(current.id);
        setOrderStatus(current.status);
      }
    };

    void sync();
    const channel = CUSTOMER_REALTIME_ENABLED
      ? supabase
          .channel(`checkout-order-${orderNumber}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
            void sync();
          })
          .subscribe()
      : null;

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [orderNumber]);

  useEffect(() => {
    if (mesaMode || !customer || !address.trim() || !neighborhood.trim() || !city.trim()) {
      setDeviceLocation(null);
      setLocationStatus("idle");
      setLocationMessage(null);
      return;
    }

    let active = true;

    const capture = async () => {
      setLocationStatus("loading");
      setLocationMessage("Capturando a localizacao atual do aparelho...");

      try {
        const location = await requestBrowserDeviceLocation();
        if (!active) return;
        setDeviceLocation(location);
        setLocationStatus("ready");
        setLocationMessage(
          location.accuracy != null
            ? `Localizacao precisa capturada. Precisao aproximada de ${Math.round(location.accuracy)} m.`
            : "Localizacao do aparelho capturada com sucesso.",
        );
      } catch (error) {
        if (!active) return;
        setDeviceLocation(null);
        setLocationStatus("error");
        setLocationMessage(
          error instanceof Error
            ? error.message
            : "Nao foi possivel capturar a localizacao do aparelho.",
        );
      }
    };

    void capture();

    return () => {
      active = false;
    };
  }, [address, city, customer, neighborhood]);

  async function refreshDeviceLocation() {
    setLocationStatus("loading");
    setLocationMessage("Atualizando a localizacao do aparelho...");

    try {
      const location = await requestBrowserDeviceLocation();
      setDeviceLocation(location);
      setLocationStatus("ready");
      setLocationMessage(
        location.accuracy != null
          ? `Localizacao atualizada. Precisao aproximada de ${Math.round(location.accuracy)} m.`
          : "Localizacao atualizada com sucesso.",
      );
      return location;
    } catch (error) {
      setDeviceLocation(null);
      setLocationStatus("error");
      const nextMessage =
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar a localizacao do aparelho.";
      setLocationMessage(nextMessage);
      throw new Error(nextMessage);
    }
  }

  async function applyCoupon() {
    if (!cupomInput.trim()) {
      setCupomMessage("Informe um codigo de cupom.");
      return;
    }

    setApplyingCoupon(true);
    setCupomMessage(null);
    try {
      const result = await validateCouponServer({
        data: { codigo: cupomInput.trim(), subtotal: total },
      });
      setCupomCodigo(result.codigo);
      setCupomDesconto(result.desconto);
      setCupomMessage(
        `Cupom ${result.codigo} aplicado. Desconto de ${formatBRL(result.desconto)}.`,
      );
    } catch (error) {
      setCupomCodigo(null);
      setCupomDesconto(0);
      setCupomMessage(error instanceof Error ? error.message : "Cupom invalido.");
    } finally {
      setApplyingCoupon(false);
    }
  }

  async function finalizeMesaOrder() {
    if (!customer) {
      setCheckoutMessage("Entre ou crie sua conta para enviar o pedido da mesa.");
      onRequireProfile();
      return;
    }

    if (!customer.name.trim() || !customer.phone.trim()) {
      setCheckoutMessage("Complete nome e telefone no perfil antes de enviar o pedido.");
      return;
    }

    if (!mesaToken) {
      setCheckoutMessage("QR Code da mesa invalido.");
      return;
    }

    setSubmitting(true);
    setCheckoutMessage(null);

    try {
      const headers = await getCustomerAuthorizationHeaders();
      if (!headers) {
        throw new Error("Sessao do cliente nao encontrada.");
      }

      const pedido = await createMesaQrOrder({
        data: {
          qrcodeToken: mesaToken,
          cupom_codigo: cupomCodigo,
          observacoes: `Mesa ${mesaInfo?.numero ?? ""} pedido via QR`,
          itens: itens.map(mapCartItemToOrderItem),
        },
        headers,
      });

      setOrderNumber(pedido.numero);
      setOrderId(pedido.id);
      setOrderStatus(pedido.status);
      setCheckoutMessage(
        pedido.appended
          ? `Itens adicionados ao pedido #${pedido.numero} da mesa ${pedido.mesa_numero}.`
          : `Pedido #${pedido.numero} enviado para a mesa ${pedido.mesa_numero}.`,
      );
      limpar();
      setCupomCodigo(null);
      setCupomDesconto(0);
      setCupomInput("");
      onOrderCreated({ keepCheckoutVisible: true });
    } catch (error) {
      setCheckoutMessage(
        error instanceof Error ? error.message : "Nao foi possivel enviar o pedido da mesa.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function finalizeOrder() {
    if (mesaMode) {
      await finalizeMesaOrder();
      return;
    }

    if (!customer) {
      setCheckoutMessage("Entre ou crie sua conta para finalizar o pedido.");
      onRequireProfile();
      return;
    }

    if (
      !customer.name.trim() ||
      !customer.phone.trim() ||
      !address.trim() ||
      !neighborhood.trim() ||
      !city.trim()
    ) {
      setCheckoutMessage(
        "Complete nome, telefone e endereco completo no perfil antes de finalizar.",
      );
      return;
    }

    if (!paymentMode || !payment) {
      setCheckoutMessage("Escolha se o pagamento sera online ou na entrega para continuar.");
      return;
    }

    setSubmitting(true);
    setCheckoutMessage(null);
    setPendingPixPayment(null);

    try {
      const headers = await getCustomerAuthorizationHeaders();
      if (!headers) {
        throw new Error("Sessao do cliente nao encontrada.");
      }

      const preciseLocation = deviceLocation ?? (await refreshDeviceLocation());

      const pedido = (await createDeliveryOrder({
        data: {
          tenantSlug,
          customerName: customer.name.trim(),
          customerPhone: customer.phone.trim(),
          customerEmail: customer.email.trim(),
          payment_mode: paymentMode,
          forma_pagamento: payment,
          troco_para:
            paymentMode === "delivery" && payment === "dinheiro" && cashChange.trim()
              ? Number(cashChange.replace(",", "."))
              : null,
          endereco: [address, addressNumber].filter(Boolean).join(", "),
          bairro: neighborhood.trim(),
          cidade: city.trim(),
          estado: stateCode.trim(),
          cep: cep.trim(),
          reference: reference.trim(),
          taxa_entrega: entrega,
          cupom_codigo: cupomCodigo,
          latitude_cliente: preciseLocation.latitude,
          longitude_cliente: preciseLocation.longitude,
          observacoes:
            `cliente=${customer.name}; telefone=${customer.phone}; email=${customer.email}; cep=${cep}; cidade=${city}; uf=${stateCode}; bairro=${neighborhood}; endereco=${[address, addressNumber].filter(Boolean).join(", ")}; referencia=${reference}; payment_mode=${paymentMode}` +
            `; gps_lat=${preciseLocation.latitude}; gps_lng=${preciseLocation.longitude}` +
            (preciseLocation.accuracy != null
              ? `; gps_accuracy=${Math.round(preciseLocation.accuracy)}m`
              : "") +
            (paymentMode === "delivery" && payment === "dinheiro" && cashChange.trim()
              ? `; troco_para=${cashChange}`
              : ""),
          itens: itens.map(mapCartItemToOrderItem),
        },
        headers,
      })) as DeliveryOrderResponse;

      setOrderNumber(pedido.numero);
      setOrderId(pedido.id);
      setOrderStatus(pedido.status);
      setShowTrackingMap(false);
      if (
        paymentMode === "online" &&
        payment === "pix" &&
        pedido.payment_pix_qr_code &&
        pedido.payment_pix_qr_code_base64
      ) {
        setPendingPixPayment({
          orderNumber: pedido.numero,
          qrCode: pedido.payment_pix_qr_code,
          qrCodeBase64: pedido.payment_pix_qr_code_base64,
          ticketUrl: pedido.payment_ticket_url ?? null,
        });
        setCheckoutMessage("Pedido criado. Pague o Pix abaixo para liberar a producao.");
        limpar();
        onOrderCreated({ keepCheckoutVisible: true });
        return;
      }
      if (
        paymentMode === "online" &&
        pedido.payment_redirect_required &&
        pedido.payment_checkout_url
      ) {
        setCheckoutMessage("Pedido criado. Abrindo o checkout seguro do Mercado Pago...");
        window.location.href = pedido.payment_checkout_url;
        return;
      }
      limpar();
      setCupomCodigo(null);
      setCupomDesconto(0);
      setCupomInput("");
      onOrderCreated();
    } catch (error) {
      setCheckoutMessage(
        error instanceof Error ? error.message : "Nao foi possivel finalizar o pedido.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (itens.length === 0) {
    return (
      <main className="px-5 py-16 text-center animate-fade-up">
        <div className="mb-3 text-6xl animate-float">🛒</div>
        <h2 className="font-display text-2xl">Seu carrinho esta vazio</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          Explore o cardápio e adicione seus itens favoritos.
        </p>
        {orderNumber ? (
          <CartTrackingSection
            orderId={orderId}
            orderNumber={orderNumber}
            orderStatus={orderStatus}
            paymentStatus={pendingPixPayment ? "pending" : null}
            isOpen={showTrackingMap}
            onToggle={() => setShowTrackingMap((current) => !current)}
            title="Ultimo pedido"
            helperText="Abra o mini mapa para ver de onde o pedido sai e acompanhar a entrega em tempo real."
            className="mt-6 text-left"
          />
        ) : null}
        {pendingPixPayment ? (
          <PixPaymentPanel payment={pendingPixPayment} className="mt-6" />
        ) : null}
      </main>
    );
  }

  return (
    <main className="px-5 animate-fade-up">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-2xl">Carrinho</h2>
        <button
          onClick={limpar}
          aria-label="Esvaziar carrinho"
          className="grid size-10 place-items-center rounded-full border border-border bg-card"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {!customer ? (
        <div className="mb-4 rounded-3xl border border-gold/40 bg-gold/10 p-4 text-sm shadow-soft">
          <p className="font-medium text-foreground">Crie sua conta ou entre para continuar.</p>
          <p className="mt-1 text-muted-foreground">
            Voce pode entrar com e-mail ou telefone, e o login fica salvo mesmo ao reiniciar o site.
          </p>
          <button
            onClick={onRequireProfile}
            className="mt-3 rounded-full bg-sage px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Ir para meu perfil
          </button>
        </div>
      ) : (
        <div className="mb-4 flex items-center justify-between rounded-3xl border border-border bg-card px-4 py-3 shadow-soft">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gold">Conta conectada</p>
            <p className="font-medium">{customer.name}</p>
            <p className="text-xs text-muted-foreground">{customer.email || customer.phone}</p>
          </div>
          <button onClick={onRequireProfile} className="text-xs font-semibold text-gold">
            Editar perfil
          </button>
        </div>
      )}

      <div className="space-y-3">
        {itens.map((item) => {
          const itemKey = buildCarrinhoItemKey(item);
          return (
            <div
              key={itemKey}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft"
            >
              <img
                src={item.doce.imagem}
                alt={item.doce.nome}
                loading="lazy"
                className="size-16 rounded-xl object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {item.doce.nome}
                  {item.variacaoNome ? ` (${item.variacaoNome})` : ""}
                </p>
                <p className="text-xs text-muted-foreground">{brandName}</p>
                <p className="mt-0.5 text-lg font-medium">
                  {formatBRL(getCarrinhoUnitPrice(item) * item.quantidade)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => ajustar(itemKey, -1)}
                  className="grid size-7 place-items-center rounded-full bg-muted"
                >
                  <Minus className="size-3" />
                </button>
                <span className="w-5 text-center text-sm">{item.quantidade}</span>
                <button
                  onClick={() => ajustar(itemKey, +1)}
                  className="grid size-7 place-items-center rounded-full bg-sage text-primary-foreground"
                >
                  <Plus className="size-3" />
                </button>
                <button
                  onClick={() => remover(itemKey)}
                  aria-label="Remover"
                  className="ml-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2">
        <span className="text-lg">Cupom</span>
        <input
          placeholder="Cupom de desconto"
          value={cupomInput}
          onChange={(event) => setCupomInput(event.target.value.toUpperCase())}
          className="flex-1 bg-transparent text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => void applyCoupon()}
          disabled={applyingCoupon}
          className="rounded-full bg-sage px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {applyingCoupon ? "..." : "Aplicar"}
        </button>
      </div>
      {cupomMessage ? <p className="mt-2 text-xs text-muted-foreground">{cupomMessage}</p> : null}

      <div className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>{formatBRL(total)}</span>
        </div>
        {cupomDesconto > 0 ? (
          <div className="flex justify-between text-emerald-600">
            <span>Desconto{cupomCodigo ? ` (${cupomCodigo})` : ""}</span>
            <span>- {formatBRL(cupomDesconto)}</span>
          </div>
        ) : null}
        {!mesaMode ? (
          <div className="flex justify-between text-muted-foreground">
            <span>Entrega</span>
            <span>{formatBRL(entrega)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-border pt-2 text-xl font-medium">
          <span>Total</span>
          <span>{formatBRL(totalFinal)}</span>
        </div>
      </div>

      {mesaMode ? (
        <div className="mt-5 space-y-3 rounded-3xl border border-border bg-card p-4 shadow-soft">
          <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm">
            <p className="font-medium">
              Mesa {mesaInfo?.numero ?? "..."} · Pedido direto pelo QR Code
            </p>
            <p className="mt-1 text-muted-foreground">
              O pedido vai para a cozinha. O pagamento e feito com a equipe da loja.
            </p>
          </div>
          {checkoutMessage ? (
            <p className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm">
              {checkoutMessage}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void finalizeOrder()}
            disabled={submitting}
            className="w-full rounded-full gradient-sage py-3.5 font-medium text-primary-foreground shadow-soft disabled:opacity-60"
          >
            {submitting ? "Enviando..." : "Enviar para a cozinha"}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-5 space-y-3 rounded-3xl border border-border bg-card p-4 shadow-soft">
            <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm">
              <p className="font-medium">{customer?.name}</p>
              <p className="mt-1 text-muted-foreground">
                {[address, addressNumber].filter(Boolean).join(", ") || "Endereco nao informado"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {[neighborhood, [city, stateCode].filter(Boolean).join("/")]
                  .filter(Boolean)
                  .join(" - ") || "Complete seu endereco no perfil"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Localizacao do aparelho
                  </p>
                  <p className="mt-1 font-medium">
                    {locationStatus === "ready"
                      ? "Posicao exata pronta para o entregador"
                      : locationStatus === "loading"
                        ? "Obtendo sua posicao atual..."
                        : "Aguardando captura da localizacao"}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {locationMessage ??
                      "Permita a localizacao para enviar o ponto exato de entrega."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshDeviceLocation()}
                  className="shrink-0 rounded-full border border-border px-3 py-2 text-xs font-semibold text-gold"
                >
                  Atualizar
                </button>
              </div>
              {deviceLocation ? (
                <div className="mt-3 rounded-2xl bg-card px-3 py-2 text-xs text-muted-foreground">
                  <p>Localizacao confirmada para a entrega.</p>
                  <p className="mt-1">
                    Atualizada as {new Date(deviceLocation.capturedAt).toLocaleTimeString("pt-BR")}
                    {deviceLocation.accuracy != null
                      ? ` - precisao aproximada de ${Math.round(deviceLocation.accuracy)} m`
                      : ""}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-border bg-background p-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                Como deseja pagar?
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  { id: "online", label: "Pagamento online" },
                  { id: "delivery", label: "Pagar na entrega" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPaymentMode(option.id as "online" | "delivery")}
                    className={`rounded-2xl px-3 py-3 text-xs font-semibold transition ${
                      paymentMode === option.id
                        ? "border border-[#3D5A40] bg-[#556B57] text-primary-foreground shadow-soft"
                        : "border border-[#A9B8A6] bg-[#EEF3ED] text-[#3D5A40]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {paymentMode ? (
              <div
                className={`grid gap-2 ${paymentMode === "online" ? "grid-cols-3" : "grid-cols-2"}`}
              >
                {availablePaymentMethods.map((item) => (
                  <button
                    key={item}
                    onClick={() => setPayment(item)}
                    className={`rounded-full px-3 py-3 text-xs font-semibold transition ${
                      payment === item
                        ? "border border-[#3D5A40] bg-[#556B57] text-primary-foreground shadow-soft"
                        : "border border-[#A9B8A6] bg-[#EEF3ED] text-[#3D5A40]"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
            {paymentMode === "delivery" && payment === "dinheiro" ? (
              <div className="rounded-2xl border border-border bg-background px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  Troco para
                </p>
                <input
                  value={cashChange}
                  onChange={(event) => setCashChange(event.target.value)}
                  placeholder="Ex.: 100,00"
                  className="mt-2 w-full bg-transparent text-sm outline-none"
                />
              </div>
            ) : null}
          </div>

          {checkoutMessage ? (
            <p className="mt-4 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-foreground">
              {checkoutMessage}
            </p>
          ) : null}

          <button
            onClick={() => void finalizeOrder()}
            className="mt-5 w-full rounded-full gradient-sage py-4 font-medium text-primary-foreground shadow-soft transition hover:shadow-glow"
          >
            {submitting
              ? "Enviando pedido..."
              : `${paymentMode === "online" ? (payment === "pix" ? "Gerar Pix" : "Ir para pagamento") : "Finalizar Pedido"} - ${formatBRL(totalFinal)}`}
          </button>

          {orderNumber ? (
            <CartTrackingSection
              orderId={orderId}
              orderNumber={orderNumber}
              orderStatus={orderStatus}
              paymentStatus={pendingPixPayment ? "pending" : null}
              isOpen={showTrackingMap}
              onToggle={() => setShowTrackingMap((current) => !current)}
              title="Pedido criado"
              helperText={
                pendingPixPayment
                  ? "Esse pedido so sera liberado para a loja depois da confirmacao do pagamento."
                  : "Toque no botao abaixo para ver de onde o pedido sai e onde o entregador esta em tempo real."
              }
              className="mt-4"
            />
          ) : null}
          {pendingPixPayment ? (
            <PixPaymentPanel payment={pendingPixPayment} className="mt-4" />
          ) : null}
        </>
      )}
    </main>
  );
}

function CartTrackingSection({
  orderId,
  orderNumber,
  orderStatus,
  paymentStatus,
  isOpen,
  onToggle,
  title,
  helperText,
  className = "",
}: {
  orderId: string | null;
  orderNumber: number;
  orderStatus: PedidoStatus | null;
  paymentStatus: string | null;
  isOpen: boolean;
  onToggle: () => void;
  title: string;
  helperText: string;
  className?: string;
}) {
  return (
    <div className={`rounded-3xl border border-border bg-card p-5 shadow-soft ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold">{title}</p>
          <p className="mt-2 font-display text-2xl">#{orderNumber}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Status atual:{" "}
            <strong className="text-foreground">
              {pedidoStatusLabel(orderStatus, paymentStatus)}
            </strong>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{helperText}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={!orderId}
          className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#A9B8A6] bg-[#EEF3ED] px-3 py-2 text-xs font-semibold text-[#3D5A40] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <MapPinned className="size-4" />
          {isOpen ? "Ocultar mapa" : "Ver mapa"}
          {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {isOpen && orderId ? (
        <div className="mt-4 overflow-hidden rounded-[2rem]">
          <OrderTrackingMap orderId={orderId} orderNumber={orderNumber} />
        </div>
      ) : null}
    </div>
  );
}

function PerfilCliente({
  customer,
  orders,
  onProfileChanged,
}: {
  customer: CustomerAccount | null;
  orders: CustomerOrderPreview[];
  onProfileChanged: () => void;
}) {
  type RecoveryStep = "request" | "code" | "password";
  const [mode, setMode] = useState<"login" | "signup" | "recover">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [cep, setCep] = useState(customer?.cep ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [addressNumber, setAddressNumber] = useState(customer?.addressNumber ?? "");
  const [neighborhood, setNeighborhood] = useState(customer?.neighborhood ?? "");
  const [city, setCity] = useState(customer?.city ?? "");
  const [stateCode, setStateCode] = useState(customer?.stateCode ?? "");
  const [reference, setReference] = useState(customer?.reference ?? "");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [generatedResetCode, setGeneratedResetCode] = useState<string | null>(null);
  const [resetMethod, setResetMethod] = useState<"email" | "local_code">("local_code");
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>("request");
  const [message, setMessage] = useState<string | null>(null);
  const [loadingCep, setLoadingCep] = useState(false);
  const [lastAttemptedCep, setLastAttemptedCep] = useState("");
  const [validatingResetCode, setValidatingResetCode] = useState(false);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [savingNewPassword, setSavingNewPassword] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<CustomerOrderDetail | null>(null);

  useEffect(() => {
    if (isCustomerRecoveryMode()) {
      setMode("recover");
      setRecoveryStep("password");
      setResetMethod("email");
      setMessage("Abra o link recebido no e-mail e defina sua nova senha.");
    }
  }, []);

  useEffect(() => {
    if (!customer) return;
    setName(customer.name);
    setEmail(customer.email);
    setPhone(customer.phone);
    setCep(customer.cep);
    setAddress(customer.address);
    setAddressNumber(customer.addressNumber);
    setNeighborhood(customer.neighborhood);
    setCity(customer.city);
    setStateCode(customer.stateCode);
    setReference(customer.reference);
    setLastAttemptedCep(normalizeCep(customer.cep));
  }, [customer]);

  useEffect(() => {
    if (!customer || !selectedOrderId) {
      setSelectedOrderDetail(null);
      return;
    }

    let active = true;

    const loadDetail = async () => {
      const order = orders.find((item) => item.id === selectedOrderId);
      if (!order) return;
      const itens = await itensDoPedido(order.id);
      if (!active) return;
      setSelectedOrderDetail({ ...order, itens });
    };

    void loadDetail();
    const channel = CUSTOMER_REALTIME_ENABLED
      ? supabase
          .channel(`customer-order-detail-${selectedOrderId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pedidos", filter: `id=eq.${selectedOrderId}` },
            () => {
              void loadDetail();
            },
          )
          .subscribe()
      : null;

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [customer, orders, selectedOrderId]);

  const fillAddressFromCep = useCallback(async () => {
    const normalized = normalizeCep(cep);
    if (normalized.length !== 8) return;

    setLastAttemptedCep(normalized);
    setLoadingCep(true);
    try {
      const result = await fetchAddressByCep(normalized);
      const supportedCep = isSupportedCityCep(result.cep);
      setCep(formatCep(result.cep));
      setAddress(result.street || address);
      setNeighborhood(result.neighborhood || neighborhood);
      setCity(supportedCep ? SERVICE_CITY_CONFIG.city : result.city || city);
      setStateCode(supportedCep ? SERVICE_CITY_CONFIG.state : result.state || stateCode);
      if (result.complement && !reference) setReference(result.complement);
    } catch {
      setMessage("Nao foi possivel consultar o CEP agora.");
    } finally {
      setLoadingCep(false);
    }
  }, [address, cep, city, neighborhood, reference, stateCode]);

  useEffect(() => {
    const normalized = normalizeCep(cep);
    if (normalized.length !== 8 || normalized === lastAttemptedCep || loadingCep) return;
    void fillAddressFromCep();
  }, [cep, fillAddressFromCep, lastAttemptedCep, loadingCep]);

  async function handleLogin() {
    try {
      await signInCustomerAccount(identifier, password);
      setIdentifier("");
      setPassword("");
      setMessage("Login realizado com sucesso.");
      onProfileChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel entrar.");
    }
  }

  async function handleSignup() {
    try {
      await signUpCustomerAccount({
        name,
        email,
        phone,
        password,
        cep,
        address,
        addressNumber,
        neighborhood,
        city,
        stateCode,
        reference,
      });
      setPassword("");
      setMessage("Conta criada e login mantido neste navegador.");
      onProfileChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel criar a conta.");
    }
  }

  async function handleStartReset() {
    setSendingResetEmail(true);
    try {
      const result = await startCustomerPasswordReset(identifier);
      setResetMethod(result.method);
      setGeneratedResetCode(result.code ?? null);
      setResetCode("");
      setNewPassword("");
      setRecoveryStep("code");
      setMessage(
        result.method === "email"
          ? `Enviamos o codigo de recuperacao para ${result.maskedIdentifier}.`
          : `Codigo de recuperacao gerado para ${result.maskedIdentifier}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Nao foi possivel iniciar a recuperacao.",
      );
    } finally {
      setSendingResetEmail(false);
    }
  }

  const handleVerifyResetCode = useCallback(
    async (code: string) => {
      const normalizedCode = code.trim();
      if (normalizedCode.length < 6 || validatingResetCode) return;

      setValidatingResetCode(true);
      try {
        await verifyCustomerPasswordResetCode(identifier, normalizedCode);
        setRecoveryStep("password");
        setMessage("Codigo validado. Agora defina sua nova senha.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Nao foi possivel validar o codigo.");
      } finally {
        setValidatingResetCode(false);
      }
    },
    [identifier, validatingResetCode],
  );

  async function handleCompleteReset() {
    setSavingNewPassword(true);
    try {
      if (resetMethod === "email") {
        await completeCustomerPasswordReset(newPassword);
      } else {
        await completeCustomerPasswordReset(resetCode, newPassword);
      }
      setMode("login");
      setResetCode("");
      setNewPassword("");
      setGeneratedResetCode(null);
      setResetMethod("local_code");
      setRecoveryStep("request");
      setMessage("Senha redefinida com sucesso. Voce ja esta logado.");
      onProfileChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel redefinir a senha.");
    } finally {
      setSavingNewPassword(false);
    }
  }

  async function handleSaveProfile() {
    try {
      await updateCurrentCustomerAccount({
        name,
        email,
        phone,
        cep,
        address,
        addressNumber,
        neighborhood,
        city,
        stateCode,
        reference,
      });
      setMessage("Perfil atualizado com sucesso.");
      setIsEditingProfile(false);
      onProfileChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nao foi possivel atualizar o perfil.");
    }
  }

  function resetProfileForm() {
    if (!customer) return;
    setName(customer.name);
    setEmail(customer.email);
    setPhone(customer.phone);
    setCep(customer.cep);
    setAddress(customer.address);
    setAddressNumber(customer.addressNumber);
    setNeighborhood(customer.neighborhood);
    setCity(customer.city);
    setStateCode(customer.stateCode);
    setReference(customer.reference);
    setLastAttemptedCep(normalizeCep(customer.cep));
  }

  async function handleSignOut() {
    await signOutCustomerAccount();
    setMode("login");
    setRecoveryStep("request");
    setMessage(null);
    setSelectedOrderId(null);
    setSelectedOrderDetail(null);
  }

  useEffect(() => {
    if (mode !== "recover") return;
    const normalizedCode = resetCode.replace(/\D/g, "").slice(0, 6);
    if (normalizedCode !== resetCode) {
      setResetCode(normalizedCode);
      return;
    }
    if (recoveryStep !== "code") return;
    if (normalizedCode.length !== 6) return;
    void handleVerifyResetCode(normalizedCode);
  }, [handleVerifyResetCode, mode, recoveryStep, resetCode]);

  if (!customer) {
    return (
      <main className="animate-fade-up px-5 pb-20">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex rounded-full bg-background p-1">
            {[
              { id: "login", label: "Entrar" },
              { id: "signup", label: "Criar conta" },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setMode(item.id as typeof mode)}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${
                  mode === item.id
                    ? "gradient-sage text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {mode === "login" ? (
              <>
                <FieldInput
                  value={identifier}
                  onChange={setIdentifier}
                  placeholder="E-mail ou telefone"
                />
                <FieldInput
                  value={password}
                  onChange={setPassword}
                  placeholder="Senha"
                  type="password"
                />
                <button
                  type="button"
                  onClick={() => {
                    setMode("recover");
                    setRecoveryStep("request");
                    setResetCode("");
                    setNewPassword("");
                    setGeneratedResetCode(null);
                    setMessage(null);
                  }}
                  className="text-left text-sm font-semibold text-gold"
                >
                  Recuperar senha
                </button>
                <button
                  onClick={handleLogin}
                  className="w-full rounded-full gradient-sage py-3 font-semibold text-primary-foreground"
                >
                  Entrar e continuar logado
                </button>
              </>
            ) : null}

            {mode === "signup" ? (
              <>
                <FieldInput value={name} onChange={setName} placeholder="Seu nome completo" />
                <FieldInput
                  value={email}
                  onChange={setEmail}
                  placeholder="Seu e-mail"
                  type="email"
                />
                <FieldInput value={phone} onChange={setPhone} placeholder="Seu telefone com DDD" />
                <PasswordHint />
                <FieldInput
                  value={password}
                  onChange={setPassword}
                  placeholder="Crie uma senha"
                  type="password"
                />
                <FieldInput
                  value={cep}
                  onChange={(value) => setCep(formatCep(value))}
                  placeholder={loadingCep ? "CEP - buscando..." : "CEP"}
                />
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <FieldInput value={address} onChange={setAddress} placeholder="Logradouro" />
                  <FieldInput
                    value={addressNumber}
                    onChange={setAddressNumber}
                    placeholder="Numero"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <FieldInput
                    value={neighborhood}
                    onChange={setNeighborhood}
                    placeholder="Bairro"
                    options={SUPPORTED_NEIGHBORHOOD_NAMES}
                  />
                  <FieldInput
                    value={`${city}${stateCode ? `/${stateCode}` : ""}`}
                    onChange={() => undefined}
                    readOnly
                    placeholder="Cidade/UF"
                    className="bg-muted"
                  />
                </div>
                <InfoMessage>
                  Selecione um dos bairros atendidos em {SERVICE_CITY_CONFIG.city}/
                  {SERVICE_CITY_CONFIG.state}.
                </InfoMessage>
                <FieldInput value={reference} onChange={setReference} placeholder="Referencia" />
                <button
                  onClick={handleSignup}
                  className="w-full rounded-full gradient-sage py-3 font-semibold text-primary-foreground"
                >
                  Criar conta
                </button>
              </>
            ) : null}

            {mode === "recover" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setRecoveryStep("request");
                    setResetCode("");
                    setNewPassword("");
                    setGeneratedResetCode(null);
                    setMessage(null);
                  }}
                  className="text-left text-sm font-semibold text-muted-foreground"
                >
                  Voltar para entrar
                </button>
                {recoveryStep === "request" ? (
                  <>
                    <FieldInput
                      value={identifier}
                      onChange={setIdentifier}
                      placeholder="Seu e-mail"
                      type="email"
                    />
                    <button
                      onClick={handleStartReset}
                      disabled={sendingResetEmail}
                      className="w-full rounded-full border border-border bg-background py-3 text-sm font-semibold disabled:opacity-60"
                    >
                      {sendingResetEmail ? "Enviando..." : "Enviar codigo"}
                    </button>
                  </>
                ) : null}
                {recoveryStep === "code" ? (
                  <>
                    <FieldInput
                      value={identifier}
                      onChange={setIdentifier}
                      placeholder="Seu e-mail"
                      type="email"
                      readOnly
                      className="bg-muted"
                    />
                    {generatedResetCode ? (
                      <div className="rounded-2xl border border-gold/30 bg-gold/10 p-4 text-sm">
                        <p className="font-medium">Codigo de recuperacao gerado</p>
                        <p className="mt-1 font-mono text-lg tracking-[0.2em]">
                          {generatedResetCode}
                        </p>
                      </div>
                    ) : null}
                    <FieldInput
                      value={resetCode}
                      onChange={(value) => setResetCode(value.replace(/\D/g, "").slice(0, 6))}
                      placeholder={validatingResetCode ? "Validando codigo..." : "Codigo do e-mail"}
                    />
                    <InfoMessage>
                      Assim que os 6 digitos forem preenchidos, o codigo sera validado
                      automaticamente.
                    </InfoMessage>
                    <button
                      type="button"
                      onClick={() => void handleStartReset()}
                      disabled={sendingResetEmail}
                      className="text-left text-sm font-semibold text-gold disabled:opacity-60"
                    >
                      {sendingResetEmail ? "Reenviando..." : "Reenviar codigo"}
                    </button>
                  </>
                ) : null}
                {recoveryStep === "password" ? (
                  <>
                    <PasswordHint />
                    <FieldInput
                      value={newPassword}
                      onChange={setNewPassword}
                      placeholder="Nova senha"
                      type="password"
                    />
                    <button
                      onClick={handleCompleteReset}
                      disabled={savingNewPassword}
                      className="w-full rounded-full gradient-sage py-3 font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {savingNewPassword ? "Salvando..." : "Salvar nova senha"}
                    </button>
                  </>
                ) : null}
              </>
            ) : null}
          </div>

          {message ? <InfoMessage>{message}</InfoMessage> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="animate-fade-up px-5 pb-20">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gold">Conta do cliente</p>
            <h2 className="mt-2 font-display text-3xl">{customer.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Seu login permanece salvo neste navegador.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                resetProfileForm();
                setMessage(null);
                setIsEditingProfile(true);
              }}
              className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-gold"
            >
              Editar perfil
            </button>
            <button
              onClick={() => void handleSignOut()}
              className="rounded-full border border-border px-3 py-2 text-xs font-semibold text-muted-foreground"
            >
              Sair
            </button>
          </div>
        </div>

        {!isEditingProfile ? (
          <div className="mt-5 space-y-3 rounded-3xl border border-border bg-background p-4 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                Contato
              </p>
              <p className="mt-1 font-medium">{customer.email || "E-mail nao informado"}</p>
              <p className="mt-1 text-muted-foreground">
                {customer.phone || "Telefone nao informado"}
              </p>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                Endereco
              </p>
              <p className="mt-1 font-medium">
                {[customer.address, customer.addressNumber].filter(Boolean).join(", ") ||
                  "Endereco nao informado"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {[
                  customer.neighborhood,
                  [customer.city, customer.stateCode].filter(Boolean).join("/"),
                ]
                  .filter(Boolean)
                  .join(" - ") || "Bairro nao informado"}
              </p>
              {customer.reference ? (
                <p className="mt-1 text-muted-foreground">Referencia: {customer.reference}</p>
              ) : null}
              {customer.cep ? (
                <p className="mt-1 text-muted-foreground">CEP: {customer.cep}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <FieldInput value={name} onChange={setName} placeholder="Seu nome" />
            <FieldInput value={email} onChange={setEmail} placeholder="Seu e-mail" type="email" />
            <FieldInput value={phone} onChange={setPhone} placeholder="Seu telefone" />
            <FieldInput
              value={cep}
              onChange={(value) => setCep(formatCep(value))}
              placeholder={loadingCep ? "CEP - buscando..." : "CEP"}
            />
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <FieldInput value={address} onChange={setAddress} placeholder="Logradouro" />
              <FieldInput value={addressNumber} onChange={setAddressNumber} placeholder="Numero" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FieldInput
                value={neighborhood}
                onChange={setNeighborhood}
                placeholder="Bairro"
                options={SUPPORTED_NEIGHBORHOOD_NAMES}
              />
              <FieldInput
                value={`${city}${stateCode ? `/${stateCode}` : ""}`}
                onChange={() => undefined}
                readOnly
                placeholder="Cidade/UF"
                className="bg-muted"
              />
            </div>
            <InfoMessage>
              Escolha um bairro atendido para manter a entrega e a taxa corretas.
            </InfoMessage>
            <FieldInput value={reference} onChange={setReference} placeholder="Referencia" />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  resetProfileForm();
                  setMessage(null);
                  setIsEditingProfile(false);
                }}
                className="w-full rounded-full border border-border bg-background py-3 text-sm font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveProfile}
                className="w-full rounded-full gradient-sage py-3 font-semibold text-primary-foreground"
              >
                Salvar perfil
              </button>
            </div>
          </div>
        )}

        {message ? <InfoMessage>{message}</InfoMessage> : null}
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-gold">Meus pedidos</p>
            <h3 className="mt-2 font-display text-2xl">Historico em tempo real</h3>
          </div>
          <span className="rounded-full bg-background px-3 py-1 text-xs text-muted-foreground">
            {orders.length} pedidos
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {orders.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              Seus pedidos vao aparecer aqui assim que voce finalizar a primeira compra.
            </p>
          ) : (
            orders.map((order) => (
              <button
                key={order.id}
                onClick={() =>
                  setSelectedOrderId((current) => (current === order.id ? null : order.id))
                }
                className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-left transition hover:border-primary/30"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium">Pedido #{order.numero}</p>
                  <span className="text-xs font-semibold text-gold">
                    {pedidoStatusLabel(order.status, order.paymentStatus)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                  <span>{formatBRL(order.total)}</span>
                  <span>{new Date(order.createdAt).toLocaleDateString("pt-BR")}</span>
                </div>
                {selectedOrderDetail?.id === order.id ? (
                  <OrderDetailPanel detail={selectedOrderDetail} />
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </main>
  );
}

function OrderDetailPanel({ detail }: { detail: CustomerOrderDetail }) {
  const progress = getPedidoProgress(detail.status, detail.paymentStatus);
  const timeline = buildCustomerTimeline(detail);
  const showTrackingMap = ["pronto", "em_entrega", "entregue"].includes(detail.status);

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-gold">Acompanhamento</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {detail.endereco || "Endereco nao informado"}
          </p>
        </div>
        <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold">
          {progress.label}
        </span>
      </div>

      <div className="mb-4">
        <div className="h-2 overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-sage transition-all"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Recebido</span>
          <span>Em preparo</span>
          <span>Entrega</span>
          <span>Concluido</span>
        </div>
      </div>

      {showTrackingMap ? (
        <div className="mb-4">
          <OrderTrackingMap orderId={detail.id} orderNumber={detail.numero} />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-background px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Pagamento</p>
          <p className="mt-1 font-medium">
            {detail.paymentMode ? `${formatPaymentMode(detail.paymentMode)} - ` : ""}
            {detail.formaPagamento ? formatPaymentMethod(detail.formaPagamento) : "Nao informado"}
          </p>
        </div>
        {detail.paymentStatus ? (
          <div className="rounded-2xl bg-background px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              Status do pagamento
            </p>
            <p className="mt-1 font-medium">{formatPaymentStatus(detail.paymentStatus)}</p>
          </div>
        ) : null}
        <div className="rounded-2xl bg-background px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Criado em</p>
          <p className="mt-1 font-medium">{new Date(detail.createdAt).toLocaleString("pt-BR")}</p>
        </div>
        {detail.trocoPara ? (
          <div className="rounded-2xl bg-background px-3 py-2">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Troco</p>
            <p className="mt-1 font-medium">{formatBRL(detail.trocoPara)}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 rounded-2xl bg-background px-3 py-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatBRL(detail.subtotal)}</span>
        </div>
        <div className="mt-1 flex justify-between">
          <span className="text-muted-foreground">Entrega</span>
          <span>{formatBRL(detail.taxaEntrega)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
          <span>Total</span>
          <span>{formatBRL(detail.total)}</span>
        </div>
      </div>

      {detail.paymentStatus === "pending" &&
      detail.formaPagamento === "pix" &&
      detail.paymentPixQrCode &&
      detail.paymentPixQrCodeBase64 ? (
        <PixPaymentPanel
          className="mt-4"
          payment={{
            orderNumber: detail.numero,
            qrCode: detail.paymentPixQrCode,
            qrCodeBase64: detail.paymentPixQrCodeBase64,
            ticketUrl: detail.paymentTicketUrl,
          }}
        />
      ) : null}

      <div className="mt-4 space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-gold">Timeline do pedido</p>
        {timeline.map((step, index) => (
          <div key={step.key} className="grid grid-cols-[28px_1fr_auto] items-start gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`grid size-7 place-items-center rounded-full text-xs font-bold ${
                  step.state === "done"
                    ? "bg-sage text-primary-foreground"
                    : step.state === "current"
                      ? "bg-gold text-[color:var(--accent-foreground)]"
                      : "border border-border bg-background text-muted-foreground"
                }`}
              >
                {step.state === "done" ? "OK" : index + 1}
              </span>
              {index < timeline.length - 1 ? <span className="mt-1 h-8 w-px bg-border" /> : null}
            </div>
            <div>
              <p className="text-sm font-semibold">{step.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
            </div>
            <span className="text-[11px] text-muted-foreground">{step.time}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        <p className="text-xs uppercase tracking-[0.18em] text-gold">Itens do pedido</p>
        {detail.itens.length === 0 ? (
          <p className="text-sm text-muted-foreground">Carregando itens...</p>
        ) : (
          detail.itens.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-2xl border border-border px-3 py-2 text-sm"
            >
              <span>
                {item.quantidade}x {item.produtos?.nome ?? "Produto"}
              </span>
              <span>{formatBRL(item.preco_unitario * item.quantidade)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PasswordHint() {
  return (
    <p className="rounded-2xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      Use ao menos 6 caracteres, com letras e numeros.
    </p>
  );
}

function InfoMessage({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm">
      {children}
    </p>
  );
}

function FieldInput({
  value,
  onChange,
  placeholder,
  type = "text",
  readOnly = false,
  className = "",
  onBlur,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  readOnly?: boolean;
  className?: string;
  onBlur?: () => void;
  options?: string[];
}) {
  if (options?.length) {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        disabled={readOnly}
        className={`w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none ${value ? "" : "text-muted-foreground"} ${className}`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option} className="text-foreground">
            {option}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      type={type}
      readOnly={readOnly}
      className={`w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none ${className}`}
    />
  );
}

function BottomNav({
  tab,
  onChange,
  badge,
  mesaMode = false,
}: {
  tab: Tab;
  onChange: (tab: Tab) => void;
  badge: number;
  mesaMode?: boolean;
}) {
  const items: { id: Tab; icon: ReactNode; label: string }[] = [
    { id: "home", icon: <HomeIcon className="size-5" />, label: "Inicio" },
    ...(mesaMode
      ? []
      : [
          { id: "favoritos" as Tab, icon: <Heart className="size-5" />, label: "Favoritos" },
          { id: "ofertas" as Tab, icon: <TicketIcon className="size-5" />, label: "Ofertas" },
        ]),
    { id: "carrinho", icon: <ShoppingBag className="size-5" />, label: "Carrinho" },
    { id: "perfil", icon: <User className="size-5" />, label: "Perfil" },
  ];

  return (
    <nav className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between rounded-full border border-border bg-card/95 px-2 py-2 shadow-soft backdrop-blur">
      {items.map((item) => {
        const active = item.id === tab;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            aria-label={item.label}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 transition-all ${
              active ? "gradient-sage text-primary-foreground shadow-soft" : "text-muted-foreground"
            }`}
          >
            {item.icon}
            {item.id === "carrinho" && badge > 0 ? (
              <span className="absolute -top-1 right-2 grid size-4 place-items-center rounded-full bg-gold text-[10px] font-bold text-[color:var(--accent-foreground)]">
                {badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

function Placeholder({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <main className="px-5 py-16 text-center animate-fade-up">
      <div className="mb-3 text-6xl animate-float">🍽️</div>
      <h2 className="font-display text-2xl">{titulo}</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{subtitulo}</p>
    </main>
  );
}

function pedidoStatusLabel(status: PedidoStatus | null, paymentStatus?: string | null) {
  if (paymentStatus === "pending") return "Aguardando pagamento";
  if (status === "aberto") return "Recebido";
  if (status === "em_preparo") return "Em preparo";
  if (status === "pronto") return "Pronto para entrega";
  if (status === "em_entrega") return "Em rota";
  if (status === "entregue") return "Entregue";
  if (status === "cancelado") return "Cancelado";
  return "Aguardando";
}

function getPedidoProgress(status: PedidoStatus | null, paymentStatus?: string | null) {
  if (paymentStatus === "pending") return { percent: 8, label: "Aguardando pagamento" };
  if (status === "aberto") return { percent: 20, label: "Recebido" };
  if (status === "em_preparo") return { percent: 45, label: "Em preparo" };
  if (status === "pronto") return { percent: 70, label: "Pronto para entrega" };
  if (status === "em_entrega") return { percent: 88, label: "Em rota" };
  if (status === "entregue") return { percent: 100, label: "Concluido" };
  if (status === "cancelado") return { percent: 100, label: "Cancelado" };
  return { percent: 10, label: "Aguardando" };
}

function buildCustomerTimeline(detail: CustomerOrderDetail) {
  const createdAt = new Date(detail.createdAt);
  const paymentPending = detail.paymentStatus === "pending";
  const currentStep =
    detail.status === "cancelado"
      ? -1
      : ["aberto", "em_preparo", "pronto", "em_entrega", "entregue"].indexOf(detail.status);
  const formatTime = (offsetMinutes: number) =>
    new Date(createdAt.getTime() + offsetMinutes * 60000).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return [
    {
      key: "payment",
      title: "Pagamento iniciado",
      description: paymentPending
        ? "Aguardando confirmacao do Mercado Pago para liberar a producao."
        : "Pagamento reconhecido e pedido liberado para a loja.",
      time: formatTime(0),
      state: paymentPending ? "current" : "done",
    },
    {
      key: "confirmed",
      title: "Pedido confirmado",
      description: "Recebemos seu pedido e iniciamos a separacao.",
      time: formatTime(2),
      state: paymentPending ? "pending" : currentStep >= 0 ? "done" : "current",
    },
    {
      key: "preparing",
      title: "Em preparo",
      description: "A equipe esta preparando os itens.",
      time: formatTime(8),
      state: paymentPending
        ? "pending"
        : currentStep > 1
          ? "done"
          : currentStep === 1
            ? "current"
            : "pending",
    },
    {
      key: "ready",
      title: "Pronto para entrega",
      description: "Pedido embalado e aguardando retirada.",
      time: formatTime(16),
      state: paymentPending
        ? "pending"
        : currentStep > 2
          ? "done"
          : currentStep === 2
            ? "current"
            : "pending",
    },
    {
      key: "route",
      title: "Saiu para entrega",
      description: "Seu pedido esta a caminho do endereco cadastrado.",
      time: formatTime(24),
      state: paymentPending
        ? "pending"
        : currentStep > 3
          ? "done"
          : currentStep === 3
            ? "current"
            : "pending",
    },
    {
      key: "delivered",
      title: "Entregue",
      description:
        detail.status === "cancelado" ? "Pedido cancelado." : "Entrega concluida com sucesso.",
      time: formatTime(34),
      state: paymentPending
        ? "pending"
        : currentStep >= 4
          ? "done"
          : detail.status === "cancelado"
            ? "current"
            : "pending",
    },
  ] as const;
}

function formatPaymentStatus(status: string) {
  return (
    {
      approved: "Aprovado",
      pending: "Pendente",
      in_process: "Em analise",
      rejected: "Recusado",
      cancelled: "Cancelado",
      refunded: "Estornado",
      charged_back: "Chargeback",
    }[status] ?? status.replaceAll("_", " ")
  );
}

function formatPaymentMethod(method: string) {
  return (
    {
      pix: "Pix",
      credito: "Cartao de credito",
      debito: "Cartao de debito",
      dinheiro: "Dinheiro",
    }[method] ?? method
  );
}

function formatPaymentMode(mode: string) {
  return mode === "online"
    ? "Pagamento online"
    : mode === "delivery"
      ? "Pagamento na entrega"
      : mode;
}

function PixPaymentPanel({
  payment,
  className = "",
}: {
  payment: {
    orderNumber: number;
    qrCode: string;
    qrCodeBase64: string;
    ticketUrl: string | null;
  };
  className?: string;
}) {
  async function copyPixCode() {
    try {
      await navigator.clipboard.writeText(payment.qrCode);
    } catch {
      // noop
    }
  }

  return (
    <div className={`rounded-3xl border border-border bg-card p-5 shadow-soft ${className}`.trim()}>
      <p className="text-xs uppercase tracking-[0.2em] text-gold">
        Pix do pedido #{payment.orderNumber}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Esse QR Code e temporario e o pedido so entra na operacao quando o Mercado Pago confirmar o
        pagamento.
      </p>
      <div className="mt-4 flex justify-center rounded-3xl bg-background p-4">
        <img
          src={`data:image/jpeg;base64,${payment.qrCodeBase64}`}
          alt={`QR Code Pix do pedido ${payment.orderNumber}`}
          className="size-56 rounded-2xl object-contain"
        />
      </div>
      <div className="mt-4 rounded-2xl border border-border bg-background p-3">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Pix copia e cola
        </p>
        <p className="mt-2 break-all text-xs text-foreground">{payment.qrCode}</p>
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => void copyPixCode()}
          className="w-full rounded-full border border-border bg-background px-4 py-3 text-sm font-semibold"
        >
          Copiar codigo Pix
        </button>
      </div>
    </div>
  );
}

function firstName(name: string) {
  return name.trim().split(" ").filter(Boolean)[0] ?? "cliente";
}
