import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
import { useAppTheme } from "../styles/theme";

type Props = {
  size?: number;
};

export function BrandIllustration({ size = 120 }: Props) {
  const theme = useAppTheme();

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Ellipse cx="58" cy="110" rx="36" ry="8" fill={theme.borderStrong} opacity={0.45} />
      <Path
        d="M24 72 C24 58 34 48 48 48 H78 C92 48 102 58 102 72 V88 C102 98 94 106 84 106 H42 C32 106 24 98 24 88 Z"
        fill={theme.primary}
      />
      <Path
        d="M30 76 C30 66 38 58 50 58 H76 C88 58 96 66 96 76 V84 C96 92 90 98 82 98 H44 C36 98 30 92 30 84 Z"
        fill={theme.primaryDeep}
        opacity={0.55}
      />
      <Circle cx="38" cy="98" r="10" fill={theme.text} />
      <Circle cx="88" cy="98" r="10" fill={theme.text} />
      <Circle cx="38" cy="98" r="4.5" fill={theme.backgroundElevated} />
      <Circle cx="88" cy="98" r="4.5" fill={theme.backgroundElevated} />
      <Rect x="52" y="34" width="22" height="18" rx="6" fill={theme.primarySoft} />
      <Path
        d="M58 28 C62 22 70 22 74 28 L78 34 H54 Z"
        fill={theme.primaryDeep}
      />
      <Path
        d="M66 52 H84 C90 52 94 56 94 62 V70 H62 V58 C62 54 64 52 66 52 Z"
        fill={theme.accentSoft}
      />
      <Path
        d="M18 58 H42 C46 58 48 60 48 64 V74 H16 V62 C16 59 17 58 18 58 Z"
        fill={theme.backgroundElevated}
        stroke={theme.primary}
        strokeWidth={2}
      />
      <Path d="M20 62 H30" stroke={theme.primary} strokeWidth={2.5} strokeLinecap="round" />
      <Path d="M20 68 H26" stroke={theme.primary} strokeWidth={2.5} strokeLinecap="round" />
      <Circle cx="96" cy="36" r="14" fill={theme.backgroundElevated} />
      <Path
        d="M90 36 H102 M96 30 V42"
        stroke={theme.primary}
        strokeWidth={3}
        strokeLinecap="round"
      />
    </Svg>
  );
}
