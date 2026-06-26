import "react-native-gesture-handler";
import "./src/styles/global.css";

import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { useFonts } from "expo-font";
import {
  CormorantGaramond_600SemiBold,
  CormorantGaramond_700Bold,
} from "@expo-google-fonts/cormorant-garamond";
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import { AppDataProvider } from "./src/context/AppDataContext";
import { LocationProvider } from "./src/location/LocationProvider";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { darkTheme, lightTheme, navigationDarkTheme, navigationLightTheme } from "./src/styles/theme";
import { AppLoader } from "./src/components/AppLoader";

export default function App() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const [fontsLoaded] = useFonts({
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!fontsLoaded) {
    return <AppLoader theme={isDark ? darkTheme : lightTheme} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppDataProvider>
          <LocationProvider>
            <NavigationContainer theme={isDark ? navigationDarkTheme : navigationLightTheme}>
              <StatusBar style={isDark ? "light" : "dark"} />
              <AppNavigator />
            </NavigationContainer>
          </LocationProvider>
        </AppDataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
