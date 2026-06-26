import { Text, View } from "react-native";
import { useAppTheme } from "../styles/theme";

type Props = {
  label: string;
  value: string;
};

export function CardGanho({ label, value }: Props) {
  const theme = useAppTheme();
  return (
    <View className="flex-1 rounded-[24px] p-4" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border, shadowColor: theme.shadow, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}>
      <Text style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 11.5 }}>{label}</Text>
      <Text className="mt-2 text-[25px]" style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold" }}>
        {value}
      </Text>
    </View>
  );
}
