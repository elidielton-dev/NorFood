import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, Switch, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RiderAvatar } from "../components/RiderAvatar";
import { ScreenContainer } from "../components/ScreenContainer";
import { StatusBadge } from "../components/StatusBadge";
import { TenantBrandBar } from "../components/TenantBrandBar";
import { useAppData } from "../context/AppDataContext";
import { useTenantTheme } from "../hooks/useTenantTheme";
import { SERVICE_CITY_CONFIG, getSupportedNeighborhoods, isSupportedCityCep } from "../lib/city-config";
import { RootStackParamList } from "../navigation/AppNavigator";
import { fetchAddressByCep, formatCep, normalizeCep } from "../lib/viacep";
import { readImageBase64 } from "../lib/read-image-base64";

type PanelKey =
  | "dados"
  | "veiculo"
  | "financeiro"
  | "configuracoes"
  | "ajuda"
  | "suporte";

export function ProfileScreen() {
  const theme = useTenantTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { state, logout, updateProfile, setOnline, uploadAvatar } = useAppData();
  const rider = state.rider;
  const [updatingOnline, setUpdatingOnline] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [panel, setPanel] = useState<PanelKey>("dados");
  const [name, setName] = useState(rider.name);
  const [phone, setPhone] = useState(rider.phone);
  const [email, setEmail] = useState(rider.email);
  const [cep, setCep] = useState(rider.cep ?? "");
  const [address, setAddress] = useState(rider.address ?? "");
  const [neighborhood, setNeighborhood] = useState(rider.neighborhood ?? "");
  const [city, setCity] = useState(rider.city ?? "");
  const [stateCode, setStateCode] = useState(rider.state ?? "");
  const [loadingCep, setLoadingCep] = useState(false);
  const supportedNeighborhoods = getSupportedNeighborhoods();

  const menus = useMemo(
    () => [
      { key: "dados" as const, label: "Meus dados" },
      { key: "veiculo" as const, label: "Veiculo e documentos" },
      { key: "financeiro" as const, label: "Financeiro" },
      { key: "configuracoes" as const, label: "Configuracoes" },
      { key: "ajuda" as const, label: "Ajuda" },
      { key: "suporte" as const, label: "Suporte" },
    ],
    [],
  );

  async function handleToggleOnline(value: boolean) {
    if (updatingOnline) return;
    setUpdatingOnline(true);
    try {
      await setOnline(value);
    } finally {
      setUpdatingOnline(false);
    }
  }

  async function fillAddressFromCep() {
    const normalized = normalizeCep(cep);
    if (normalized.length !== 8) return;

    setLoadingCep(true);
    try {
      const result = await fetchAddressByCep(normalized);
      const supportedCep = isSupportedCityCep(result.cep);
      setCep(formatCep(result.cep));
      setAddress(result.street ? `${result.street}, ${address.split(",")[1]?.trim() ?? ""}`.replace(/, $/, "") : address);
      setNeighborhood(result.neighborhood || neighborhood);
      setCity(supportedCep ? SERVICE_CITY_CONFIG.city : result.city || city);
      setStateCode(supportedCep ? SERVICE_CITY_CONFIG.state : result.state || stateCode);
    } finally {
      setLoadingCep(false);
    }
  }

  async function handlePickAvatar() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permissao necessaria", "Permita acesso a galeria para alterar sua foto.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
      base64: true,
    });

    if (result.canceled || !result.assets[0]?.uri) return;
    const asset = result.assets[0];
    const base64Content = asset.base64?.trim() ? asset.base64 : await readImageBase64(asset.uri);

    try {
      setUploadingAvatar(true);
      await uploadAvatar(asset.uri, base64Content, asset.mimeType ?? "image/jpeg");
      Alert.alert("Foto atualizada", "Sua foto de perfil foi salva com sucesso.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel enviar a foto.";
      Alert.alert("Erro ao enviar foto", message);
    } finally {
      setUploadingAvatar(false);
    }
  }

  return (
    <ScreenContainer>
      <TenantBrandBar onSwitchPress={() => navigation.navigate("TenantSelect")} />
      <View
        className="items-center rounded-[32px] px-6 pb-6 pt-7"
        style={{
          backgroundColor: theme.backgroundElevated,
          borderWidth: 1,
          borderColor: theme.border,
          shadowColor: theme.shadow,
          shadowOpacity: 0.1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 2,
        }}
      >
        <Pressable onPress={() => void handlePickAvatar()} className="relative">
          <RiderAvatar uri={rider.avatar} name={rider.name} size={92} />
          <View
            className="absolute bottom-0 right-0 h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: theme.primary, borderWidth: 2, borderColor: theme.backgroundElevated }}
          >
            {uploadingAvatar ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="camera" size={14} color="#fff" />
            )}
          </View>
        </Pressable>
        <Text className="mt-3" style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 12 }}>
          Toque na foto para alterar
        </Text>
        <Text className="mt-4" style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 28 }}>
          {rider.name}
        </Text>
        <View className="mt-3">
          <StatusBadge label={rider.online ? "Online" : "Offline"} />
        </View>
        <Text className="mt-4" style={{ color: theme.primary, fontFamily: "Manrope_800ExtraBold", fontSize: 28 }}>
          Entrega com NorFood
        </Text>
      </View>

      <View className="mt-4 flex-row gap-3">
        <Metric label="Avaliacao" value={String(rider.score)} />
        <Metric label="Entregas" value={String(rider.completedCount)} />
        <Metric label="Sucesso" value={`${rider.successRate}%`} />
      </View>

      <View className="mt-4 rounded-[30px] p-2" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border }}>
        {menus.map((item) => {
          const active = panel === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setPanel(item.key)}
              className="flex-row items-center justify-between rounded-[22px] px-4 py-4"
              style={{ backgroundColor: active ? `${theme.accentBright}18` : "transparent" }}
            >
              <Text style={{ color: theme.text, fontFamily: "Manrope_600SemiBold", fontSize: 15 }}>{item.label}</Text>
              <Feather name="chevron-right" size={18} color={theme.accent} />
            </Pressable>
          );
        })}
      </View>

      <View className="mt-4 rounded-[30px] p-5" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border }}>
        {panel === "dados" ? (
          <>
            <SectionTitle title="Meus dados" subtitle="Atualize suas informacoes principais." />
            <Input label="Nome" value={name} onChangeText={setName} />
            <Input label="Telefone" value={phone} onChangeText={setPhone} />
            <Input label="Email" value={email} onChangeText={setEmail} />
            <View className="mb-3 flex-row gap-2">
              <View className="flex-1">
                <Input label="CEP" value={cep} onChangeText={(value) => setCep(formatCep(value))} />
              </View>
              <Pressable
                onPress={() => void fillAddressFromCep()}
                className="mt-[27px] rounded-[22px] px-4 py-4"
                style={{ backgroundColor: theme.backgroundSoft, borderWidth: 1, borderColor: theme.border }}
              >
                <Text style={{ color: theme.text, fontFamily: "Manrope_700Bold", fontSize: 13 }}>
                  {loadingCep ? "Buscando" : "ViaCEP"}
                </Text>
              </Pressable>
            </View>
            <Input label="Endereco" value={address} onChangeText={setAddress} onBlur={() => void fillAddressFromCep()} />
            <Input label="Bairro" value={neighborhood} onChangeText={setNeighborhood} />
            <Text className="mb-3" style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 12 }}>
              Bairros atendidos: {supportedNeighborhoods.map((item) => item.name).join(", ")}.
            </Text>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Input label="Cidade" value={city} onChangeText={setCity} />
              </View>
              <View style={{ width: 82 }}>
                <Input label="UF" value={stateCode} onChangeText={(value) => setStateCode(value.toUpperCase().slice(0, 2))} />
              </View>
            </View>
            <Pressable
              onPress={() => updateProfile({ name, phone, email, cep, address, neighborhood, city, state: stateCode })}
              className="mt-4 rounded-full py-[15px]"
              style={{ backgroundColor: theme.primary }}
            >
              <Text className="text-center" style={{ color: "#fff", fontFamily: "Manrope_800ExtraBold" }}>
                Salvar dados
              </Text>
            </Pressable>
          </>
        ) : null}

        {panel === "veiculo" ? (
          <>
            <SectionTitle title="Veiculo e documentos" subtitle="Dados usados durante as entregas." />
            <InfoRow label="Veiculo" value={rider.vehicle} />
            <InfoRow label="Placa" value={rider.plate} />
            <InfoRow label="CNH" value={rider.documents.cnh} />
            <InfoRow label="Validade CNH" value={rider.documents.cnhExpiry} />
            <InfoRow label="Documento" value={rider.documents.vehicleDocument} />
          </>
        ) : null}

        {panel === "financeiro" ? (
          <>
            <SectionTitle title="Financeiro" subtitle="Pix, ganhos e repasse rapido." />
            <InfoRow label="Chave Pix" value={rider.pixKey} />
            <InfoRow label="Hoje" value={`R$ ${state.earnings.today.toFixed(2)}`} />
            <InfoRow label="Semana" value={`R$ ${state.earnings.week.toFixed(2)}`} />
            <InfoRow label="Mes" value={`R$ ${state.earnings.month.toFixed(2)}`} />
            <Pressable
              onPress={() => Clipboard.setStringAsync(rider.pixKey)}
              className="mt-4 rounded-full py-[15px]"
              style={{ backgroundColor: theme.primary }}
            >
              <Text className="text-center" style={{ color: "#fff", fontFamily: "Manrope_800ExtraBold" }}>
                Copiar chave Pix
              </Text>
            </Pressable>
          </>
        ) : null}

        {panel === "configuracoes" ? (
          <>
            <SectionTitle title="Configuracoes" subtitle="Preferencias do app do entregador." />
            <ToggleRow
              label={updatingOnline ? "Atualizando disponibilidade" : "Ficar online"}
              value={rider.online}
              onValueChange={handleToggleOnline}
              disabled={updatingOnline}
            />
            <ToggleRow
              label="Notificar novos pedidos"
              value={rider.settings.notifyNewOrders}
              onValueChange={(value) => updateProfile({ settings: { notifyNewOrders: value } })}
            />
            <ToggleRow
              label="Notificar ocorrencias"
              value={rider.settings.notifyOccurrences}
              onValueChange={(value) => updateProfile({ settings: { notifyOccurrences: value } })}
            />
            <ToggleRow
              label="Ficar online apos login"
              value={rider.settings.autoOnlineAfterLogin}
              onValueChange={(value) => updateProfile({ settings: { autoOnlineAfterLogin: value } })}
            />
          </>
        ) : null}

        {panel === "ajuda" ? (
          <>
            <SectionTitle title="Ajuda" subtitle="Orientacoes rapidas para o dia a dia." />
            <InfoRow label="Boas praticas" value="Confirme referencia, mantenha contato e finalize no app." />
            <InfoRow label="Ocorrencias" value="Registre chuva, transito, dano ou cliente nao atende." />
            <InfoRow label="Cliente" value="Use mensagens rapidas antes de ligar." />
          </>
        ) : null}

        {panel === "suporte" ? (
          <>
            <SectionTitle title="Suporte" subtitle="Canais diretos da operacao." />
            <InfoRow label="Telefone" value={rider.supportPhone} />
            <InfoRow label="Emergencia" value={rider.emergencyPhone} />
            <View className="mt-4 flex-row gap-3">
              <Pressable
                onPress={() => Linking.openURL(`tel:${rider.supportPhone}`)}
                className="flex-1 rounded-full py-[15px]"
                style={{ backgroundColor: theme.primary }}
              >
                <Text className="text-center" style={{ color: "#fff", fontFamily: "Manrope_800ExtraBold" }}>
                  Ligar
                </Text>
              </Pressable>
              <Pressable
                onPress={() => Linking.openURL(`sms:${rider.supportPhone}`)}
                className="flex-1 rounded-full py-[15px]"
                style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.primary }}
              >
                <Text className="text-center" style={{ color: theme.primary, fontFamily: "Manrope_800ExtraBold" }}>
                  Mensagem
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>

      <Pressable onPress={logout} className="mt-4 rounded-[24px] px-4 py-5" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: `${theme.danger}33` }}>
        <Text style={{ color: theme.danger, fontFamily: "Manrope_700Bold", fontSize: 15 }}>Sair da conta</Text>
      </Pressable>
    </ScreenContainer>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  const theme = useTenantTheme();
  return (
    <View className="mb-4">
      <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 18 }}>{title}</Text>
      <Text className="mt-1" style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 13 }}>
        {subtitle}
      </Text>
    </View>
  );
}

