import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from "react-native";
import {
  adicionarPessoa,
  buscarPessoas,
  excluirOuArquivarPessoa,
  restaurarPessoa,
} from "../../services/pessoas";
import { Pessoa } from "../../types";

const VERDE = "#1D9E75";

export default function PessoasScreen() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [modalForm, setModalForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<Partial<Pessoa>>({});
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);
  const [pessoaProcessandoId, setPessoaProcessandoId] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => { carregar(); }, [mostrarArquivadas]);

  const carregar = async () => {
    setLoading(true);
    setErro("");
    try {
      const data = await buscarPessoas({ incluirArquivadas: mostrarArquivadas });
      setPessoas(data);
    } catch (e) {
      console.log("Erro ao carregar pessoas:", e);
      setErro("Não foi possível carregar as pessoas.");
    } finally {
      setLoading(false);
    }
  };

  const abrirForm = () => {
    setForm({});
    setModalForm(true);
  };

  const salvar = async () => {
    if (!form.nome || !form.telefone) {
      return Alert.alert("Atenção", "Nome e telefone são obrigatórios.");
    }
    setSalvando(true);
    try {
      await adicionarPessoa({
        nome: form.nome || "",
        telefone: form.telefone || "",
        idade: form.idade || 0,
        observacoes: form.observacoes || "",
        ativo: true,
        arquivado: false,
        dataCadastro: new Date().toISOString(),
      });
      setModalForm(false);
      setForm({});
      carregar();
    } catch (e) {
      console.log("Erro ao salvar pessoa:", e);
      Alert.alert("Erro", "Não foi possível cadastrar a pessoa.");
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = (pessoa: Pessoa) => {
    Alert.alert(
      "Confirmar exclusão",
      `Deseja excluir o cadastro de ${pessoa.nome}? Esta ação não poderá ser desfeita.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir pessoa",
          style: "destructive",
          onPress: () => excluirPessoa(pessoa),
        },
      ]
    );
  };

  const excluirPessoa = async (pessoa: Pessoa) => {
    if (!pessoa.id || pessoaProcessandoId) return;
    setPessoaProcessandoId(pessoa.id);

    try {
      const resultado = await excluirOuArquivarPessoa(pessoa.id);

      if (resultado === "bloqueada_emprestimo_ativo") {
        Alert.alert(
          "Pessoa com empréstimo ativo",
          "É necessário registrar a devolução antes de excluir este cadastro."
        );
        return;
      }

      setPessoas((atuais) => atuais.filter((item) => item.id !== pessoa.id));

      if (resultado === "arquivada_historico") {
        Alert.alert(
          "Pessoa arquivada",
          "O cadastro foi arquivado e os empréstimos antigos continuam preservados para relatórios."
        );
      } else {
        Alert.alert("Pessoa excluída", "O cadastro foi removido.");
      }

      carregar();
    } catch (e) {
      console.log("Erro ao excluir pessoa:", e);
      Alert.alert("Erro", "Não foi possível excluir ou arquivar a pessoa.");
    } finally {
      setPessoaProcessandoId(null);
    }
  };

  const restaurarPessoaArquivada = async (pessoa: Pessoa) => {
    if (!pessoa.id || pessoaProcessandoId) return;
    setPessoaProcessandoId(pessoa.id);

    try {
      await restaurarPessoa(pessoa.id);
      Alert.alert("Pessoa restaurada", `${pessoa.nome} voltou para a lista de pessoas ativas.`);
      carregar();
    } catch (e) {
      console.log("Erro ao restaurar pessoa:", e);
      Alert.alert("Erro", "Não foi possível restaurar a pessoa.");
    } finally {
      setPessoaProcessandoId(null);
    }
  };

  const abrirMenuPessoa = (pessoa: Pessoa) => {
    if (pessoaProcessandoId) return;
    const arquivada = pessoa.arquivado === true || pessoa.ativo === false;

    Alert.alert(
      pessoa.nome,
      arquivada ? "Cadastro arquivado" : "Escolha uma ação",
      arquivada
        ? [
          { text: "Restaurar pessoa", onPress: () => restaurarPessoaArquivada(pessoa) },
          { text: "Cancelar", style: "cancel" },
        ]
        : [
          { text: "Excluir pessoa", style: "destructive", onPress: () => confirmarExclusao(pessoa) },
          { text: "Cancelar", style: "cancel" },
        ]
    );
  };

  const pessoasFiltradas = pessoas.filter((p) =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    p.telefone.includes(busca)
  );

  return (
    <View style={s.container}>
      {/* HEADER */}
      <View style={s.header}>
        <Text style={s.titulo}>👤 Pessoas</Text>
        <Text style={s.subtitulo}>{pessoas.length} cadastradas</Text>
      </View>

      {/* BUSCA */}
      <TextInput
        placeholder="Buscar por nome ou telefone..."
        value={busca}
        onChangeText={setBusca}
        style={s.input}
        placeholderTextColor="#aaa"
      />

      {/* BOTÃO */}
      <View style={s.row}>
        <TouchableOpacity style={s.btn} onPress={abrirForm} disabled={Boolean(pessoaProcessandoId)}>
          <Text style={s.btnText}>+ Cadastrar pessoa</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={s.toggleArquivadas}
        onPress={() => setMostrarArquivadas((atual) => !atual)}
        disabled={Boolean(pessoaProcessandoId)}
      >
        <Text style={s.toggleArquivadasTxt}>
          {mostrarArquivadas ? "Ocultar arquivadas" : "Ver pessoas arquivadas"}
        </Text>
      </TouchableOpacity>

      {/* LISTA */}
      {loading ? (
        <ActivityIndicator color={VERDE} size="large" style={{ marginTop: 40 }} />
      ) : erro ? (
        <View style={s.vazio}>
          <Text style={s.vazioTxt}>{erro}</Text>
          <TouchableOpacity style={[s.btn, { marginTop: 12, maxWidth: 180 }]} onPress={carregar}>
            <Text style={s.btnText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : pessoasFiltradas.length === 0 ? (
        <View style={s.vazio}>
          <Text style={s.vazioTxt}>Nenhuma pessoa cadastrada</Text>
          <Text style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
            Cadastre as pessoas que pegam livros
          </Text>
        </View>
      ) : (
        <FlatList
          data={pessoasFiltradas}
          keyExtractor={(i) => i.id!}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                s.card,
                (item.arquivado === true || item.ativo === false) && s.cardArquivado,
              ]}
              onLongPress={() => abrirMenuPessoa(item)}
              disabled={Boolean(pessoaProcessandoId)}
            >
              <View style={s.avatar}>
                <Text style={s.avatarTxt}>
                  {item.nome.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.cardNome}>{item.nome}</Text>
                <Text style={s.cardTel}>📞 {item.telefone}</Text>
                {(item.arquivado === true || item.ativo === false) ? (
                  <Text style={s.cardArquivadoTxt}>Arquivada</Text>
                ) : null}
                {item.idade ? (
                  <Text style={s.cardMeta}>{item.idade} anos</Text>
                ) : null}
                {item.observacoes ? (
                  <Text style={s.cardObs} numberOfLines={1}>
                    {item.observacoes}
                  </Text>
                ) : null}
              </View>
              {pessoaProcessandoId === item.id ? (
                <ActivityIndicator color={VERDE} />
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}

      {/* MODAL FORMULÁRIO */}
      <Modal
        visible={modalForm}
        animationType="slide"
        onRequestClose={() => setModalForm(false)}
      >
        <ScrollView style={s.modal} contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={s.modalTitle}>👤 Nova pessoa</Text>

          {[
            { label: "Nome *", key: "nome", placeholder: "Ex: Maria Silva", keyboard: "default" },
            { label: "Telefone *", key: "telefone", placeholder: "(00) 00000-0000", keyboard: "phone-pad" },
            { label: "Idade", key: "idade", placeholder: "Ex: 12", keyboard: "numeric" },
            { label: "Observações", key: "observacoes", placeholder: "Ex: Aluno da turma B", keyboard: "default" },
          ].map((campo) => (
            <View key={campo.key} style={{ marginBottom: 12 }}>
              <Text style={s.label}>{campo.label}</Text>
              <TextInput
                style={s.input}
                placeholder={campo.placeholder}
                placeholderTextColor="#aaa"
                keyboardType={campo.keyboard as any}
                value={
                  campo.key === "idade"
                    ? form.idade?.toString() || ""
                    : (form as any)[campo.key] || ""
                }
                onChangeText={(v) =>
                  setForm((f) => ({
                    ...f,
                    [campo.key]: campo.key === "idade" ? parseInt(v) || 0 : v,
                  }))
                }
              />
            </View>
          ))}

          <View style={s.row}>
            <TouchableOpacity
              style={[s.btn, s.btnOutline]}
              onPress={() => { setModalForm(false); setForm({}); }}
            >
              <Text style={[s.btnText, { color: VERDE }]}>Cancelar</Text>
            </TouchableOpacity>
            <View style={{ width: 10 }} />
            <TouchableOpacity style={s.btn} onPress={salvar} disabled={salvando}>
              {salvando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnText}>💾 Salvar</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6F8" },
  header: { backgroundColor: VERDE, padding: 20, paddingTop: 50 },
  titulo: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  subtitulo: { color: "#fff", opacity: 0.9 },
  input: {
    backgroundColor: "#fff",
    margin: 10,
    padding: 12,
    borderRadius: 10,
    fontSize: 14,
    color: "#1a1a18",
  },
  row: { flexDirection: "row", paddingHorizontal: 10, marginBottom: 4 },
  btn: {
    backgroundColor: VERDE,
    padding: 12,
    borderRadius: 10,
    flex: 1,
    alignItems: "center",
  },
  btnOutline: { backgroundColor: "#fff", borderWidth: 1, borderColor: VERDE },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  toggleArquivadas: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12 },
  toggleArquivadasTxt: { color: VERDE, fontWeight: "600", fontSize: 13 },
  vazio: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 60 },
  vazioTxt: { fontSize: 16, color: "#555" },
  card: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    gap: 12,
    borderWidth: 0.5,
    borderColor: "#e0e0e0",
  },
  cardArquivado: { opacity: 0.72, borderLeftWidth: 3, borderLeftColor: "#888" },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E1F5EE",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { fontSize: 18, fontWeight: "bold", color: VERDE },
  cardNome: { fontWeight: "bold", fontSize: 14, color: "#1a1a18" },
  cardTel: { fontSize: 12, color: "#666", marginTop: 2 },
  cardArquivadoTxt: { fontSize: 11, color: "#888", marginTop: 2, fontWeight: "600" },
  cardMeta: { fontSize: 11, color: "#aaa", marginTop: 2 },
  cardObs: { fontSize: 11, color: "#aaa", marginTop: 2, fontStyle: "italic" },
  modal: { flex: 1, backgroundColor: "#f4f4f2", padding: 20, paddingTop: 50 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#1a1a18", marginBottom: 16 },
  label: { fontSize: 12, color: "#666", marginBottom: 4, fontWeight: "500" },
});
