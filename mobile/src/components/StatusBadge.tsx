import { Text, View } from "react-native";
import { useAppTheme } from "../styles/theme";

type Props = {
  label: string;
  tone?: "green" | "gold" | "gray";
};

export function StatusBadge({ label, tone = "green" }: Props) {
  const theme = useAppTheme();
  const styles = {
    green: { bg: "#ECFDF3", color: theme.success },
    gold: { bg: theme.backgroundSoft, color: theme.primary },
    gray: { bg: theme.backgroundMuted, color: theme.textMuted },
  }[tone];

  return (
    <View
      className="self-start rounded-full px-3.5 py-1.5"
      style={{ backgroundColor: styles.bg, borderWidth: 1, borderColor: `${styles.color}18` }}
    >
      <Text style={{ color: styles.color, fontFamily: "Manrope_700Bold", fontSize: 11.5 }}>{label}</Text>
    </View>
  );
}
