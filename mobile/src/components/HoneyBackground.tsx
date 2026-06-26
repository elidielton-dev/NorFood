import Svg, { Defs, LinearGradient as SvgGradient, Path, Polygon, Stop } from "react-native-svg";
import { View } from "react-native";
import { useAppTheme } from "../styles/theme";

export function HoneyBackground() {
  const theme = useAppTheme();

  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      <Svg width="100%" height="100%" viewBox="0 0 400 900">
        <Defs>
          <SvgGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={theme.background} />
            <Stop offset="70%" stopColor={theme.backgroundMuted} />
            <Stop offset="100%" stopColor={theme.background} />
          </SvgGradient>
        </Defs>
        <Path d="M0 0 H400 V900 H0 Z" fill="url(#bg)" />
        <Path d="M-10 0 C100 40, 180 20, 280 68 C330 92, 380 78, 420 120" stroke={theme.accentSoft} strokeOpacity={0.18} strokeWidth={18} fill="none" />
        <Path d="M40 840 C110 760, 210 760, 320 820 C355 840, 385 850, 420 848" stroke={theme.accentSoft} strokeOpacity={0.16} strokeWidth={20} fill="none" />
        {[
          [332, 60, 16],
          [356, 80, 16],
          [308, 82, 16],
          [332, 104, 16],
          [356, 126, 16],
          [308, 126, 16],
          [48, 700, 19],
          [76, 720, 19],
          [104, 700, 19],
          [328, 760, 13],
          [350, 777, 13],
          [306, 777, 13],
        ].map(([x, y, size], index) => {
          const points = Array.from({ length: 6 })
            .map((_, pointIndex) => {
              const angle = (Math.PI / 3) * pointIndex;
              return `${x + size * Math.cos(angle)},${y + size * Math.sin(angle)}`;
            })
            .join(" ");

          return (
            <Polygon
              key={`${x}-${y}-${index}`}
              points={points}
              stroke={theme.borderStrong}
              strokeWidth={1}
              fill="transparent"
              opacity={index < 6 ? 0.28 : 0.22}
            />
          );
        })}
      </Svg>
    </View>
  );
}
