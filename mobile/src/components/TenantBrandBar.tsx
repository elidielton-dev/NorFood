import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { useTenantTheme } from "../hooks/useTenantTheme";

type Props = {
  onSwitchPress?: () => void;
};

export function TenantBrandBar({ onSwitchPress }: Props) {
  const theme = useTenantTheme();
  const { state } = useAppData();
  const tenant = state.tenant;

  if (!tenant) return null;

  return (
    <View
      className="mb-4 flex-row items-center justify-between rounded-[24px] px-4 py-3"
      style={{
        backgroundColor: theme.backgroundElevated,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <View className="flex-row items-center gap-3">
        {tenant.logoUrl ? (
          <Image source={tenant.logoUrl} style={{ width: 40, height: 40, borderRadius: 12 }} contentFit="contain" />
        ) : (
          <View
            className="h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${theme.primary}22` }}
          >
            <Text style={{ color: theme.primary, fontFamily: "Manrope_800ExtraBold", fontSize: 14 }}>
              {tenant.name.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
        <View>
          <Text style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 11 }}>
            Empresa ativa
          </Text>
          <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 16 }}>{tenant.name}</Text>
        </View>
      </View>
      {onSwitchPress && state.availableTenants.length > 1 ? (
        <Pressable
          onPress={onSwitchPress}
          className="flex-row items-center gap-1 rounded-full px-3 py-2"
          style={{ backgroundColor: `${theme.primary}14` }}
        >
          <Feather name="repeat" size={14} color={theme.primary} />
          <Text style={{ color: theme.primary, fontFamily: "Manrope_700Bold", fontSize: 12 }}>Trocar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
