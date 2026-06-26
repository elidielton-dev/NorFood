import Svg, { Circle, Ellipse, Path } from "react-native-svg";

type Props = {
  size?: number;
};

export function HoneyJarIllustration({ size = 120 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Ellipse cx="58" cy="110" rx="34" ry="8" fill="#E8D9BF" />
      <Path d="M36 35 C36 25 44 18 54 18 H70 C80 18 88 25 88 35 V84 C88 96 78 104 66 104 H58 C46 104 36 96 36 84 Z" fill="#F2C14E" />
      <Path d="M39 44 H85 V79 C85 89 77 96 67 96 H57 C47 96 39 89 39 79 Z" fill="#D8A03D" opacity="0.72" />
      <Path d="M46 22 H78 C82 22 85 25 85 29 V36 H39 V29 C39 25 42 22 46 22 Z" fill="#C89433" />
      <Path d="M59 6 C66 12 66 19 61 28" stroke="#D8A03D" strokeWidth="5" strokeLinecap="round" />
      <Path d="M71 25 C76 23 81 26 82 31 C83 38 74 42 74 42 C74 42 67 37 67 31 C67 27 68 25 71 25 Z" fill="#F2C14E" />
      <Circle cx="95" cy="89" r="12" fill="#FFFFFF" />
      <Circle cx="25" cy="94" r="11" fill="#FFF6EA" />
      <Circle cx="20" cy="86" r="5" fill="#FFFFFF" />
      <Circle cx="29" cy="83" r="5" fill="#FFFFFF" />
      <Circle cx="35" cy="92" r="5" fill="#FFFFFF" />
      <Circle cx="28" cy="101" r="5" fill="#FFFFFF" />
      <Circle cx="18" cy="101" r="5" fill="#FFFFFF" />
      <Circle cx="25" cy="94" r="3.5" fill="#F2C14E" />
      <Path d="M83 30 C90 34 93 41 90 49" stroke="#E1B24B" strokeWidth="4" strokeLinecap="round" />
      <Path d="M90 49 C95 55 92 63 87 68" stroke="#E1B24B" strokeWidth="4" strokeLinecap="round" />
    </Svg>
  );
}
