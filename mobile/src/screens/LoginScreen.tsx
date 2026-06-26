import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ReactNode, useState } from "react";
import { Alert, Pressable, Switch, Text, TextInput, View } from "react-native";
import { FadeInView } from "../components/FadeInView";
import { HoneyJarIllustration } from "../components/HoneyJarIllustration";
import { PhoneStatusBar } from "../components/PhoneStatusBar";
import { ScreenContainer } from "../components/ScreenContainer";
import { useAppData } from "../context/AppDataContext";
import { getMobileSupabaseConfigError, mobileSupabaseEnabled } from "../lib/supabase";
import { useAppTheme } from "../styles/theme";

const logo = require("../../assets/brand/logo-abelha-mel.png");

export function LoginScreen() {
  const theme = useAppTheme();
  const { login, state } = useAppData();
  const [email, setEmail] = useState(state.rider.email);
  const [password, setPassword] = useState("");
  const [rememberLogin, setRememberLogin] = useState(state.rememberLogin);
  const [onlineAfterLogin, setOnlineAfterLogin] = useState(state.rider.online);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const configError = getMobileSupabaseConfigError();

  async function handleLogin() {
    if (configError) {
      Alert.alert("App nao configurado", configError);
      return;
    }
    try {
      setSubmitting(true);
      await login(email, password, rememberLogin, onlineAfterLogin);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel entrar. Verifique e-mail e senha.";
      Alert.alert("Erro ao entrar", message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer contentClassName="justify-between" scroll={false}>
      <FadeInView>
        <PhoneStatusBar />
        {configError ? (
          <View
            className="mt-3 rounded-2xl px-4 py-3"
            style={{ backgroundColor: "#fff4e5", borderWidth: 1, borderColor: "#f0c987" }}
          >
            <Text style={{ color: "#8a5a00", fontFamily: "Manrope_700Bold", fontSize: 13 }}>
              Supabase nao configurado no Expo Go
            </Text>
            <Text style={{ color: "#8a5a00", fontFamily: "Manrope_500Medium", fontSize: 12, marginTop: 4 }}>
              {configError}
            </Text>
          </View>
        ) : null}
        {!mobileSupabaseEnabled() ? null : (
          <View
            className="mt-3 rounded-2xl px-4 py-3"
            style={{ backgroundColor: theme.backgroundSoft, borderWidth: 1, borderColor: theme.border }}
          >
            <Text style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 12 }}>
              Expo Go: use o QR Code do comando `npm run mobile:tunnel` se o celular nao conectar na rede local.
            </Text>
          </View>
        )}
        <View className="mt-1 items-center">
          <Image source={logo} style={{ width: 156, height: 156 }} contentFit="contain" />
          <Text
            className="mt-7 text-center"
            style={{ color: theme.text, fontFamily: "CormorantGaramond_700Bold", fontSize: 44 }}
          >
            Bem-vindo(a)!
          </Text>
          <Text
            className="mt-2 text-center"
            style={{ color: theme.textMuted, fontFamily: "Manrope_500Medium", fontSize: 16 }}
          >
            Faca login com o e-mail do entregador
          </Text>
        </View>

        <View className="mt-9 gap-4">
          <Field
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="motoboy@abelhaemel.com"
            icon="mail"
            theme={theme}
          />
          <Field
            label="Senha"
            value={password}
            onChangeText={setPassword}
            placeholder="Sua senha"
            icon="lock"
            secureTextEntry={!showPassword}
            rightAction={
              <Pressable onPress={() => setShowPassword((current) => !current)}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={theme.textSoft} />
              </Pressable>
            }
            theme={theme}
          />
          <View className="flex-row items-center justify-between">
            <Pressable
              className="flex-row items-center gap-2"
              onPress={() => setRememberLogin((current) => !current)}
            >
              <View
                className="h-5 w-5 items-center justify-center rounded-md"
                style={{
                  backgroundColor: rememberLogin ? theme.primary : theme.backgroundElevated,
                  borderWidth: 1,
                  borderColor: theme.borderStrong,
                }}
              >
                {rememberLogin ? <Feather name="check" size={12} color="#fff" /> : null}
              </View>
              <Text style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 13 }}>
                Lembrar de mim
              </Text>
            </Pressable>
            <Pressable>
              <Text style={{ color: theme.primary, fontFamily: "Manrope_700Bold", fontSize: 13 }}>
                Esqueci minha senha
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => void handleLogin()}
            disabled={submitting}
            className="mt-1"
          >
            <LinearGradient
              colors={[theme.primary, theme.primaryDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                borderRadius: 999,
                paddingVertical: 18,
                alignItems: "center",
                opacity: submitting ? 0.7 : 1,
                shadowColor: theme.shadow,
                shadowOpacity: 0.16,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
                elevation: 4,
              }}
            >
              <Text style={{ color: "#fff", fontFamily: "Manrope_800ExtraBold", fontSize: 18 }}>
                {submitting ? "Entrando..." : "Entrar"}
              </Text>
            </LinearGradient>
          </Pressable>
          <View
            className="flex-row items-center justify-between rounded-full px-1 py-1"
            style={{
              backgroundColor: theme.backgroundSoft,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text
              className="pl-4"
              style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 13 }}
            >
              Ficar online apos entrar
            </Text>
            <Switch
              value={onlineAfterLogin}
              onValueChange={setOnlineAfterLogin}
              thumbColor="#fff"
              trackColor={{ false: theme.borderStrong, true: theme.primary }}
            />
          </View>
        </View>
      </FadeInView>

      <View className="mb-3 mt-7 items-center">
        <HoneyJarIllustration size={122} />
        <Text className="mt-5" style={{ color: theme.textSoft, fontFamily: "Manrope_600SemiBold", fontSize: 12 }}>
          Versao 1.0.0
        </Text>
        <Text className="mt-2" style={{ color: theme.accent, fontFamily: "Manrope_700Bold", fontSize: 13 }}>
          Feito com amor
        </Text>
      </View>
    </ScreenContainer>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  icon: keyof typeof Feather.glyphMap;
  secureTextEntry?: boolean;
  rightAction?: ReactNode;
  theme: ReturnType<typeof useAppTheme>;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  secureTextEntry,
  rightAction,
  theme,
}: FieldProps) {
  return (
    <View>
      <Text className="mb-2 pl-1" style={{ color: theme.textMuted, fontFamily: "Manrope_600SemiBold", fontSize: 12 }}>
        {label}
      </Text>
      <View
        className="flex-row items-center rounded-full px-4 py-[17px]"
        style={{
          backgroundColor: theme.backgroundElevated,
          borderWidth: 1,
          borderColor: theme.borderStrong,
          shadowColor: theme.shadow,
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 1,
        }}
      >
        <Feather name={icon} size={18} color={theme.accent} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textSoft}
          secureTextEntry={secureTextEntry}
          className="ml-3 flex-1"
          style={{ color: theme.text, fontFamily: "Manrope_600SemiBold" }}
        />
        {rightAction}
      </View>
    </View>
  );
}
