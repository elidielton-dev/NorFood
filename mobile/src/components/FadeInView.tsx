import { PropsWithChildren, useEffect, useRef } from "react";
import { Animated } from "react-native";

export function FadeInView({ children }: PropsWithChildren) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start();
  }, [opacity, translate]);

  return <Animated.View style={{ opacity, transform: [{ translateY: translate }] }}>{children}</Animated.View>;
}
