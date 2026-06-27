import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { View } from "react-native";
import { useAppTheme } from "../styles/theme";

export function AppBackground() {
  const theme = useAppTheme();

  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      <Svg width="100%" height="100%" viewBox="0 0 400 900">
        <Defs>
          <SvgGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={theme.background} />
            <Stop offset="55%" stopColor={theme.backgroundMuted} />
            <Stop offset="100%" stopColor={theme.background} />
          </SvgGradient>
          <SvgGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={theme.primary} stopOpacity={0.18} />
            <Stop offset="100%" stopColor={theme.primaryDeep} stopOpacity={0.04} />
          </SvgGradient>
        </Defs>
        <Path d="M0 0 H400 V900 H0 Z" fill="url(#bg)" />
        <Circle cx="340" cy="90" r="120" fill="url(#glow)" />
        <Circle cx="60" cy="780" r="140" fill={theme.accentSoft} opacity={0.35} />
        <Path
          d="M-10 0 C100 40, 180 20, 280 68 C330 92, 380 78, 420 120"
          stroke={theme.primary}
          strokeOpacity={0.12}
          strokeWidth={16}
          fill="none"
        />
        <Path
          d="M40 840 C110 760, 210 760, 320 820 C355 840, 385 850, 420 848"
          stroke={theme.primarySoft}
          strokeOpacity={0.1}
          strokeWidth={18}
          fill="none"
        />
        {[
          [48, 120, 3],
          [88, 160, 2.5],
          [320, 140, 3],
          [360, 200, 2.5],
          [72, 720, 3],
          [300, 760, 2.5],
          [340, 820, 3],
        ].map(([x, y, r], index) => (
          <Circle
            key={`dot-${index}`}
            cx={x}
            cy={y}
            r={r}
            fill={theme.primary}
            opacity={0.14}
          />
        ))}
      </Svg>
    </View>
  );
}
