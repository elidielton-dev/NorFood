import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { DeliveryOrder } from "../types";
import { useAppTheme } from "../styles/theme";
import { StatusBadge } from "./StatusBadge";
import { formatCurrency } from "../utils/format";

type Props = {
  delivery: DeliveryOrder;
  primaryLabel: string;
  onPrimaryPress: () => void;
  onSecondaryPress?: () => void;
};

export function CardPedido({ delivery, primaryLabel, onPrimaryPress, onSecondaryPress }: Props) {
  const theme = useAppTheme();

  return (
    <View
      className="mb-4 rounded-[30px] p-5"
      style={{
        backgroundColor: theme.backgroundElevated,
        borderColor: theme.border,
        borderWidth: 1,
        shadowColor: theme.shadow,
        shadowOpacity: 0.1,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      }}
    >
      <View className="flex-row items-start justify-between">
        <View>
          <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 23 }}>{delivery.number}</Text>
          <Text className="mt-1" style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 14 }}>
            Entrega até {delivery.eta}
          </Text>
        </View>
        <StatusBadge
          label={delivery.badgeLabel}
          tone={delivery.status === "available" ? "green" : delivery.status === "in_progress" ? "gold" : "gray"}
        />
      </View>

      <View className="mt-5 gap-2.5">
        <View className="flex-row items-center gap-2">
          <Feather name="map-pin" size={15} color={theme.accent} />
          <Text style={{ color: theme.text, fontFamily: "Manrope_600SemiBold", fontSize: 15 }}>{delivery.address}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Feather name="navigation" size={15} color={theme.accent} />
          <Text style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 14 }}>
            {delivery.neighborhood} • {delivery.city}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Feather name="clock" size={15} color={theme.accent} />
          <Text style={{ color: theme.accent, fontFamily: "Manrope_700Bold", fontSize: 14 }}>
            {delivery.distanceKm.toFixed(1)} km de distância
          </Text>
        </View>
      </View>

      <View className="mt-5 flex-row items-end justify-between">
        <View>
          <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 28 }}>{formatCurrency(delivery.fee)}</Text>
          <Text style={{ color: theme.textSoft, fontFamily: "Manrope_500Medium", fontSize: 12 }}>Taxa de entrega</Text>
        </View>
        {onSecondaryPress ? (
          <Pressable onPress={onSecondaryPress}>
            <Text style={{ color: theme.accent, fontFamily: "Manrope_700Bold", fontSize: 14 }}>Ver detalhes</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={onPrimaryPress}
        className="mt-5 flex-row items-center justify-center gap-2 rounded-full py-[15px]"
        style={{ backgroundColor: theme.primary }}
      >
        <MaterialCommunityIcons name="check-circle-outline" size={18} color="#fff" />
        <Text style={{ color: "#fff", fontFamily: "Manrope_700Bold", fontSize: 16 }}>{primaryLabel}</Text>
      </Pressable>
    </View>
  );
}
