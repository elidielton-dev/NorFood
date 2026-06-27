import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { ScreenContainer } from "../components/ScreenContainer";
import { useTenantTheme } from "../hooks/useTenantTheme";

export function TenantSelectScreen() {
  const theme = useTenantTheme();
  const { state, selectTenant } = useAppData();

  return (
    <ScreenContainer scroll={false} contentClassName="justify-center">
      <Text
        className="text-center"
        style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 28, lineHeight: 34 }}
      >
        Escolha a empresa
      </Text>
      <Text
        className="mt-2 text-center"
        style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 15, lineHeight: 22 }}
      >
        Voce tem acesso a mais de um restaurante. Selecione onde vai trabalhar hoje.
      </Text>

      <View className="mt-8 gap-3">
        {state.availableTenants.map((tenant) => (
          <Pressable
            key={tenant.id}
            onPress={() => void selectTenant(tenant.id)}
            className="flex-row items-center gap-4 rounded-[28px] p-4"
            style={{
              backgroundColor: theme.backgroundElevated,
              borderWidth: 1,
              borderColor: theme.border,
              shadowColor: theme.shadow,
              shadowOpacity: 0.08,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 2,
            }}
          >
            {tenant.logoUrl ? (
              <Image source={tenant.logoUrl} style={{ width: 56, height: 56, borderRadius: 16 }} contentFit="contain" />
            ) : (
              <View
                className="h-14 w-14 items-center justify-center rounded-2xl"
                style={{ backgroundColor: `${tenant.primaryColor}18` }}
              >
                <Text style={{ color: tenant.primaryColor, fontFamily: "Manrope_800ExtraBold", fontSize: 18 }}>
                  {tenant.name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <View className="flex-1">
              <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 18 }}>{tenant.name}</Text>
              <Text style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 13 }}>
                Papel: {tenant.role}
              </Text>
            </View>
            <View className="h-3 w-3 rounded-full" style={{ backgroundColor: tenant.primaryColor }} />
          </Pressable>
        ))}
      </View>
    </ScreenContainer>
  );
}
