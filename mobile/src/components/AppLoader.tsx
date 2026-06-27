import { ActivityIndicator, View } from "react-native";
import { AppPalette } from "../styles/theme";

type Props = {
  theme: AppPalette;
};

export function AppLoader({ theme }: Props) {
  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: theme.background }}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>
  );
}
