import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path, Polyline } from "react-native-svg";
import { CardGanho } from "../components/CardGanho";
import { HeaderMobile } from "../components/HeaderMobile";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppData } from "../context/AppDataContext";
import { useAppTheme } from "../styles/theme";
import { formatCurrency } from "../utils/format";

type Range = "Diario" | "Semanal" | "Mensal";

export function EarningsScreen() {
  const theme = useAppTheme();
  const { state } = useAppData();
  const [range, setRange] = useState<Range>("Diario");
  const total = range === "Diario" ? state.earnings.today : range === "Semanal" ? state.earnings.week : state.earnings.month;

  return (
    <ScreenContainer>
      <HeaderMobile title="Meus ganhos" subtitle="Acompanhe repasses, bonus e evolucao." onLeftPress={() => undefined} leftIcon="arrow-left" rightIcon="calendar" />

      <View className="flex-row rounded-full p-1.5" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border }}>
        {(["Diario", "Semanal", "Mensal"] as Range[]).map((item) => {
          const active = item === range;
          return (
            <Pressable key={item} onPress={() => setRange(item)} className="flex-1 rounded-full py-3" style={{ backgroundColor: active ? theme.primary : "transparent" }}>
              <Text className="text-center" style={{ color: active ? "#fff" : theme.textMuted, fontFamily: active ? "Manrope_800ExtraBold" : "Manrope_600SemiBold" }}>
                {item}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="mt-6 rounded-[30px] p-6" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border, shadowColor: theme.shadow, shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 }}>
        <Text className="text-center" style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 34 }}>
          {formatCurrency(total)}
        </Text>
        <Text className="mt-1 text-center" style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 14 }}>
          Ganhos de {range === "Diario" ? "hoje" : range.toLowerCase()}
        </Text>
        <Text className="mt-4 text-center" style={{ color: theme.text, fontFamily: "Manrope_700Bold", fontSize: 15 }}>
          {state.deliveries.filter((item) => item.status === "completed").length} entregas realizadas
        </Text>
      </View>

      <View className="mt-4 flex-row gap-3">
        <CardGanho label="Taxas de entrega" value={formatCurrency(state.earnings.fees)} />
        <CardGanho label="Bonificacoes" value={formatCurrency(state.earnings.bonus)} />
      </View>

      <View className="mt-4 rounded-[30px] p-5" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border }}>
        {[
          ["Taxas de entrega", state.earnings.fees],
          ["Distancia percorrida", state.earnings.distance],
          ["Adicionais", state.earnings.additions],
          ["Bonificacoes", state.earnings.bonus],
          ["Descontos", state.earnings.discounts],
        ].map(([label, value], index, list) => (
          <View key={String(label)} className="flex-row items-center justify-between py-3" style={{ borderBottomWidth: index === list.length - 1 ? 0 : 1, borderBottomColor: theme.border }}>
            <Text style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium" }}>{label}</Text>
            <Text style={{ color: theme.text, fontFamily: "Manrope_700Bold" }}>
              {typeof value === "number" && label === "Distancia percorrida" ? `${value.toFixed(1)} km` : formatCurrency(Number(value))}
            </Text>
          </View>
        ))}
      </View>

      <View className="mt-4 rounded-[30px] p-5" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border }}>
        <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 19 }}>Evolucao dos ganhos</Text>
        <Svg width="100%" height="180" viewBox="0 0 300 180">
          <Path d="M10 150 H290" stroke={theme.borderStrong} strokeWidth="1" />
          <Path d="M10 25 V150" stroke={theme.borderStrong} strokeWidth="1" />
          <Polyline
            points="10,130 55,92 100,110 145,78 190,66 235,30 280,84"
            fill="none"
            stroke={theme.accent}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M10 130 C28 118, 42 98, 55 92 C76 84, 88 116, 100 110 C118 101, 131 82, 145 78 C161 73, 173 70, 190 66 C210 60, 224 34, 235 30 C252 26, 264 80, 280 84"
            fill="none"
            stroke={`${theme.accent}44`}
            strokeWidth="10"
            strokeLinecap="round"
          />
        </Svg>
      </View>

      <Pressable className="mt-5 rounded-full py-4" style={{ backgroundColor: theme.primary }}>
        <Text className="text-center" style={{ color: theme.accentBright, fontFamily: "Manrope_800ExtraBold", fontSize: 16 }}>
          Solicitar repasse
        </Text>
      </Pressable>
    </ScreenContainer>
  );
}
