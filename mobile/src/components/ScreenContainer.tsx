import { PropsWithChildren } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HoneyBackground } from "./HoneyBackground";
import { useAppTheme } from "../styles/theme";

type Props = PropsWithChildren<{
  scroll?: boolean;
  contentClassName?: string;
}>;

export function ScreenContainer({ children, scroll = true, contentClassName = "" }: Props) {
  const theme = useAppTheme();
  const Wrapper = scroll ? ScrollView : View;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.background }}>
      <HoneyBackground />
      <Wrapper
        showsVerticalScrollIndicator={false}
        contentContainerStyle={scroll ? { paddingBottom: 36 } : { paddingBottom: 18 }}
        className={`flex-1 px-5 ${contentClassName}`}
      >
        {children}
      </Wrapper>
    </SafeAreaView>
  );
}