function Input({
  label,
  value,
  onChangeText,
  onBlur,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
}) {
  const theme = useTenantTheme();
  return (
    <View className="mb-3">
      <Text className="mb-2" style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 12 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        className="rounded-[22px] px-4 py-4"
        style={{ backgroundColor: theme.backgroundSoft, color: theme.text, borderWidth: 1, borderColor: theme.border }}
      />
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void | Promise<void>;
  disabled?: boolean;
}) {
  const theme = useTenantTheme();
  return (
    <View className="mb-3 flex-row items-center justify-between rounded-[22px] px-4 py-4" style={{ backgroundColor: theme.backgroundSoft, borderWidth: 1, borderColor: theme.border, opacity: disabled ? 0.6 : 1 }}>
      <Text style={{ color: theme.text, fontFamily: "Manrope_600SemiBold", fontSize: 14 }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} thumbColor="#fff" trackColor={{ false: theme.borderStrong, true: theme.primary }} />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const theme = useTenantTheme();
  return (
    <View className="mb-3 rounded-[22px] px-4 py-4" style={{ backgroundColor: theme.backgroundSoft, borderWidth: 1, borderColor: theme.border }}>
      <Text style={{ color: theme.textSoft, fontFamily: "Manrope_600SemiBold", fontSize: 12 }}>{label}</Text>
      <Text className="mt-1" style={{ color: theme.text, fontFamily: "Manrope_700Bold", fontSize: 15 }}>
        {value}
      </Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useTenantTheme();
  return (
    <View className="flex-1 rounded-[24px] p-4" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border }}>
      <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 25 }}>{value}</Text>
      <Text className="mt-2" style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 12 }}>
        {label}
      </Text>
    </View>
  );
}
