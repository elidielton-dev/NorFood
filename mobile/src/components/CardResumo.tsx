import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useAppTheme } from "../styles/theme";

type Props = {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

export function CardResumo({ label, value, icon }: Props) {
  const theme = useAppTheme();

  return (
    <View
      className="flex-1 rounded-[24px] p-4"
      style={{
        backgroundColor: theme.backgroundElevated,
        borderColor: theme.border,
        borderWidth: 1,
        shadowColor: theme.shadow,
        shadowOpacity: 0.1,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 2,
      }}
    >
      <Text className="text-[11px]" style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold" }}>
        {label}
      </Text>
      <Text className="mt-2 text-[28px]" style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold" }}>
        {value}
      </Text>
      <View className="mt-3 self-end rounded-full p-2.5" style={{ backgroundColor: `${theme.accentBright}22` }}>
        <MaterialCommunityIcons name={icon} size={18} color={theme.accent} />
      </View>
    </View>
  );
}
