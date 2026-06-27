import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import { Text, View, type ViewStyle } from "react-native";
import { useTenantTheme } from "../hooks/useTenantTheme";
import { riderInitials, withCacheBuster } from "../lib/avatar";

type Props = {
  uri?: string | null;
  name: string;
  size?: number;
  style?: ViewStyle;
};

export function RiderAvatar({ uri, name, size = 48, style }: Props) {
  const theme = useTenantTheme();
  const [failed, setFailed] = useState(false);
  const cleanUri = uri?.trim() ?? "";
  const displayUri = useMemo(
    () => (cleanUri && !failed ? withCacheBuster(cleanUri) : ""),
    [cleanUri, failed],
  );

  useEffect(() => {
    setFailed(false);
  }, [cleanUri]);

  if (displayUri) {
    return (
      <Image
        source={{ uri: displayUri }}
        cachePolicy="none"
        recyclingKey={cleanUri}
        onError={() => setFailed(true)}
        style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${theme.primary}18`,
          borderWidth: 1,
          borderColor: `${theme.primary}33`,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Text
        style={{
          color: theme.primary,
          fontFamily: "Manrope_800ExtraBold",
          fontSize: Math.max(12, size * 0.34),
        }}
      >
        {riderInitials(name)}
      </Text>
    </View>
  );
}
