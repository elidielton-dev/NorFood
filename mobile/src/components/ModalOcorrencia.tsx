import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { IncidentType } from "../types";
import { useAppTheme } from "../styles/theme";

const options: IncidentType[] = [
  "Cliente nao atende",
  "Endereco incorreto",
  "Pedido danificado",
  "Transito",
  "Chuva",
  "Outro",
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (type: IncidentType, note: string) => void | Promise<void>;
};

export function ModalOcorrencia({ visible, onClose, onSubmit }: Props) {
  const theme = useAppTheme();
  const [selected, setSelected] = useState<IncidentType>("Cliente nao atende");
  const [note, setNote] = useState("");

  async function submit() {
    await onSubmit(selected, note);
    setNote("");
    setSelected("Cliente nao atende");
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/35">
        <View className="rounded-t-[32px] p-5" style={{ backgroundColor: theme.background }}>
          <Text style={{ color: theme.text, fontFamily: "Manrope_800ExtraBold", fontSize: 24 }}>Registrar problema</Text>
          <View className="mt-4 flex-row flex-wrap gap-2">
            {options.map((item) => {
              const active = item === selected;
              return (
                <Pressable
                  key={item}
                  onPress={() => setSelected(item)}
                  className="rounded-full px-4 py-3"
                  style={{
                    backgroundColor: active ? theme.primary : theme.backgroundElevated,
                    borderWidth: 1,
                    borderColor: active ? theme.primary : theme.border,
                  }}
                >
                  <Text style={{ color: active ? "#fff" : theme.text, fontFamily: "Manrope_700Bold", fontSize: 13 }}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Detalhes da ocorrencia"
            placeholderTextColor={theme.textSoft}
            multiline
            className="mt-4 rounded-[24px] p-4"
            style={{
              minHeight: 120,
              backgroundColor: theme.backgroundElevated,
              color: theme.text,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          />
          <View className="mt-5 flex-row gap-3">
            <Pressable onPress={onClose} className="flex-1 rounded-full py-4" style={{ backgroundColor: theme.backgroundElevated, borderWidth: 1, borderColor: theme.border }}>
              <Text className="text-center" style={{ color: theme.text, fontFamily: "Manrope_700Bold" }}>
                Cancelar
              </Text>
            </Pressable>
            <Pressable onPress={submit} className="flex-1 rounded-full py-4" style={{ backgroundColor: theme.accentBright }}>
              <Text className="text-center" style={{ color: theme.primary, fontFamily: "Manrope_800ExtraBold" }}>
                Salvar
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
