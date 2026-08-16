import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  calcularQuantidadeDisponivel,
  obterCategoriaLivro,
  obterTextoLocalizacaoEstante,
} from "../services/livros";
import { Emprestimo, Livro } from "../types";

const VERDE = "#1D9E75";
const AMBER = "#BA7517";

interface LivroDetalheModalProps {
  visible: boolean;
  livro: Livro | null;
  emprestimosAtivos?: Emprestimo[];
  permitirEditarLocalizacao?: boolean;
  textoRodape?: string;
  onClose: () => void;
  onSalvarLocalizacao?: (livro: Livro, localizacaoEstante: string) => Promise<void>;
}

export default function LivroDetalheModal({
  visible,
  livro,
  emprestimosAtivos = [],
  permitirEditarLocalizacao = false,
  textoRodape,
  onClose,
  onSalvarLocalizacao,
}: LivroDetalheModalProps) {
  const [localizacaoEdicao, setLocalizacaoEdicao] = useState("");
  const [salvandoLocalizacao, setSalvandoLocalizacao] = useState(false);

  useEffect(() => {
    setLocalizacaoEdicao(livro?.localizacaoEstante || "");
  }, [livro?.id, livro?.localizacaoEstante]);

  if (!livro) return null;

  const quantidadeTotal = Math.max(livro.quantidadeTotal ?? 1, 0);
  const quantidadeDisponivel = calcularQuantidadeDisponivel(livro, emprestimosAtivos);
  const disponivel = quantidadeDisponivel > 0;
  const categoria = obterCategoriaLivro(livro.categoria);
  const localizacao = obterTextoLocalizacaoEstante(livro);
  const localizacaoLimpa = localizacaoEdicao.trim();
  const localizacaoAtual = (livro.localizacaoEstante || "").trim();
  const localizacaoAlterada = localizacaoLimpa !== localizacaoAtual;

  const salvarLocalizacao = async () => {
    if (!onSalvarLocalizacao || salvandoLocalizacao) return;
    if (!localizacaoLimpa) {
      Alert.alert("Localização obrigatória", "Informe onde o livro está guardado na estante.");
      return;
    }

    setSalvandoLocalizacao(true);
    try {
      await onSalvarLocalizacao(livro, localizacaoLimpa);
      Alert.alert("Localização atualizada", "A localização na estante foi salva.");
    } catch (e) {
      console.error("Erro ao salvar localização do livro:", e);
      Alert.alert("Erro", "Não foi possível salvar a localização na estante.");
    } finally {
      setSalvandoLocalizacao(false);
    }
  };

  const infos: Array<{ label: string; valor: string | number }> = [
    { label: "Título", valor: livro.titulo || "Sem título" },
    { label: "Autor", valor: livro.autor || "Não informado" },
    { label: "Categoria", valor: categoria.label },
    { label: "Localização na estante", valor: localizacao },
    { label: "ISBN", valor: livro.isbn || "Não informado" },
    { label: "Quantidade total", valor: quantidadeTotal },
    { label: "Quantidade disponível", valor: quantidadeDisponivel },
    { label: "Disponibilidade", valor: disponivel ? "Disponível para empréstimo" : "Emprestado no momento" },
  ];

  if (livro.editora) {
    infos.splice(2, 0, { label: "Editora", valor: livro.editora });
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <ScrollView style={s.modal} contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity
          style={s.modalFechar}
          onPress={onClose}
        >
          <Text style={s.modalFecharTxt}>← Voltar</Text>
        </TouchableOpacity>

        {livro.imagem ? (
          <Image
            source={{ uri: livro.imagem }}
            style={s.capaDetalhe}
            resizeMode="contain"
          />
        ) : (
          <View style={[s.capaDetalhe, s.capaVazia]}>
            <Text style={{ fontSize: 64 }}>📖</Text>
          </View>
        )}

        <View style={[
          s.statusDetalhe,
          {
            backgroundColor: disponivel ? "#E1F5EE" : "#FAEEDA",
            borderColor: disponivel ? VERDE : AMBER,
          }
        ]}>
          <Text style={{
            fontSize: 16,
            fontWeight: "bold",
            color: disponivel ? "#0F6E56" : AMBER,
            textAlign: "center",
          }}>
            {disponivel ? "✅ Disponível para empréstimo" : "📤 Emprestado no momento"}
          </Text>
        </View>

        <View style={s.infoCard}>
          {infos.map((item) => (
            <View key={item.label} style={s.infoRow}>
              <Text style={s.infoLabel}>{item.label}</Text>
              <Text style={s.infoValor}>{item.valor}</Text>
            </View>
          ))}
        </View>

        {permitirEditarLocalizacao && onSalvarLocalizacao ? (
          <View style={s.edicaoCard}>
            <Text style={s.edicaoTitulo}>Localização na estante</Text>
            <TextInput
              value={localizacaoEdicao}
              onChangeText={setLocalizacaoEdicao}
              editable={!salvandoLocalizacao}
              placeholder="Ex: Estante azul, Prateleira 2"
              placeholderTextColor="#999"
              style={s.edicaoInput}
            />
            <TouchableOpacity
              style={[
                s.edicaoBtn,
                (!localizacaoAlterada || salvandoLocalizacao) && s.edicaoBtnDisabled,
              ]}
              onPress={salvarLocalizacao}
              disabled={!localizacaoAlterada || salvandoLocalizacao}
            >
              {salvandoLocalizacao ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.edicaoBtnTxt}>Salvar localização</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {textoRodape ? (
          <Text style={s.infoRodape}>{textoRodape}</Text>
        ) : null}
      </ScrollView>
    </Modal>
  );
}

const s = StyleSheet.create({
  modal: { flex: 1, backgroundColor: "#F4F6F8", padding: 20, paddingTop: 50 },
  modalFechar: { marginBottom: 16 },
  modalFecharTxt: { color: VERDE, fontSize: 16, fontWeight: "600" },
  capaDetalhe: {
    width: "100%", height: 200, borderRadius: 14,
    marginBottom: 16, backgroundColor: "#f0f0f0",
  },
  capaVazia: {
    backgroundColor: "#f0f0f0",
    alignItems: "center", justifyContent: "center",
  },
  statusDetalhe: {
    padding: 14, borderRadius: 12, marginBottom: 16,
    borderWidth: 1,
  },
  infoCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    borderWidth: 0.5, borderColor: "#e0e0e0", marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: "#f0f0f0",
    gap: 14,
  },
  infoLabel: { fontSize: 13, color: "#888", flex: 1 },
  infoValor: { fontSize: 13, fontWeight: "500", color: "#1a1a18", flex: 1.25, textAlign: "right" },
  edicaoCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    borderWidth: 0.5, borderColor: "#e0e0e0", marginBottom: 16,
  },
  edicaoTitulo: { fontSize: 13, color: "#555", fontWeight: "700", marginBottom: 8 },
  edicaoInput: {
    backgroundColor: "#FAFAFA", borderWidth: 1, borderColor: "#ddd",
    borderRadius: 10, padding: 12, fontSize: 14, color: "#1a1a18",
  },
  edicaoBtn: {
    backgroundColor: VERDE, padding: 12, borderRadius: 10,
    alignItems: "center", marginTop: 10,
  },
  edicaoBtnDisabled: { opacity: 0.45 },
  edicaoBtnTxt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  infoRodape: {
    textAlign: "center", color: "#aaa",
    fontSize: 13, fontStyle: "italic",
  },
});
