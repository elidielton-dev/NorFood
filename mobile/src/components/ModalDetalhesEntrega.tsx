import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { DeliveryOrder } from "../types";
import { useAppTheme } from "../styles/theme";
import { StatusBadge } from "./StatusBadge";
import { formatCurrency } from "../utils/format";

type Props = {
  visible: boolean;
  delivery?: DeliveryOrder;
  onClose: () => void;
};

export function ModalDetalhesEntrega({ visible, delivery, onClose }: Props) {
  const theme = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/35">
        <View className="max-h-[85%] rounded-t-[32px] px-5 pb-5 pt-4" style={{ backgroundColor: theme.background }}>
          <View className="mb-4 h-1.5 w-16 self-center rounded-full" style={{ backgroundColor: theme.borderStrong }} />
          {delivery ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View className="flex-row items-start justify-between">
                <View className="pr-3">
                  <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 25 }}>{delivery.number}</Text>
                  <Text className="mt-1" style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 14 }}>
                    {delivery.customer}
                  </Text>
                </View>
                <StatusBadge label={delivery.badgeLabel} tone={delivery.status === "available" ? "green" : delivery.status === "completed" ? "gray" : "gold"} />
              </View>
              <View className="mt-5 gap-3">
                {[
                  ["Endereco", `${delivery.address} • ${delivery.neighborhood}`],
                  ["Referencia", delivery.reference],
                  ["Taxa", formatCurrency(delivery.fee)],
                  ["Distancia", `${delivery.distanceKm.toFixed(1)} km`],
                  ["Itens", delivery.items.join("\n")],
                ].map(([label, value]) => (
                  <View key={label} className="rounded-[24px] p-4" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border }}>
                    <Text style={{ color: theme.textSoft, fontFamily: "Manrope_600SemiBold", fontSize: 11.5 }}>{label}</Text>
                    <Text className="mt-2" style={{ color: theme.text, fontFamily: "Manrope_600SemiBold", fontSize: 14.5, lineHeight: 22 }}>
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
          <Pressable onPress={onClose} className="mt-5 rounded-full py-[15px]" style={{ backgroundColor: theme.primary }}>
            <Text className="text-center" style={{ color: "#fff", fontFamily: "Manrope_700Bold", fontSize: 15.5 }}>
              Fechar
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
