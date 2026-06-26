import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { DeliveryOrder, DeliveryStep } from "../types";
import { useAppTheme } from "../styles/theme";

const order: DeliveryStep[] = ["confirmed", "preparing", "on_route", "arrived", "delivered"];

type Props = {
  delivery: DeliveryOrder;
};

export function TimelineEntrega({ delivery }: Props) {
  const theme = useAppTheme();
  const activeIndex = order.indexOf(delivery.currentStep);

  return (
    <View className="rounded-[30px] px-5 pb-2 pt-5" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border }}>
      {delivery.timeline.map((item, index) => {
        const complete = index <= activeIndex;
        const current = index === activeIndex;
        const pending = index > activeIndex;

        return (
          <View key={item.step} className="flex-row">
            <View className="mr-4 items-center">
              <View
                className="h-11 w-11 items-center justify-center rounded-full"
                style={{
                  backgroundColor: complete ? (current ? theme.accentBright : theme.primarySoft) : theme.backgroundSoft,
                  borderWidth: pending ? 1 : 0,
                  borderColor: pending ? theme.borderStrong : "transparent",
                }}
              >
                {complete ? (
                  current ? (
                    <Text style={{ color: "#fff", fontFamily: "Manrope_800ExtraBold", fontSize: 16 }}>{index + 1}</Text>
                  ) : (
                    <Feather name="check" size={18} color="#fff" />
                  )
                ) : (
                  <MaterialCommunityIcons name="circle-outline" size={18} color={theme.textSoft} />
                )}
              </View>
              {index < delivery.timeline.length - 1 ? (
                <View style={{ width: 2, flex: 1, backgroundColor: complete ? theme.primarySoft : theme.border, marginVertical: 8 }} />
              ) : null}
            </View>
            <View className="flex-1 pb-6">
              <View className="flex-row items-center justify-between">
                <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 16, maxWidth: "72%" }}>{item.title}</Text>
                <Text style={{ color: theme.textSoft, fontFamily: "Manrope_600SemiBold", fontSize: 12.5 }}>{item.time}</Text>
              </View>
              <Text className="mt-2" style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 13.5, lineHeight: 20 }}>
                {item.description}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
