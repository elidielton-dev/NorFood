import { Feather } from "@expo/vector-icons";
import { RiderAvatar } from "./RiderAvatar";
import { Pressable, Text, View } from "react-native";
import { useAppTheme } from "../styles/theme";
import { PhoneStatusBar } from "./PhoneStatusBar";

type Props = {
  greeting?: string;
  title?: string;
  subtitle?: string;
  avatar?: string;
  onLeftPress?: () => void;
  onRightPress?: () => void;
  leftIcon?: keyof typeof Feather.glyphMap;
  rightIcon?: keyof typeof Feather.glyphMap;
  inverse?: boolean;
  rightBadge?: number;
};

export function HeaderMobile({
  greeting,
  title,
  subtitle,
  avatar,
  onLeftPress,
  onRightPress,
  leftIcon = "menu",
  rightIcon = "bell",
  inverse = false,
  rightBadge = 0,
}: Props) {
  const theme = useAppTheme();
  const titleColor = inverse ? "#FFFFFF" : theme.text;
  const subtitleColor = inverse ? "rgba(255,255,255,0.78)" : theme.textMuted;
  const buttonBg = inverse ? "rgba(255,255,255,0.08)" : theme.backgroundElevated;
  const buttonBorder = inverse ? "rgba(255,255,255,0.12)" : theme.border;
  const iconColor = inverse ? "#FFFFFF" : theme.primary;

  return (
    <View>
      <PhoneStatusBar inverse={inverse} />
      <View className="mb-5 mt-1 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          {onLeftPress ? (
            <Pressable
              onPress={onLeftPress}
              className="h-11 w-11 items-center justify-center rounded-full"
              style={{
                backgroundColor: buttonBg,
                borderWidth: 1,
                borderColor: buttonBorder,
                shadowColor: inverse ? "transparent" : theme.shadow,
                shadowOpacity: inverse ? 0 : 0.04,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 3 },
                elevation: inverse ? 0 : 1,
              }}
            >
              <Feather name={leftIcon} size={20} color={iconColor} />
            </Pressable>
          ) : avatar !== undefined ? (
            <RiderAvatar uri={avatar} name={title ?? greeting ?? "Entregador"} size={48} />
          ) : null}
          <View className="max-w-[220px]">
            {greeting ? (
              <Text style={{ color: titleColor, fontFamily: "Manrope_800ExtraBold", fontSize: 27, lineHeight: 31 }}>{greeting}</Text>
            ) : null}
            {title ? <Text style={{ color: titleColor, fontFamily: "Manrope_800ExtraBold", fontSize: 23, lineHeight: 27 }}>{title}</Text> : null}
            {subtitle ? (
              <Text className="mt-1" style={{ color: subtitleColor, fontFamily: "Manrope_500Medium", fontSize: 14, lineHeight: 19 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        <Pressable
          onPress={onRightPress}
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{
            backgroundColor: buttonBg,
            borderWidth: 1,
            borderColor: buttonBorder,
            shadowColor: inverse ? "transparent" : theme.shadow,
            shadowOpacity: inverse ? 0 : 0.04,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: inverse ? 0 : 1,
          }}
        >
          <Feather name={rightIcon} size={20} color={iconColor} />
          {rightBadge > 0 ? (
            <View
              className="absolute -right-1 -top-1 h-5 min-w-[20px] items-center justify-center rounded-full px-1"
              style={{ backgroundColor: inverse ? "#FFFFFF" : theme.backgroundElevated }}
            >
              <Text
                style={{
                  color: inverse ? theme.primary : theme.primary,
                  fontFamily: "Manrope_800ExtraBold",
                  fontSize: 10,
                }}
              >
                {rightBadge > 9 ? "9+" : rightBadge}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}
