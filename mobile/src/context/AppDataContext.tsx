import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Linking } from "react-native";
import { initialAppState } from "../data/mockData";
import {
  acceptRiderDelivery,
  advanceRiderDelivery,
  fetchRiderAppState,
  getCurrentSession,
  getActiveRiderTenantId,
  loginRider,
  logoutRider,
  markNotificationsRead,
  reportRiderIncident,
  sendRiderLocation,
  sendRiderMessage,
  setActiveRiderTenant,
  subscribeToAuthChanges,
  subscribeToRiderDataChanges,
  updateRiderProfile,
  updateRiderOnline,
  uploadRiderAvatar,
} from "../data/riderApi";
import { fetchRiderTenancies, fetchTenantSettings } from "../data/tenantApi";
import { loadActiveTenantId, loadAppState, saveActiveTenantId, saveAppState } from "../data/storage";
import {
  AppNotification,
  AppState,
  DeliveryMessage,
  DeliveryOrder,
  DeliveryRouteStage,
  IncidentType,
  QuickMessageTemplate,
  TenantSummary,
} from "../types";

type AppDataContextValue = {
  state: AppState;
  ready: boolean;
  lastMessage: DeliveryMessage | null;
  needsTenantSelection: boolean;
  login: (phone: string, password: string, rememberLogin: boolean, onlineAfterLogin: boolean) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  selectTenant: (tenantId: string) => Promise<void>;
  uploadAvatar: (localUri: string) => Promise<void>;
  updateProfile: (payload: Record<string, unknown>) => Promise<void>;
  setOnline: (value: boolean) => Promise<void>;
  acceptDelivery: (id: string) => Promise<void>;
  advanceDelivery: (id: string) => Promise<void>;
  pushLocationPing: (payload: {
    deliveryId: string;
    latitude: number;
    longitude: number;
    speed?: number | null;
    heading?: number | null;
    accuracy?: number | null;
    battery?: number | null;
    status?: string;
  }) => Promise<void>;
  reportIncident: (deliveryId: string, type: IncidentType, note: string) => Promise<void>;
  sendQuickMessage: (deliveryId: string, template: QuickMessageTemplate) => Promise<void>;
  openWhatsApp: (deliveryId: string) => Promise<void>;
  openSms: (deliveryId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  getDelivery: (id: string) => DeliveryOrder | undefined;
  getMessagesForDelivery: (deliveryId: string) => DeliveryMessage[];
  unreadNotifications: AppNotification[];
  quickMessages: QuickMessageTemplate[];
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

const routeStageOrder: DeliveryRouteStage[] = [
  "assigned",
  "arrived_store",
  "picked_up",
  "arrived_customer",
  "delivered",
];

const quickMessages: QuickMessageTemplate[] = [
  {
    id: "way",
    label: "Estou a caminho",
    text: "Oi. Sou o entregador e estou a caminho com o seu pedido.",
  },
  {
    id: "arriving",
    label: "Cheguei ao local",
    text: "Oi. Acabei de chegar ao local da entrega. Pode me chamar quando estiver disponivel?",
  },
  {
    id: "descend",
    label: "Pode descer?",
    text: "Oi. Pode descer para receber o pedido, por favor? Assim agilizamos a entrega.",
  },
  {
    id: "trouble",
    label: "Nao localizei",
    text: "Oi. Nao consegui localizar o endereco com precisao. Pode me enviar uma referencia rapida?",
  },
];

export function AppDataProvider({ children }: PropsWithChildren) {
  const riderIdRef = useRef<string | null>(null);
  const tenantsRef = useRef<TenantSummary[]>([]);
  const [state, setState] = useState<AppState>(initialAppState);
  const [ready, setReady] = useState(false);
  const [lastMessage, setLastMessage] = useState<DeliveryMessage | null>(null);

  async function applyTenantContext(tenantId: string, tenants: TenantSummary[]) {
    const tenant = tenants.find((item) => item.id === tenantId);
    if (!tenant) throw new Error("Empresa nao encontrada para este entregador.");

    const settings = await fetchTenantSettings(tenantId);
    setActiveRiderTenant(tenantId, settings);
    await saveActiveTenantId(tenantId);

    const remote = await fetchRiderAppState(tenantId);
    riderIdRef.current = remote.rider.id;

    setState((current) => ({
      ...current,
      ...(remote as unknown as AppState),
      loggedIn: true,
      rememberLogin: current.rememberLogin,
      activeTenantId: tenantId,
      tenant,
      tenantSettings: settings,
      availableTenants: tenants,
      rider: {
        ...current.rider,
        ...((remote as unknown as AppState).rider ?? {}),
      },
    }));
  }

  async function syncRemoteState() {
    const tenantId = getActiveRiderTenantId() ?? state.activeTenantId;
    if (!tenantId) return;
    try {
      const remote = await fetchRiderAppState(tenantId);
      riderIdRef.current = remote.rider.id;
      setState((current) => ({
        ...current,
        ...(remote as unknown as AppState),
        loggedIn: current.loggedIn,
        rememberLogin: current.rememberLogin,
        activeTenantId: current.activeTenantId,
        tenant: current.tenant,
        tenantSettings: current.tenantSettings,
        availableTenants: current.availableTenants,
        rider: {
          ...current.rider,
          ...((remote as unknown as AppState).rider ?? {}),
        },
      }));
    } catch (error) {
      console.warn("[mobile] Falha ao sincronizar estado remoto do entregador.", error);
    }
  }

  async function bootstrapTenants(userId: string, preferredTenantId?: string | null) {
    const tenants = await fetchRiderTenancies(userId);
    tenantsRef.current = tenants;

    if (!tenants.length) {
      throw new Error("Sua conta nao tem acesso a nenhuma empresa como entregador.");
    }

    const savedTenantId = preferredTenantId ?? (await loadActiveTenantId());
    const resolvedTenantId =
      tenants.length === 1
        ? tenants[0].id
        : savedTenantId && tenants.some((item) => item.id === savedTenantId)
          ? savedTenantId
          : null;

    if (resolvedTenantId) {
      await applyTenantContext(resolvedTenantId, tenants);
      return;
    }

    setState((current) => ({
      ...current,
      loggedIn: true,
      availableTenants: tenants,
      activeTenantId: null,
      tenant: null,
      tenantSettings: null,
    }));
  }

  useEffect(() => {
    loadAppState()
      .then(async (loaded) => {
        setState({ ...initialAppState, ...loaded, loggedIn: false });
        try {
          const session = await getCurrentSession();
          if (session?.user) {
            riderIdRef.current = session.user.id;
            await bootstrapTenants(session.user.id, loaded.activeTenantId);
          }
        } catch (error) {
          console.warn("[mobile] Falha ao restaurar sessao do entregador.", error);
        } finally {
          setReady(true);
        }
      })
      .catch((error) => {
        console.warn("[mobile] Falha ao carregar estado salvo do app.", error);
        setReady(true);
      });
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((session) => {
      riderIdRef.current = session?.user?.id ?? null;
      if (!session?.user) {
        setActiveRiderTenant(null, null);
        void saveActiveTenantId(null);
        setState((current) => ({
          ...current,
          loggedIn: false,
          activeTenantId: null,
          tenant: null,
          tenantSettings: null,
          availableTenants: [],
          deliveries: [],
          incidents: [],
          messages: [],
          notifications: [],
        }));
        return;
      }

      bootstrapTenants(session.user.id).catch(() => undefined);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveAppState(state);
  }, [ready, state]);

  useEffect(() => {
    if (!ready || !state.loggedIn || !state.activeTenantId) return;

    const interval = setInterval(() => {
      syncRemoteState().catch(() => undefined);
    }, 8000);

    return () => clearInterval(interval);
  }, [ready, state.loggedIn, state.activeTenantId]);

  useEffect(() => {
    if (!state.loggedIn || !state.rider.id || !state.activeTenantId) return;
    return subscribeToRiderDataChanges(state.rider.id, () => {
      syncRemoteState().catch(() => undefined);
    });
  }, [state.loggedIn, state.rider.id, state.activeTenantId]);

  async function refresh() {
    await syncRemoteState();
  }

  async function login(phone: string, password: string, rememberLogin: boolean, onlineAfterLogin: boolean) {
    await loginRider(phone, password);
    const session = await getCurrentSession();
    if (!session?.user) throw new Error("Nao foi possivel iniciar a sessao.");

    await bootstrapTenants(session.user.id);
    await updateRiderOnline(onlineAfterLogin);
    await syncRemoteState();

    setState((current) => ({
      ...current,
      loggedIn: true,
      rememberLogin,
      rider: {
        ...current.rider,
        email: phone,
        online: onlineAfterLogin,
      },
    }));
  }

  async function selectTenant(tenantId: string) {
    const tenants = tenantsRef.current.length ? tenantsRef.current : state.availableTenants;
    await applyTenantContext(tenantId, tenants);
  }

  function logout() {
    void logoutRider();
    setActiveRiderTenant(null, null);
    void saveActiveTenantId(null);
    setState((current) => ({ ...current, loggedIn: false, activeTenantId: null, tenant: null }));
  }

  async function uploadAvatar(localUri: string) {
    await uploadRiderAvatar(localUri);
    await syncRemoteState();
  }

  async function setOnline(value: boolean) {
    await updateRiderOnline(value);
    await syncRemoteState();
  }

  async function updateProfile(payload: Record<string, unknown>) {
    await updateRiderProfile(payload);
    await syncRemoteState();
  }

  async function acceptDelivery(id: string) {
    await acceptRiderDelivery(id);
    await syncRemoteState();
  }

  async function advanceDelivery(id: string) {
    const delivery = state.deliveries.find((item) => item.id === id);
    if (!delivery) return;
    const currentStage = delivery.routeStage ?? "assigned";
    const currentIndex = routeStageOrder.indexOf(currentStage);
    const nextStep = routeStageOrder[Math.min(currentIndex + 1, routeStageOrder.length - 1)];
    await advanceRiderDelivery(id, nextStep);
    await syncRemoteState();
  }

  async function pushLocationPing(payload: {
    deliveryId: string;
    latitude: number;
    longitude: number;
    speed?: number | null;
    heading?: number | null;
    accuracy?: number | null;
    battery?: number | null;
    status?: string;
  }) {
    await sendRiderLocation(payload.deliveryId, {
      riderId: riderIdRef.current ?? state.rider.id,
      latitude: payload.latitude,
      longitude: payload.longitude,
      speed: payload.speed,
      heading: payload.heading,
      accuracy: payload.accuracy,
      battery: payload.battery,
      status: payload.status,
    });
  }

  async function reportIncident(deliveryId: string, type: IncidentType, note: string) {
    await reportRiderIncident(deliveryId, type, note);
    await syncRemoteState();
  }

  async function sendQuickMessage(deliveryId: string, template: QuickMessageTemplate) {
    const message = await sendRiderMessage(deliveryId, template.text, template.id);
    setLastMessage(message);
    await syncRemoteState();
  }

  async function openWhatsApp(deliveryId: string) {
    const message = state.messages.find((item) => item.deliveryId === deliveryId) ?? lastMessage;
    if (message?.quickLinks?.whatsapp) {
      await Linking.openURL(message.quickLinks.whatsapp);
      return;
    }

    const delivery = getDelivery(deliveryId);
    if (delivery?.whatsapp) {
      const digits = delivery.whatsapp.replace(/\D/g, "");
      await Linking.openURL(`https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}`);
    }
  }

  async function openSms(deliveryId: string) {
    const message = state.messages.find((item) => item.deliveryId === deliveryId) ?? lastMessage;
    if (message?.quickLinks?.sms) {
      await Linking.openURL(message.quickLinks.sms);
      return;
    }

    const delivery = getDelivery(deliveryId);
    if (delivery?.phone) {
      await Linking.openURL(`sms:${delivery.phone.replace(/\D/g, "")}`);
    }
  }

  async function markAllNotificationsRead() {
    await markNotificationsRead();
    await syncRemoteState();
  }

  function getDelivery(id: string) {
    return state.deliveries.find((item) => item.id === id);
  }

  function getMessagesForDelivery(deliveryId: string) {
    return state.messages.filter((item) => item.deliveryId === deliveryId);
  }

  const unreadNotifications = state.notifications.filter((item) => !item.readAt);
  const needsTenantSelection = state.loggedIn && !state.activeTenantId && state.availableTenants.length > 0;

  const value = useMemo(
    () => ({
      state,
      ready,
      lastMessage,
      needsTenantSelection,
      login,
      logout,
      refresh,
      selectTenant,
      uploadAvatar,
      updateProfile,
      setOnline,
      acceptDelivery,
      advanceDelivery,
      pushLocationPing,
      reportIncident,
      sendQuickMessage,
      openWhatsApp,
      openSms,
      markAllNotificationsRead,
      getDelivery,
      getMessagesForDelivery,
      unreadNotifications,
      quickMessages,
    }),
    [lastMessage, needsTenantSelection, ready, state, unreadNotifications],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error("useAppData must be used within AppDataProvider");
  }
  return context;
}
