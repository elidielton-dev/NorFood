import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTenantTheme } from "../hooks/useTenantTheme";

const icons = {
  Início: "home-variant-outline",
  Entregas: "shopping-outline",
  Ganhos: "wallet-outline",
  Perfil: "account-outline",
} as const;

export function BottomNavigation({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const theme = useTenantTheme();

  return (
    <View
      style={{
        paddingBottom: Math.max(insets.bottom, 14),
        paddingHorizontal: 16,
        paddingTop: 10,
        backgroundColor: theme.primary,
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        shadowColor: theme.shadow,
        shadowOpacity: 0.2,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: -6 },
        elevation: 14,
      }}
    >
      <View className="flex-row items-center justify-around">
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const { options } = descriptors[route.key];
          const label = (options.tabBarLabel ?? options.title ?? route.name) as keyof typeof icons;

          return (
            <Pressable
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              className="items-center justify-center gap-1 px-3 py-2.5"
              style={{ minWidth: 72 }}
            >
              <View
                className="rounded-full px-3 py-1.5"
                style={{ backgroundColor: isFocused ? "rgba(255,255,255,0.18)" : "transparent" }}
              >
                <MaterialCommunityIcons
                  name={icons[label]}
                  size={22}
                  color={isFocused ? "#FFFFFF" : "rgba(255,255,255,0.78)"}
                />
              </View>
              <Text
                style={{
                  color: isFocused ? "#FFFFFF" : "rgba(255,255,255,0.78)",
                  fontFamily: isFocused ? "Manrope_800ExtraBold" : "Manrope_600SemiBold",
                  fontSize: 12,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
