import Svg, { Circle, Path } from "react-native-svg";
import { View } from "react-native";
import { useAppTheme } from "../styles/theme";

export function MapIllustration() {
  const theme = useAppTheme();

  return (
    <View className="overflow-hidden rounded-[32px]" style={{ backgroundColor: theme.map, height: 300 }}>
      <Svg width="100%" height="100%" viewBox="0 0 320 300">
        <Path d="M10 55 C100 20, 140 140, 260 80" stroke={`${theme.borderStrong}`} strokeWidth="2" fill="none" opacity="0.58" />
        <Path d="M20 170 C120 120, 180 220, 310 160" stroke={`${theme.borderStrong}`} strokeWidth="2" fill="none" opacity="0.54" />
        <Path d="M80 20 L270 220" stroke={`${theme.borderStrong}`} strokeWidth="1.2" opacity="0.22" />
        <Path d="M50 250 L300 60" stroke={`${theme.borderStrong}`} strokeWidth="1.2" opacity="0.22" />
        <Path d="M25 102 C72 88, 120 96, 172 112" stroke={`${theme.borderStrong}`} strokeWidth="1.1" opacity="0.18" />
        <Path d="M124 32 C148 70, 174 100, 220 144" stroke={`${theme.borderStrong}`} strokeWidth="1.1" opacity="0.18" />
        <Path d="M72 190 C90 160, 115 145, 158 132 C200 120, 228 160, 260 224" stroke={theme.route} strokeWidth="6" fill="none" strokeLinecap="round" />
        <Path d="M72 190 C90 160, 115 145, 158 132 C200 120, 228 160, 260 224" stroke={`${theme.accentBright}55`} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeDasharray="1 11" />
        <Circle cx="72" cy="190" r="15" fill={theme.primary} />
        <Circle cx="72" cy="190" r="7" fill={theme.accentBright} />
        <Circle cx="260" cy="224" r="15" fill={theme.primary} />
        <Circle cx="260" cy="224" r="7" fill="#fff" />
      </Svg>
    </View>
  );
}
