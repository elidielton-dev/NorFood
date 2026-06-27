import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Linking } from "react-native";
import { initialAppState } from "../data/mockData";
import {
  acceptRiderDelivery,
  advanceRiderDelivery,
  fetchRiderAppState,
  getCurrentSession,
  loginRider,
  logoutRider,
  markNotificationsRead,
  reportRiderIncident,
  sendRiderLocation,
  sendRiderMessage,
  subscribeToAuthChanges,
  subscribeToRiderDataChanges,
  updateRiderProfile,
  updateRiderOnline,
} from "../data/riderApi";
import { loadAppState, saveAppState } from "../data/storage";
import {
  AppNotification,
  AppState,
  DeliveryMessage,
  DeliveryOrder,
  DeliveryRouteStage,
  IncidentType,
  QuickMessageTemplate,
} from "../types";

type AppDataContextValue = {
  state: AppState;
  ready: boolean;
  lastMessage: DeliveryMessage | null;
  login: (phone: string, password: string, rememberLogin: boolean, onlineAfterLogin: boolean) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
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
    text: "Oi. Sou o entregador NorFood e estou a caminho com o seu pedido.",
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
  const [state, setState] = useState<AppState>(initialAppState);
  const [ready, setReady] = useState(false);
  const [lastMessage, setLastMessage] = useState<DeliveryMessage | null>(null);

  async function syncRemoteState() {
    try {
      const remote = await fetchRiderAppState();
      riderIdRef.current = remote.rider.id;
      setState((current) => ({
        ...current,
        ...(remote as unknown as AppState),
        loggedIn: remote.loggedIn,
        rememberLogin: current.rememberLogin,
        rider: {
          ...current.rider,
          ...((remote as unknown as AppState).rider ?? {}),
        },
      }));
    } catch (error) {
      console.warn("[mobile] Falha ao sincronizar estado remoto do entregador.", error);
    }
  }

  useEffect(() => {
    loadAppState()
      .then(async (loaded) => {
        setState({ ...initialAppState, ...loaded, loggedIn: false });
        try {
          const session = await getCurrentSession();
          if (session?.user) {
            riderIdRef.current = session.user.id;
            await syncRemoteState();
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
        setState((current) => ({ ...current, loggedIn: false, deliveries: [], incidents: [], messages: [], notifications: [] }));
        return;
      }

      syncRemoteState().catch(() => undefined);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveAppState(state);
  }, [ready, state]);

  useEffect(() => {
    if (!ready || !state.loggedIn) return;

    const interval = setInterval(() => {
      syncRemoteState().catch(() => undefined);
    }, 5000);

    return () => clearInterval(interval);
  }, [ready, state.loggedIn]);

  useEffect(() => {
    if (!state.loggedIn || !state.rider.id) return;
    return subscribeToRiderDataChanges(state.rider.id, () => {
      syncRemoteState().catch(() => undefined);
    });
  }, [state.loggedIn, state.rider.id]);

  async function refresh() {
    await syncRemoteState();
  }

  async function login(phone: string, _password: string, rememberLogin: boolean, onlineAfterLogin: boolean) {
    await loginRider(phone, _password);
    await syncRemoteState();
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

  function logout() {
    void logoutRider();
    setState((current) => ({ ...current, loggedIn: false }));
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

  const value = useMemo(
    () => ({
      state,
      ready,
      lastMessage,
      login,
      logout,
      refresh,
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
    [lastMessage, ready, state, unreadNotifications],
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
