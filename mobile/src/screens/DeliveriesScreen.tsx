import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CardPedido } from "../components/CardPedido";
import { HeaderMobile } from "../components/HeaderMobile";
import { ModalDetalhesEntrega } from "../components/ModalDetalhesEntrega";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppData } from "../context/AppDataContext";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useAppTheme } from "../styles/theme";
import { DeliveryOrder, DeliveryTab } from "../types";

const tabs: Array<{ key: DeliveryTab; label: string }> = [
  { key: "disponiveis", label: "Disponíveis" },
  { key: "andamento", label: "Em andamento" },
  { key: "historico", label: "Histórico" },
];

export function DeliveriesScreen() {
  const theme = useAppTheme();
  const { state, acceptDelivery } = useAppData();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [activeTab, setActiveTab] = useState<DeliveryTab>("disponiveis");
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryOrder | undefined>();

  const filtered = useMemo(() => {
    if (activeTab === "disponiveis") {
      return state.deliveries.filter((item) => item.status === "available");
    }
    if (activeTab === "andamento") {
      return state.deliveries.filter((item) => item.status === "in_progress");
    }
    return state.deliveries.filter((item) => item.status === "completed");
  }, [activeTab, state.deliveries]);

  return (
    <ScreenContainer>
      <HeaderMobile
        title="Entregas"
        subtitle="Acompanhe pedidos e aceite novas corridas."
        onLeftPress={() => undefined}
        rightIcon="sliders"
      />

      <View
        className="mb-5 flex-row rounded-full p-1.5"
        style={{
          backgroundColor: theme.backgroundElevated,
          borderWidth: 1,
          borderColor: theme.border,
          shadowColor: theme.shadow,
          shadowOpacity: 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 1,
        }}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className="flex-1 rounded-full px-4 py-3"
              style={{ backgroundColor: active ? theme.primary : "transparent" }}
            >
              <View className="flex-row items-center justify-center gap-1.5">
                <Text
                  className="text-center"
                  style={{
                    color: active ? "#fff" : theme.textMuted,
                    fontFamily: active ? "Manrope_800ExtraBold" : "Manrope_600SemiBold",
                  }}
                >
                  {tab.label}
                </Text>
                {!active ? (
                  <View className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.accentBright }} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View className="gap-0.5">
      {filtered.map((delivery) => (
        <CardPedido
          key={delivery.id}
          delivery={delivery}
          primaryLabel={
            delivery.status === "available"
              ? "Aceitar entrega"
              : delivery.status === "in_progress"
                ? "Ver rota"
                : "Ver detalhes"
          }
          onPrimaryPress={() =>
            delivery.status === "available"
              ? acceptDelivery(delivery.id)
              : delivery.status === "in_progress"
                ? navigation.navigate("DeliveryMap", { deliveryId: delivery.id })
                : navigation.navigate("DeliveryDetails", { deliveryId: delivery.id })
          }
          onSecondaryPress={() => setSelectedDelivery(delivery)}
        />
      ))}
      </View>

      {!filtered.length ? (
        <View
          className="mt-12 items-center rounded-[28px] p-6"
          style={{
            backgroundColor: theme.backgroundElevated,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Feather name="package" size={26} color={theme.accent} />
          <Text
            className="mt-4"
            style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 20 }}
          >
            Nenhuma entrega nesta aba
          </Text>
        </View>
      ) : null}

      <ModalDetalhesEntrega
        visible={!!selectedDelivery}
        delivery={selectedDelivery}
        onClose={() => setSelectedDelivery(undefined)}
      />
    </ScreenContainer>
  );
}
