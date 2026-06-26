import { Animated, DimensionValue } from "react-native";
import { useEffect, useRef } from "react";
import { useAppTheme } from "../styles/theme";

type Props = {
  height: number;
  width?: DimensionValue;
  rounded?: number;
};

export function SkeletonBlock({ height, width = "100%", rounded = 18 }: Props) {
  const theme = useAppTheme();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
  }, [opacity]);

  return (
    <Animated.View
      style={{
        height,
        width,
        borderRadius: rounded,
        backgroundColor: theme.borderStrong,
        opacity,
      }}
    />
  );
}
