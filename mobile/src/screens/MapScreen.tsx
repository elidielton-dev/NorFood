import { Feather } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { HeaderMobile } from "../components/HeaderMobile";
import { ModalOcorrencia } from "../components/ModalOcorrencia";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppData } from "../context/AppDataContext";
import { SERVICE_CITY_CONFIG } from "../lib/city-config";
import { fetchRoutePath } from "../lib/route-path";
import { useRealtimeLocation } from "../location/useRealtimeLocation";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useAppTheme } from "../styles/theme";

const STORE_COORDINATE = {
  latitude: SERVICE_CITY_CONFIG.center.latitude,
  longitude: SERVICE_CITY_CONFIG.center.longitude,
};

export function MapScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "DeliveryMap">>();
  const {
    getDelivery,
    advanceDelivery,
    reportIncident,
    quickMessages,
    sendQuickMessage,
    openWhatsApp,
    openSms,
  } = useAppData();
  const {
    currentLocation,
    routeHistory,
    trackingActive,
    permissionsGranted,
    backgroundPermissionsGranted,
  } = useRealtimeLocation();
  const [showIncident, setShowIncident] = useState(false);
  const [routePath, setRoutePath] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [followingRider, setFollowingRider] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const delivery = getDelivery(route.params.deliveryId);
  const deliveryCompleted =
    delivery?.status === "completed" || (delivery?.routeStage ?? "assigned") === "delivered";

  const mapState = useMemo(() => {
    const customer = {
      latitude: delivery?.customerLatitude ?? SERVICE_CITY_CONFIG.neighborhoods[0].latitude,
      longitude: delivery?.customerLongitude ?? SERVICE_CITY_CONFIG.neighborhoods[0].longitude,
    };
    const rider = currentLocation
      ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        }
      : {
          latitude: SERVICE_CITY_CONFIG.center.latitude,
          longitude: SERVICE_CITY_CONFIG.center.longitude,
        };

    return { customer, rider };
  }, [currentLocation, delivery?.customerLatitude, delivery?.customerLongitude]);

  useEffect(() => {
    if (!mapRef.current || !currentLocation || !followingRider) return;
    mapRef.current.animateToRegion(
      {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      700,
    );
  }, [currentLocation, followingRider]);

  useEffect(() => {
    let active = true;

    const loadRoute = async () => {
      const points = [STORE_COORDINATE, mapState.rider, mapState.customer];
      const nextRoute = await fetchRoutePath(points);
      if (!active) return;
      setRoutePath(nextRoute);
    };

    void loadRoute();

    return () => {
      active = false;
    };
  }, [mapState.customer, mapState.rider]);

  function recenterToRider() {
    if (!mapRef.current) return;
    setFollowingRider(true);
    mapRef.current.animateToRegion(
      {
        latitude: mapState.rider.latitude,
        longitude: mapState.rider.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      },
      700,
    );
  }

  function handleMapInteraction() {
    setFollowingRider(false);
    setDetailsExpanded(false);
  }

  async function handleAdvanceDelivery() {
    if (!delivery || deliveryCompleted || advancing) return;
    setAdvancing(true);
    try {
      await advanceDelivery(delivery.id);
    } catch (error) {
      Alert.alert(
        "Nao foi possivel concluir",
        error instanceof Error ? error.message : "Falha ao atualizar o status da entrega.",
      );
    } finally {
      setAdvancing(false);
    }
  }

  if (!delivery) return null;

  return (
    <ScreenContainer>
      <View
        className="overflow-hidden rounded-[32px]"
        style={{
          backgroundColor: theme.primary,
          shadowColor: theme.shadow,
          shadowOpacity: 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 4,
        }}
      >
        <View className="px-5 pb-4 pt-2">
          <HeaderMobile
            title={`Pedido ${delivery.number}`}
            subtitle={`Chega em aproximadamente ${delivery.etaMinutes} min`}
            onLeftPress={() => navigation.goBack()}
            leftIcon="arrow-left"
            rightIcon="message-circle"
            onRightPress={() => openWhatsApp(delivery.id)}
            inverse
          />
          <Text style={{ color: theme.accentBright, fontFamily: "Manrope_700Bold", fontSize: 14 }}>
            {trackingActive
              ? backgroundPermissionsGranted
                ? "GPS transmitindo em tempo real"
                : "GPS em uso no app. Libere o acesso em segundo plano para rastrear mesmo com a tela fechada."
              : "Aguardando permissao de localizacao"}
          </Text>
        </View>

        <View
          className="overflow-hidden rounded-t-[28px]"
          style={{ height: detailsExpanded ? 320 : 470 }}
        >
          <MapView
            ref={(instance) => {
              mapRef.current = instance;
            }}
            style={{ flex: 1 }}
            initialRegion={{
              latitude: mapState.rider.latitude,
              longitude: mapState.rider.longitude,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
            showsUserLocation
            scrollEnabled
            zoomEnabled
            rotateEnabled
            pitchEnabled
            onPanDrag={handleMapInteraction}
            onTouchStart={handleMapInteraction}
          >
            <Marker
              coordinate={STORE_COORDINATE}
              title="Loja NorFood"
              pinColor={theme.primary}
            />
            <Marker
              coordinate={mapState.customer}
              title={delivery.customer}
              pinColor={theme.accent}
            />
            <Marker coordinate={mapState.rider} title="Entregador" pinColor={theme.accentBright} />
            {routePath.length > 1 ? (
              <Polyline coordinates={routePath} strokeWidth={4} strokeColor={theme.accent} />
            ) : (
              <Polyline
                coordinates={[STORE_COORDINATE, mapState.rider, mapState.customer]}
                strokeWidth={4}
                strokeColor={theme.accent}
              />
            )}
            {routeHistory.length > 1 ? (
              <Polyline
                coordinates={routeHistory.map((item) => ({
                  latitude: item.latitude,
                  longitude: item.longitude,
                }))}
                strokeWidth={5}
                strokeColor={theme.primary}
              />
            ) : null}
          </MapView>

          {!followingRider ? (
            <Pressable
              onPress={recenterToRider}
              className="absolute bottom-4 right-4 flex-row items-center gap-2 rounded-full px-4 py-3"
              style={{
                backgroundColor: theme.backgroundElevated,
                borderWidth: 1,
                borderColor: theme.border,
                shadowColor: theme.shadow,
                shadowOpacity: 0.16,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 3,
              }}
            >
              <Feather name="navigation" size={16} color={theme.primary} />
              <Text style={{ color: theme.text, fontFamily: "Manrope_700Bold", fontSize: 13 }}>
                Voltar pra rota
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        className="rounded-[32px] p-5"
        style={{
          backgroundColor: theme.backgroundElevated,
          borderWidth: 1,
          borderColor: theme.border,
          shadowColor: theme.shadow,
          shadowOpacity: 0.1,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
          marginTop: detailsExpanded ? -40 : -14,
        }}
      >
        <Pressable
          onPress={() => setDetailsExpanded((current) => !current)}
          className="flex-row items-center justify-between"
        >
          <View className="flex-1 pr-3">
            <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 23 }}>
              {delivery.customer}
            </Text>
            <Text
              className="mt-1"
              style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 14 }}
            >
              {detailsExpanded ? delivery.phone : "Toque para ver detalhes da entrega"}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            {detailsExpanded ? (
              <>
                <ActionCircle icon="phone" onPress={() => openSms(delivery.id)} />
                <ActionCircle icon="message-circle" onPress={() => openWhatsApp(delivery.id)} />
              </>
            ) : null}
            <View
              className="h-11 w-11 items-center justify-center rounded-full"
              style={{
                backgroundColor: theme.backgroundSoft,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Feather
                name={detailsExpanded ? "chevron-down" : "chevron-up"}
                size={18}
                color={theme.accent}
              />
            </View>
          </View>
        </Pressable>

        {detailsExpanded ? (
          <>
            <View className="mt-5 gap-4">
              <InfoBlock
                label="Endereco"
                value={`${delivery.address} - ${delivery.neighborhood}`}
              />
              <InfoBlock label="Referencia" value={delivery.reference} />
              <InfoBlock label="Resumo do pedido" value={delivery.items.join("\n")} />
            </View>

            <View className="mt-5 flex-row flex-wrap gap-3">
              <MetricPill
                label="Fila"
                value={
                  deliveryCompleted
                    ? "Finalizada"
                    : delivery.deliveriesAhead
                      ? `${delivery.deliveriesAhead} antes da sua`
                      : "Voce e a proxima"
                }
              />
              <MetricPill
                label="Distancia"
                value={`${deliveryCompleted ? "0.0" : delivery.distanceKm.toFixed(1)} km`}
              />
              <MetricPill
                label="Permissao GPS"
                value={permissionsGranted ? "Liberada" : "Pendente"}
              />
              <MetricPill
                label="Segundo plano"
                value={backgroundPermissionsGranted ? "Liberado" : "Nao liberado"}
              />
            </View>

            <View
              className="mt-5 rounded-[24px] p-4"
              style={{ backgroundColor: theme.backgroundSoft }}
            >
              <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 17 }}>
                Minha rota
              </Text>
              <Text
                className="mt-1"
                style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 13 }}
              >
                {deliveryCompleted
                  ? "Entrega finalizada. A fila foi atualizada automaticamente."
                  : delivery.deliveriesAhead
                    ? `Seu trajeto tem ${delivery.deliveriesAhead} entregas antes desta parada.`
                    : "Esta e a proxima entrega da rota."}
              </Text>
              <View className="mt-4 gap-3">
                <RouteStep
                  label="Cheguei na loja"
                  description="Confirme a chegada ao ponto de retirada"
                  done={["arrived_store", "picked_up", "arrived_customer", "delivered"].includes(
                    delivery.routeStage ?? "assigned",
                  )}
                  active={(delivery.routeStage ?? "assigned") === "arrived_store"}
                />
                <RouteStep
                  label="Pedido retirado"
                  description="Pedido saiu da loja e entrou em rota"
                  done={["picked_up", "arrived_customer", "delivered"].includes(
                    delivery.routeStage ?? "assigned",
                  )}
                  active={(delivery.routeStage ?? "assigned") === "picked_up"}
                />
                <RouteStep
                  label="Cheguei ao cliente"
                  description="Avise o cliente e finalize a parada"
                  done={["arrived_customer", "delivered"].includes(
                    delivery.routeStage ?? "assigned",
                  )}
                  active={(delivery.routeStage ?? "assigned") === "arrived_customer"}
                />
                <RouteStep
                  label="Entregue"
                  description="Fila atualizada automaticamente"
                  active={(delivery.routeStage ?? "assigned") === "delivered"}
                  done={(delivery.routeStage ?? "assigned") === "delivered"}
                />
              </View>
            </View>

            <View className="mt-5 flex-row flex-wrap gap-2">
              {quickMessages.slice(0, 3).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => sendQuickMessage(delivery.id, item)}
                  className="rounded-full px-4 py-3"
                  style={{
                    backgroundColor: `${theme.accentBright}22`,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Text
                    style={{ color: theme.text, fontFamily: "Manrope_700Bold", fontSize: 12.5 }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View className="mt-6 gap-3">
              <Pressable
                onPress={() => void handleAdvanceDelivery()}
                disabled={advancing || deliveryCompleted}
                className="rounded-full py-[15px]"
                style={{
                  backgroundColor: theme.accentBright,
                  opacity: advancing || deliveryCompleted ? 0.7 : 1,
                }}
              >
                <Text
                  className="text-center"
                  style={{ color: theme.primary, fontFamily: "Manrope_800ExtraBold", fontSize: 16 }}
                >
                  {deliveryCompleted
                    ? "Entrega concluida"
                    : advancing
                      ? "Atualizando entrega..."
                      : actionLabel(delivery.routeStage ?? "assigned")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setShowIncident(true)}
                className="rounded-full py-[15px]"
                style={{ backgroundColor: theme.backgroundSoft }}
              >
                <Text
                  className="text-center"
                  style={{ color: theme.text, fontFamily: "Manrope_700Bold", fontSize: 15 }}
                >
                  Registrar problema
                </Text>
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate("Occurrences", { deliveryId: delivery.id })}
                className="rounded-full py-[15px]"
                style={{
                  backgroundColor: theme.backgroundElevated,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text
                  className="text-center"
                  style={{ color: theme.accent, fontFamily: "Manrope_700Bold", fontSize: 15 }}
                >
                  Central de ocorrencias
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View className="mt-4 flex-row flex-wrap gap-3">
            <MetricPill
              label="Fila"
              value={
                deliveryCompleted
                  ? "Finalizada"
                  : delivery.deliveriesAhead
                    ? `${delivery.deliveriesAhead} antes`
                    : "Proxima"
              }
            />
            <MetricPill
              label="Distancia"
              value={`${deliveryCompleted ? "0.0" : delivery.distanceKm.toFixed(1)} km`}
            />
            <MetricPill
              label="ETA"
              value={deliveryCompleted ? "Finalizado" : `${delivery.etaMinutes} min`}
            />
          </View>
        )}
      </ScrollView>

      <ModalOcorrencia
        visible={showIncident}
        onClose={() => setShowIncident(false)}
        onSubmit={(type, note) => reportIncident(delivery.id, type, note)}
      />
    </ScreenContainer>
  );
}

function actionLabel(step: string) {
  if (step === "assigned") return "Cheguei na loja";
  if (step === "arrived_store") return "Pedido retirado";
  if (step === "picked_up") return "Cheguei ao cliente";
  if (step === "arrived_customer") return "Entregue";
  return "Entrega concluida";
}

function ActionCircle({
  icon,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void | Promise<void>;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className="h-11 w-11 items-center justify-center rounded-full"
      style={{ backgroundColor: `${theme.accentBright}33` }}
    >
      <Feather name={icon} size={18} color={theme.accent} />
    </Pressable>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();
  return (
    <View>
      <Text style={{ color: theme.textSoft, fontFamily: "Manrope_600SemiBold", fontSize: 11.5 }}>
        {label}
      </Text>
      <Text
        className="mt-1"
        style={{
          color: theme.text,
          fontFamily: "Manrope_600SemiBold",
          fontSize: 14.5,
          lineHeight: 22,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();
  return (
    <View
      className="rounded-full px-4 py-3"
      style={{ backgroundColor: theme.backgroundSoft, borderWidth: 1, borderColor: theme.border }}
    >
      <Text style={{ color: theme.textSoft, fontFamily: "Manrope_600SemiBold", fontSize: 11 }}>
        {label}
      </Text>
      <Text
        className="mt-1"
        style={{ color: theme.text, fontFamily: "Manrope_700Bold", fontSize: 13.5 }}
      >
        {value}
      </Text>
    </View>
  );
}

function RouteStep({
  label,
  description,
  active = false,
  done = false,
}: {
  label: string;
  description: string;
  active?: boolean;
  done?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <View className="flex-row items-start gap-3">
      <View
        className="mt-1 h-7 w-7 items-center justify-center rounded-full"
        style={{
          backgroundColor: done
            ? theme.primary
            : active
              ? theme.accentBright
              : theme.backgroundElevated,
          borderWidth: done || active ? 0 : 1,
          borderColor: theme.border,
        }}
      >
        <Text
          style={{
            color: done ? theme.backgroundElevated : active ? theme.primary : theme.textMuted,
            fontFamily: "Manrope_800ExtraBold",
            fontSize: 11,
          }}
        >
          {done ? "OK" : active ? "AG" : "..."}
        </Text>
      </View>
      <View className="flex-1">
        <Text style={{ color: theme.text, fontFamily: "Manrope_700Bold", fontSize: 14 }}>
          {label}
        </Text>
        <Text
          className="mt-1"
          style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 13 }}
        >
          {description}
        </Text>
      </View>
    </View>
  );
}
