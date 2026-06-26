import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAppData } from "../context/AppDataContext";
import { AppLoader } from "../components/AppLoader";
import { useAppTheme } from "../styles/theme";
import { BottomNavigation } from "../components/BottomNavigation";
import { LoginScreen } from "../screens/LoginScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { DeliveriesScreen } from "../screens/DeliveriesScreen";
import { EarningsScreen } from "../screens/EarningsScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { DeliveryDetailsScreen } from "../screens/DeliveryDetailsScreen";
import { MapScreen } from "../screens/MapScreen";
import { OccurrencesScreen } from "../screens/OccurrencesScreen";

export type RootStackParamList = {
  Tabs: undefined;
  DeliveryDetails: { deliveryId: string };
  DeliveryMap: { deliveryId: string };
  Occurrences: { deliveryId?: string } | undefined;
};

export type RootTabParamList = {
  Início: undefined;
  Entregas: undefined;
  Ganhos: undefined;
  Perfil: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

function TabsNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomNavigation {...props} />}
    >
      <Tab.Screen name="Início" component={DashboardScreen} />
      <Tab.Screen name="Entregas" component={DeliveriesScreen} />
      <Tab.Screen name="Ganhos" component={EarningsScreen} />
      <Tab.Screen name="Perfil" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { state, ready } = useAppData();
  const theme = useAppTheme();

  if (!ready) {
    return <AppLoader theme={theme} />;
  }

  if (!state.loggedIn) {
    return <LoginScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
      <Stack.Screen name="Tabs" component={TabsNavigator} />
      <Stack.Screen name="DeliveryDetails" component={DeliveryDetailsScreen} />
      <Stack.Screen name="DeliveryMap" component={MapScreen} />
      <Stack.Screen name="Occurrences" component={OccurrencesScreen} />
    </Stack.Navigator>
  );
}
