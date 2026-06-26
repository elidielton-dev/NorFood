import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { HeaderMobile } from "../components/HeaderMobile";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppData } from "../context/AppDataContext";
import { RootStackParamList } from "../navigation/AppNavigator";
import { useAppTheme } from "../styles/theme";
import { IncidentType } from "../types";

const options: IncidentType[] = [
  "Cliente nao atende",
  "Endereco incorreto",
  "Pedido danificado",
  "Transito",
  "Chuva",
  "Outro",
];

export function OccurrencesScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Occurrences">>();
  const { state, reportIncident, getDelivery } = useAppData();
  const [selected, setSelected] = useState<IncidentType>("Cliente nao atende");
  const [note, setNote] = useState("");
  const delivery = route.params?.deliveryId ? getDelivery(route.params.deliveryId) : state.deliveries.find((item) => item.status === "in_progress");

  const history = useMemo(
    () => state.incidents.filter((item) => !route.params?.deliveryId || item.deliveryId === route.params.deliveryId).slice(0, 6),
    [route.params?.deliveryId, state.incidents],
  );

  return (
    <ScreenContainer>
      <HeaderMobile title="Ocorrencias" subtitle="Registre problemas da rota e mantenha o historico organizado." onLeftPress={() => navigation.goBack()} leftIcon="arrow-left" rightIcon="help-circle" />

      <View className="rounded-[28px] p-5" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border }}>
        <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 18 }}>
          {delivery ? `Pedido ${delivery.number}` : "Selecione uma entrega em andamento"}
        </Text>
        <Text className="mt-2" style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium" }}>
          {delivery ? `${delivery.customer} • ${delivery.address}` : "Abra esta tela a partir do mapa ou dos detalhes da entrega."}
        </Text>
        <View className="mt-4 flex-row flex-wrap gap-2">
          {options.map((item) => {
            const active = item === selected;
            return (
              <Pressable
                key={item}
                onPress={() => setSelected(item)}
                className="rounded-full px-4 py-3"
                style={{ backgroundColor: active ? theme.primary : theme.backgroundMuted, borderWidth: 1, borderColor: active ? theme.primary : theme.border }}
              >
                <Text style={{ color: active ? "#fff" : theme.text, fontFamily: "Manrope_700Bold", fontSize: 13 }}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Descreva o que aconteceu"
          placeholderTextColor={theme.textSoft}
          className="mt-4 rounded-[24px] p-4"
          style={{ minHeight: 120, backgroundColor: theme.background, color: theme.text, borderWidth: 1, borderColor: theme.border }}
        />
        <Pressable
          disabled={!delivery}
          onPress={async () => {
            if (!delivery) return;
            await reportIncident(delivery.id, selected, note);
            setNote("");
          }}
          className="mt-4 rounded-full py-4"
          style={{ backgroundColor: delivery ? theme.accentBright : theme.border }}
        >
          <Text className="text-center" style={{ color: delivery ? theme.primary : theme.textSoft, fontFamily: "Manrope_800ExtraBold", fontSize: 16 }}>
            Salvar ocorrencia
          </Text>
        </Pressable>
      </View>

      <View className="mt-4 rounded-[28px] p-5" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border }}>
        <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 18 }}>Historico recente</Text>
        <View className="mt-4 gap-3">
          {history.length ? (
            history.map((item) => (
              <View key={item.id} className="rounded-[22px] p-4" style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border }}>
                <Text style={{ color: theme.text, fontFamily: "Manrope_700Bold" }}>{item.type}</Text>
                <Text className="mt-1" style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium" }}>
                  {item.note || "Sem observacoes adicionais."}
                </Text>
              </View>
            ))
          ) : (
            <Text style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium" }}>Nenhuma ocorrencia registrada ate agora.</Text>
          )}
        </View>
      </View>
    </ScreenContainer>
  );
}
