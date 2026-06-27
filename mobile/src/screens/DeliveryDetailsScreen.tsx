import { Feather } from "@expo/vector-icons";
import { Alert, Pressable, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import { HeaderMobile } from "../components/HeaderMobile";
import { RiderAvatar } from "../components/RiderAvatar";
import { TimelineEntrega } from "../components/TimelineEntrega";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppData } from "../context/AppDataContext";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useAppTheme } from "../styles/theme";

export function DeliveryDetailsScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "DeliveryDetails">>();
  const {
    getDelivery,
    state,
    advanceDelivery,
    quickMessages,
    sendQuickMessage,
    openWhatsApp,
    openSms,
    getMessagesForDelivery,
  } = useAppData();
  const [advancing, setAdvancing] = useState(false);
  const delivery = getDelivery(route.params.deliveryId);

  if (!delivery) return null;

  const deliveryId = delivery.id;
  const history = getMessagesForDelivery(delivery.id).slice(0, 3);
  const deliveryCompleted =
    delivery.status === "completed" || (delivery.routeStage ?? "assigned") === "delivered";

  async function handleAdvanceDelivery() {
    if (advancing || deliveryCompleted) return;
    setAdvancing(true);
    try {
      await advanceDelivery(deliveryId);
    } catch (error) {
      Alert.alert(
        "Nao foi possivel concluir",
        error instanceof Error ? error.message : "Falha ao atualizar o status da entrega.",
      );
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <ScreenContainer>
      <HeaderMobile
        title={`Pedido ${delivery.number}`}
        onLeftPress={() => navigation.goBack()}
        leftIcon="arrow-left"
        rightIcon="help-circle"
      />
      <TimelineEntrega delivery={delivery} />

      <View
        className="mt-5 rounded-[30px] p-4"
        style={{
          backgroundColor: theme.backgroundElevated,
          borderWidth: 1,
          borderColor: theme.border,
          shadowColor: theme.shadow,
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          elevation: 2,
        }}
      >
        <View className="flex-row items-center gap-3">
          <RiderAvatar uri={state.rider.avatar} name={state.rider.name} size={72} />
          <View className="flex-1">
            <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 20 }}>
              {state.rider.name}
            </Text>
            <Text
              className="mt-1"
              style={{ color: theme.accent, fontFamily: "Manrope_700Bold", fontSize: 14 }}
            >
              Nota {state.rider.score}
            </Text>
            <Text
              className="mt-1"
              style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 13.5 }}
            >
              {state.rider.vehicle}
            </Text>
            <Text
              style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 13.5 }}
            >
              {state.rider.plate}
            </Text>
          </View>
          <View className="flex-row gap-2">
            <ActionButton icon="phone" onPress={() => openSms(delivery.id)} />
            <ActionButton icon="message-circle" onPress={() => openWhatsApp(delivery.id)} />
          </View>
        </View>
      </View>

      <View
        className="mt-5 overflow-hidden rounded-[30px]"
        style={{
          backgroundColor: theme.backgroundElevated,
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <View style={{ height: 140, backgroundColor: theme.map }} />
        <View className="p-4">
          <Text style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 13 }}>
            {delivery.distanceKm.toFixed(1)} km de distancia restante
          </Text>
          <Text
            className="mt-2"
            style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 17 }}
          >
            Previsao de chegada: {delivery.eta}
          </Text>
        </View>
      </View>

      <View
        className="mt-5 rounded-[30px] p-4"
        style={{
          backgroundColor: theme.backgroundElevated,
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 18 }}>
          Mensagens rapidas
        </Text>
        <View className="mt-4 flex-row flex-wrap gap-2">
          {quickMessages.map((item) => (
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
              <Text style={{ color: theme.text, fontFamily: "Manrope_700Bold", fontSize: 12.5 }}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {history.length ? (
          <View className="mt-4 gap-3">
            {history.map((item) => (
              <View
                key={item.id}
                className="rounded-[22px] p-4"
                style={{
                  backgroundColor: theme.backgroundSoft,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ color: theme.text, fontFamily: "Manrope_700Bold", fontSize: 14 }}>
                  {item.text}
                </Text>
                <Text
                  className="mt-1"
                  style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 12 }}
                >
                  Enviado em{" "}
                  {new Date(item.createdAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <Pressable
        onPress={() => void handleAdvanceDelivery()}
        disabled={advancing || deliveryCompleted}
        className="mt-6 rounded-full py-[15px]"
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
              : getActionLabel(delivery.routeStage ?? "assigned")}
        </Text>
      </Pressable>
    </ScreenContainer>
  );
}

function ActionButton({
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

function getActionLabel(step: string) {
  if (step === "assigned") return "Cheguei na loja";
  if (step === "arrived_store") return "Ja retirei o pedido";
  if (step === "picked_up") return "Cheguei ao cliente";
  if (step === "arrived_customer") return "Entregue";
  return "Entrega concluida";
}
