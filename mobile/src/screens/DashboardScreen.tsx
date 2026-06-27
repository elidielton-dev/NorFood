import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CardResumo } from "../components/CardResumo";
import { FadeInView } from "../components/FadeInView";
import { HeaderMobile } from "../components/HeaderMobile";
import { ScreenContainer } from "../components/ScreenContainer";
import { TenantBrandBar } from "../components/TenantBrandBar";
import { useAppData } from "../context/AppDataContext";
import { useTenantTheme } from "../hooks/useTenantTheme";
import { RootStackParamList } from "../navigation/AppNavigator";
import { formatCurrency } from "../utils/format";

export function DashboardScreen() {
  const theme = useTenantTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { state, setOnline, unreadNotifications, markAllNotificationsRead } = useAppData();
  const [updatingOnline, setUpdatingOnline] = useState(false);
  const nextDelivery =
    state.deliveries.find((item) => item.status === "in_progress") ??
    state.deliveries.find((item) => item.status === "available");
  const completedCount = state.deliveries.filter((item) => item.status === "completed").length;
  const inProgressCount = state.deliveries.filter((item) => item.status === "in_progress").length;

  async function handleToggleOnline(value: boolean) {
    if (updatingOnline) return;
    setUpdatingOnline(true);
    try {
      await setOnline(value);
    } finally {
      setUpdatingOnline(false);
    }
  }

  return (
    <ScreenContainer>
      <FadeInView>
        <TenantBrandBar onSwitchPress={() => navigation.navigate("TenantSelect")} />
        <HeaderMobile
          avatar={state.rider.avatar}
          greeting={`Ola, ${state.rider.shortName}!`}
          subtitle={state.rider.greeting}
          onRightPress={() => markAllNotificationsRead()}
          rightBadge={unreadNotifications.length}
        />

        {unreadNotifications[0] ? (
          <Pressable
            onPress={() => markAllNotificationsRead()}
            className="mb-4 rounded-[26px] p-4"
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
            <View className="flex-row items-start gap-3">
              <View
                className="mt-0.5 h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: `${theme.accentBright}33` }}
              >
                <Feather name="bell" size={18} color={theme.accent} />
              </View>
              <View className="flex-1">
                <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 15.5 }}>
                  {unreadNotifications[0].title}
                </Text>
                <Text
                  className="mt-1"
                  style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 13.5 }}
                >
                  {unreadNotifications[0].body}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        <LinearGradient
          colors={[theme.primary, theme.primaryDeep]}
          style={{
            borderRadius: 30,
            padding: 20,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            shadowColor: theme.shadow,
            shadowOpacity: 0.18,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
            elevation: 4,
          }}
        >
          <View className="flex-1 pr-4">
            <Text
              style={{
                color: "rgba(255,255,255,0.8)",
                fontFamily: "Manrope_600SemiBold",
                fontSize: 15,
              }}
            >
              Voce esta
            </Text>
            <View className="mt-2 flex-row items-center gap-2">
              <View
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: state.rider.online ? "#8BFFA1" : theme.accentBright }}
              />
              <Text style={{ color: "#fff", fontFamily: "Manrope_800ExtraBold", fontSize: 33 }}>
                {state.rider.online ? "ONLINE" : "OFFLINE"}
              </Text>
            </View>
            <Text
              className="mt-2 max-w-[175px]"
              style={{
                color: "rgba(255,255,255,0.72)",
                fontFamily: "Manrope_500Medium",
                fontSize: 13.5,
                lineHeight: 20,
              }}
            >
              {updatingOnline
                ? "Atualizando sua disponibilidade..."
                : state.rider.online
                  ? "Disponivel para novas entregas"
                  : "Ative para receber novos pedidos"}
            </Text>
          </View>
          <View className="items-center">
            <View className="rounded-[24px] bg-white/10 px-5 py-4">
              <Text style={{ fontSize: 56 }}>🛵</Text>
            </View>
            <Switch
              className="mt-3"
              value={state.rider.online}
              onValueChange={handleToggleOnline}
              disabled={updatingOnline}
              thumbColor="#fff"
              trackColor={{ false: "rgba(255,255,255,0.28)", true: theme.accent }}
            />
            <Pressable
              onPress={() => handleToggleOnline(!state.rider.online)}
              disabled={updatingOnline}
              className="mt-3 rounded-full px-4 py-2.5"
              style={{ backgroundColor: "rgba(255,255,255,0.12)", opacity: updatingOnline ? 0.55 : 1 }}
            >
              <Text style={{ color: "#fff", fontFamily: "Manrope_700Bold", fontSize: 12.5 }}>
                {updatingOnline ? "Atualizando..." : state.rider.online ? "Ficar offline" : "Ficar online"}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>

        <View className="mt-8 flex-row items-center justify-between">
          <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 25 }}>
            Resumo do dia
          </Text>
          <Pressable onPress={() => navigation.navigate("Tabs")}>
            <Text style={{ color: theme.accent, fontFamily: "Manrope_700Bold", fontSize: 13.5 }}>
              Ver mais
            </Text>
          </Pressable>
        </View>

        <View className="mt-4 flex-row gap-3">
          <CardResumo
            label="Ganhos do dia"
            value={formatCurrency(state.earnings.today)}
            icon="cash-fast"
          />
          <CardResumo label="Entregas feitas" value={String(completedCount)} icon="shopping-outline" />
        </View>
        <View className="mt-3 flex-row gap-3">
          <CardResumo label="Em andamento" value={String(inProgressCount)} icon="motorbike" />
          <CardResumo label="Avaliacao" value={`${state.rider.successRate}%`} icon="star" />
        </View>

        {nextDelivery ? (
          <>
            <Text
              className="mt-8"
              style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 25 }}
            >
              Proxima entrega
            </Text>
            <View
              className="mt-4 rounded-[30px] p-5"
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
              <Text
                style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 24 }}
              >
                {nextDelivery.number}
              </Text>
              <Text
                className="mt-1"
                style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 14 }}
              >
                Entrega as {nextDelivery.eta}
              </Text>
              <Text
                className="mt-5"
                style={{ color: theme.text, fontFamily: "Manrope_700Bold", fontSize: 15.5 }}
              >
                {nextDelivery.address}
              </Text>
              <Text
                className="mt-2"
                style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 14 }}
              >
                {nextDelivery.neighborhood} • {nextDelivery.city}
              </Text>
              <View className="mt-6 flex-row items-center justify-between">
                <View className="rounded-full px-4 py-2" style={{ backgroundColor: `${theme.accentBright}44` }}>
                  <Text style={{ color: theme.accent, fontFamily: "Manrope_800ExtraBold", fontSize: 12.5 }}>
                    {nextDelivery.distanceKm.toFixed(1)} km de distancia
                  </Text>
                </View>
                <Pressable
                  onPress={() => navigation.navigate("DeliveryMap", { deliveryId: nextDelivery.id })}
                  className="flex-row items-center gap-2 rounded-full px-5 py-3"
                  style={{ backgroundColor: theme.primary }}
                >
                  <Text style={{ color: "#fff", fontFamily: "Manrope_700Bold", fontSize: 14 }}>
                    Ver rota
                  </Text>
                  <Feather name="arrow-right" size={16} color="#fff" />
                </Pressable>
              </View>
            </View>
          </>
        ) : null}

        <Pressable
          onPress={() => navigation.navigate("Tabs")}
          className="mt-5 flex-row items-center justify-center gap-2 rounded-full py-4"
          style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.primary }}
        >
          <MaterialCommunityIcons name="bag-personal-outline" size={18} color={theme.primary} />
          <Text style={{ color: theme.primary, fontFamily: "Manrope_800ExtraBold", fontSize: 16 }}>
            Ver todas as entregas
          </Text>
        </Pressable>
      </FadeInView>
    </ScreenContainer>
  );
}
