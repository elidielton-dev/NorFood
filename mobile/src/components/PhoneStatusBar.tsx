import { Feather, Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useAppTheme } from "../styles/theme";

type Props = {
  inverse?: boolean;
};

export function PhoneStatusBar({ inverse = false }: Props) {
  const theme = useAppTheme();
  const color = inverse ? "#FFFFFF" : theme.text;

  return (
    <View className="mb-5 mt-1 flex-row items-center justify-between px-1">
      <Text style={{ color, fontFamily: "Manrope_800ExtraBold", fontSize: 15 }}>9:41</Text>
      <View className="flex-row items-center gap-2">
        <Feather name="bar-chart-2" size={14} color={color} />
        <Ionicons name="wifi" size={14} color={color} />
        <Ionicons name="battery-full" size={18} color={color} />
      </View>
    </View>
  );
}
