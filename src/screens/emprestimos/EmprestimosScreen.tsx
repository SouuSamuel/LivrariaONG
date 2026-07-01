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
import { useNavigation } from "@react-navigation/native";
import { CameraView, Camera } from "expo-camera";
import {
  criarEmprestimo,
  buscarEmprestimos,
  registrarDevolucao,
} from "../../services/emprestimos";
import { buscarLivros } from "../../services/livros";
import { buscarPessoas } from "../../services/pessoas";
import { Emprestimo, Livro, Pessoa } from "../../types";

const VERDE = "#1D9E75";
const AMBER = "#BA7517";
const VERMELHO = "#A32D2D";

export default function EmprestimosScreen() {
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [livros, setLivros] = useState<Livro[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalForm, setModalForm] = useState(false);
  const [modalScanner, setModalScanner] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "ativos" | "atrasados">("todos");
  const [scanAtivo, setScanAtivo] = useState(false);
  const [buscandoLivro, setBuscandoLivro] = useState(false);

  // Form
  const [livroSelecionado, setLivroSelecionado] = useState<Livro | null>(null);
  const [pessoaSelecionada, setPessoaSelecionada] = useState<Pessoa | null>(null);
  const [diasPrazo, setDiasPrazo] = useState("14");
  const [etapa, setEtapa] = useState<"scan" | "livro" | "pessoa" | "confirmar">("scan");
  const [buscaLivro, setBuscaLivro] = useState("");
  const [buscaPessoa, setBuscaPessoa] = useState("");
  const navigation = useNavigation<any>();

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setLoading(true);
    const [emps, livs, pess] = await Promise.all([
      buscarEmprestimos(),
      buscarLivros(),
      buscarPessoas(),
    ]);
    setEmprestimos(emps);
    setLivros(livs);
    setPessoas(pess);
    setLoading(false);
  };

  const abrirForm = async () => {
    setLivroSelecionado(null);
    setPessoaSelecionada(null);
    setDiasPrazo("14");
    setBuscaLivro("");
    setBuscaPessoa("");

    // Pede permissão e abre scanner direto
    const { status } = await Camera.requestCameraPermissionsAsync();
    if (status === "granted") {
      setScanAtivo(true);
      setModalScanner(true);
    } else {
      // Se não tiver permissão vai para lista manual
      setEtapa("livro");
      setModalForm(true);
    }
  };

  const onScan = async ({ data }: { data: string }) => {
    if (!scanAtivo) return;
    setScanAtivo(false);
    setModalScanner(false);
    setBuscandoLivro(true);
    setEtapa("livro");
    setModalForm(true);

    const codigoLimpo = data.replace(/\D/g, "");

    // Busca o livro no acervo pelo ISBN ou código de barras
    const livroEncontrado = livros.find(
      (l) => l.isbn === codigoLimpo || l.codigoBarras === codigoLimpo || l.codigoBarras === data
    );

    setBuscandoLivro(false);

    if (livroEncontrado) {
      if (livroEncontrado.status !== "Disponível") {
        Alert.alert(
          "Livro indisponível",
          `"${livroEncontrado.titulo}" já está emprestado.`
        );
        return;
      }
      // Encontrou — seleciona e vai direto para pessoa
      setLivroSelecionado(livroEncontrado);
      setEtapa("pessoa");
    } else {
      Alert.alert(
        "Livro não encontrado no acervo",
        `Código: ${data}\n\nEste livro não está cadastrado. O que deseja fazer?`,
        [
          {
            text: "Cancelar",
            style: "cancel",
            onPress: () => setModalForm(false),
          },
          {
            text: "Buscar manualmente",
            onPress: () => setEtapa("livro"),
          },
          {
            text: "📖 Cadastrar livro",
            onPress: () => {
              setModalForm(false);
              navigation.navigate("Livros", { isbnParaCadastrar: codigoLimpo });
            },
          },
        ]
      );
    }
  };

  const confirmarEmprestimo = async () => {
    if (!livroSelecionado || !pessoaSelecionada) return;
    setSalvando(true);

    const hoje = new Date();
    const prevista = new Date();
    prevista.setDate(hoje.getDate() + parseInt(diasPrazo));

    await criarEmprestimo({
      livroId: livroSelecionado.id!,
      nomeLivro: livroSelecionado.titulo,
      pessoaId: pessoaSelecionada.id!,
      nomePessoa: pessoaSelecionada.nome,
      telefonePessoa: pessoaSelecionada.telefone,
      dataEmprestimo: hoje.toISOString(),
      dataPrevista: prevista.toISOString(),
      dataDevolucao: null,
      diasPrazo: parseInt(diasPrazo),
      status: "Emprestado",
    });

    setSalvando(false);
    setModalForm(false);
    Alert.alert("✅ Empréstimo registrado!", `"${livroSelecionado.titulo}" emprestado para ${pessoaSelecionada.nome}.`);
    carregar();
  };

  const devolver = (emp: Emprestimo) => {
    Alert.alert(
      "Confirmar devolução",
      `Devolver "${emp.nomeLivro}" de ${emp.nomePessoa}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar",
          onPress: async () => {
            await registrarDevolucao(emp.id!);
            carregar();
          },
        },
      ]
    );
  };

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

  const isAtrasado = (emp: Emprestimo) =>
    emp.status === "Emprestado" && new Date(emp.dataPrevista) < new Date();

  const empFiltrados = emprestimos
    .filter((e) => {
      if (filtro === "ativos") return e.status === "Emprestado";
      if (filtro === "atrasados") return isAtrasado(e);
      return true;
    })
    .filter((e) =>
      `${e.nomeLivro} ${e.nomePessoa}`.toLowerCase().includes(busca.toLowerCase())
    )
    .sort((a, b) => new Date(b.dataEmprestimo).getTime() - new Date(a.dataEmprestimo).getTime());

  const livrosDisponiveis = livros.filter(
    (l) =>
      l.status === "Disponível" &&
      l.titulo.toLowerCase().includes(buscaLivro.toLowerCase())
  );

  const pessoasFiltradas = pessoas.filter((p) =>
    p.nome.toLowerCase().includes(buscaPessoa.toLowerCase())
  );

  return (
    <View style={s.container}>
      {/* HEADER */}
      <View style={s.header}>
        <Text style={s.titulo}>📋 Empréstimos</Text>
        <Text style={s.subtitulo}>{emprestimos.length} registros</Text>
      </View>

      {/* BUSCA */}
      <TextInput
        placeholder="Buscar por livro ou pessoa..."
        value={busca}
        onChangeText={setBusca}
        style={s.input}
        placeholderTextColor="#aaa"
      />

      {/* FILTROS */}
      <View style={s.filtros}>
        {(["todos", "ativos", "atrasados"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filtroBtn, filtro === f && s.filtroBtnAtivo]}
            onPress={() => setFiltro(f)}
          >
            <Text style={[s.filtroTxt, filtro === f && s.filtroTxtAtivo]}>
              {f === "todos" ? "Todos" : f === "ativos" ? "Ativos" : "Atrasados"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* BOTÕES */}
      <View style={s.row}>
        <TouchableOpacity style={s.btn} onPress={abrirForm}>
          <Text style={s.btnText}>📷 Novo empréstimo</Text>
        </TouchableOpacity>
        <View style={{ width: 10 }} />
        <TouchableOpacity
          style={[s.btn, s.btnOutline]}
          onPress={() => {
            setLivroSelecionado(null);
            setPessoaSelecionada(null);
            setDiasPrazo("14");
            setBuscaLivro("");
            setBuscaPessoa("");
            setEtapa("livro");
            setModalForm(true);
          }}
        >
          <Text style={[s.btnText, { color: VERDE }]}>✏️ Manual</Text>
        </TouchableOpacity>
      </View>

      {/* LISTA */}
      {loading ? (
        <ActivityIndicator color={VERDE} size="large" style={{ marginTop: 40 }} />
      ) : empFiltrados.length === 0 ? (
        <View style={s.vazio}>
          <Text style={s.vazioTxt}>Nenhum empréstimo encontrado</Text>
        </View>
      ) : (
        <FlatList
          data={empFiltrados}
          keyExtractor={(i) => i.id!}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => {
            const atrasado = isAtrasado(item);
            const devolvido = item.status === "Devolvido";
            const diasAtraso = atrasado
              ? Math.floor(
                (new Date().getTime() - new Date(item.dataPrevista).getTime()) / 86400000
              )
              : 0;

            return (
              <View style={[s.card, atrasado && s.cardAtrasado]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardLivro} numberOfLines={1}>📖 {item.nomeLivro}</Text>
                  <Text style={s.cardPessoa}>👤 {item.nomePessoa}</Text>
                  <Text style={s.cardMeta}>Emprestado: {fmt(item.dataEmprestimo)}</Text>
                  <Text style={s.cardMeta}>Prazo: {fmt(item.dataPrevista)}</Text>
                  {devolvido && item.dataDevolucao && (
                    <Text style={s.cardMeta}>Devolvido: {fmt(item.dataDevolucao)}</Text>
                  )}
                  <View style={s.badgeRow}>
                    <View style={[s.badge, {
                      backgroundColor: devolvido ? "#E1F5EE" : atrasado ? "#FCEBEB" : "#FAEEDA",
                    }]}>
                      <Text style={{
                        fontSize: 11, fontWeight: "500",
                        color: devolvido ? VERDE : atrasado ? VERMELHO : AMBER,
                      }}>
                        {devolvido ? "✓ Devolvido" : atrasado ? `⚠ ${diasAtraso}d em atraso` : "📚 Emprestado"}
                      </Text>
                    </View>
                    {!devolvido && (
                      <TouchableOpacity style={s.btnDevolver} onPress={() => devolver(item)}>
                        <Text style={s.btnDevolverTxt}>Devolver</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* MODAL SCANNER */}
      <Modal
        visible={modalScanner}
        animationType="slide"
        onRequestClose={() => { setModalScanner(false); setScanAtivo(false); }}
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={scanAtivo ? onScan : undefined}
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "ean8", "code128", "code39", "qr"],
            }}
          />
          <View style={s.scanOverlay}>
            <View style={s.scanFrame} />
            <Text style={s.scanTxt}>Aponte para o código de barras do livro</Text>
          </View>
          <TouchableOpacity
            style={s.scanFechar}
            onPress={() => {
              setModalScanner(false);
              setScanAtivo(false);
            }}
          >
            <Text style={{ color: "#fff", fontSize: 16 }}>✕ Fechar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.scanManual}
            onPress={() => {
              setModalScanner(false);
              setScanAtivo(false);
              setEtapa("livro");
              setModalForm(true);
            }}
          >
            <Text style={{ color: "#fff", fontSize: 14 }}>✏️ Selecionar manualmente</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* MODAL FORMULÁRIO */}
      <Modal
        visible={modalForm}
        animationType="slide"
        onRequestClose={() => setModalForm(false)}
      >
        <View style={s.modal}>
          {/* Buscando livro após scan */}
          {buscandoLivro && (
            <View style={s.buscandoRow}>
              <ActivityIndicator color={VERDE} />
              <Text style={{ marginLeft: 8, color: VERDE }}>Buscando livro no acervo...</Text>
            </View>
          )}

          {/* Etapa 1 — Escolher livro */}
          {etapa === "livro" && (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <Text style={s.modalTitle}>📖 Escolha o livro</Text>
              <TextInput
                placeholder="Buscar livro..."
                value={buscaLivro}
                onChangeText={setBuscaLivro}
                style={s.input}
                placeholderTextColor="#aaa"
              />
              {livrosDisponiveis.length === 0 ? (
                <Text style={{ color: "#aaa", textAlign: "center", marginTop: 20 }}>
                  Nenhum livro disponível
                </Text>
              ) : (
                livrosDisponiveis.map((l) => (
                  <TouchableOpacity
                    key={l.id}
                    style={[s.opcaoCard, livroSelecionado?.id === l.id && s.opcaoCardAtivo]}
                    onPress={() => setLivroSelecionado(l)}
                  >
                    <Text style={s.opcaoTitulo}>{l.titulo}</Text>
                    <Text style={s.opcaoSub}>{l.autor}</Text>
                  </TouchableOpacity>
                ))
              )}
              <View style={[s.row, { marginTop: 16 }]}>
                <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setModalForm(false)}>
                  <Text style={[s.btnText, { color: VERDE }]}>Cancelar</Text>
                </TouchableOpacity>
                <View style={{ width: 10 }} />
                <TouchableOpacity
                  style={[s.btn, !livroSelecionado && s.btnDisabled]}
                  onPress={() => livroSelecionado && setEtapa("pessoa")}
                  disabled={!livroSelecionado}
                >
                  <Text style={s.btnText}>Próximo →</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* Etapa 2 — Escolher pessoa */}
          {etapa === "pessoa" && (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <Text style={s.modalTitle}>👤 Escolha a pessoa</Text>

              {/* Livro selecionado — resumo */}
              {livroSelecionado && (
                <View style={s.livroSelecionadoCard}>
                  <Text style={s.livroSelecionadoTxt}>📖 {livroSelecionado.titulo}</Text>
                </View>
              )}

              <TextInput
                placeholder="Buscar pessoa..."
                value={buscaPessoa}
                onChangeText={setBuscaPessoa}
                style={s.input}
                placeholderTextColor="#aaa"
              />
              {pessoasFiltradas.length === 0 ? (
                <Text style={{ color: "#aaa", textAlign: "center", marginTop: 20 }}>
                  Nenhuma pessoa cadastrada
                </Text>
              ) : (
                pessoasFiltradas.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.opcaoCard, pessoaSelecionada?.id === p.id && s.opcaoCardAtivo]}
                    onPress={() => setPessoaSelecionada(p)}
                  >
                    <Text style={s.opcaoTitulo}>{p.nome}</Text>
                    <Text style={s.opcaoSub}>📞 {p.telefone}</Text>
                  </TouchableOpacity>
                ))
              )}
              <View style={[s.row, { marginTop: 16 }]}>
                <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setEtapa("livro")}>
                  <Text style={[s.btnText, { color: VERDE }]}>← Voltar</Text>
                </TouchableOpacity>
                <View style={{ width: 10 }} />
                <TouchableOpacity
                  style={[s.btn, !pessoaSelecionada && s.btnDisabled]}
                  onPress={() => pessoaSelecionada && setEtapa("confirmar")}
                  disabled={!pessoaSelecionada}
                >
                  <Text style={s.btnText}>Próximo →</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* Etapa 3 — Confirmar */}
          {etapa === "confirmar" && (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              <Text style={s.modalTitle}>✅ Confirmar empréstimo</Text>
              <View style={s.resumoCard}>
                <Text style={s.resumoLabel}>Livro</Text>
                <Text style={s.resumoValor}>{livroSelecionado?.titulo}</Text>
                <Text style={s.resumoLabel}>Autor</Text>
                <Text style={s.resumoValor}>{livroSelecionado?.autor}</Text>
                <Text style={s.resumoLabel}>Pessoa</Text>
                <Text style={s.resumoValor}>{pessoaSelecionada?.nome}</Text>
                <Text style={s.resumoLabel}>Telefone</Text>
                <Text style={s.resumoValor}>{pessoaSelecionada?.telefone}</Text>
              </View>

              <Text style={s.label}>Prazo em dias</Text>
              <View style={s.prazosRow}>
                {["7", "14", "30"].map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[s.prazoBtn, diasPrazo === d && s.prazoBtnAtivo]}
                    onPress={() => setDiasPrazo(d)}
                  >
                    <Text style={[s.prazoTxt, diasPrazo === d && s.prazoTxtAtivo]}>{d}d</Text>
                  </TouchableOpacity>
                ))}
                <TextInput
                  style={s.prazoInput}
                  placeholder="Outro"
                  keyboardType="numeric"
                  value={!["7", "14", "30"].includes(diasPrazo) ? diasPrazo : ""}
                  onChangeText={(v) => setDiasPrazo(v)}
                  placeholderTextColor="#aaa"
                />
              </View>

              <View style={[s.row, { marginTop: 16 }]}>
                <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setEtapa("pessoa")}>
                  <Text style={[s.btnText, { color: VERDE }]}>← Voltar</Text>
                </TouchableOpacity>
                <View style={{ width: 10 }} />
                <TouchableOpacity style={s.btn} onPress={confirmarEmprestimo} disabled={salvando}>
                  {salvando ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.btnText}>✅ Confirmar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
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
    backgroundColor: "#fff", margin: 10, padding: 12,
    borderRadius: 10, fontSize: 14, color: "#1a1a18",
  },
  filtros: { flexDirection: "row", paddingHorizontal: 10, gap: 8, marginBottom: 4 },
  filtroBtn: {
    flex: 1, padding: 8, borderRadius: 8, alignItems: "center",
    backgroundColor: "#fff", borderWidth: 0.5, borderColor: "#ddd",
  },
  filtroBtnAtivo: { backgroundColor: VERDE },
  filtroTxt: { fontSize: 12, color: "#666", fontWeight: "500" },
  filtroTxtAtivo: { color: "#fff" },
  row: { flexDirection: "row", paddingHorizontal: 10, marginBottom: 4 },
  btn: { backgroundColor: VERDE, padding: 12, borderRadius: 10, flex: 1, alignItems: "center" },
  btnOutline: { backgroundColor: "#fff", borderWidth: 1, borderColor: VERDE },
  btnDisabled: { backgroundColor: "#ccc" },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  vazio: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 60 },
  vazioTxt: { fontSize: 16, color: "#555" },
  card: {
    backgroundColor: "#fff", marginBottom: 10, padding: 14,
    borderRadius: 12, borderWidth: 0.5, borderColor: "#e0e0e0",
  },
  cardAtrasado: { borderLeftWidth: 3, borderLeftColor: VERMELHO },
  cardLivro: { fontWeight: "bold", fontSize: 14, color: "#1a1a18" },
  cardPessoa: { fontSize: 13, color: "#444", marginTop: 2 },
  cardMeta: { fontSize: 11, color: "#aaa", marginTop: 2 },
  badgeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  btnDevolver: { backgroundColor: "#E1F5EE", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  btnDevolverTxt: { color: VERDE, fontWeight: "600", fontSize: 12 },
  modal: { flex: 1, backgroundColor: "#f4f4f2", padding: 20, paddingTop: 50 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#1a1a18", marginBottom: 16 },
  buscandoRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#E1F5EE",
    padding: 12, borderRadius: 10, marginBottom: 16,
  },
  livroSelecionadoCard: {
    backgroundColor: "#E1F5EE", padding: 12, borderRadius: 10,
    marginBottom: 12, borderLeftWidth: 3, borderLeftColor: VERDE,
  },
  livroSelecionadoTxt: { color: VERDE, fontWeight: "600", fontSize: 14 },
  opcaoCard: {
    backgroundColor: "#fff", padding: 14, borderRadius: 12,
    marginBottom: 8, borderWidth: 1, borderColor: "#e0e0e0",
  },
  opcaoCardAtivo: { borderColor: VERDE, backgroundColor: "#E1F5EE" },
  opcaoTitulo: { fontWeight: "bold", fontSize: 14, color: "#1a1a18" },
  opcaoSub: { fontSize: 12, color: "#666", marginTop: 2 },
  resumoCard: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    marginBottom: 16, borderWidth: 0.5, borderColor: "#e0e0e0",
  },
  resumoLabel: { fontSize: 11, color: "#aaa", marginTop: 8, fontWeight: "500" },
  resumoValor: { fontSize: 14, color: "#1a1a18", fontWeight: "500" },
  prazosRow: { flexDirection: "row", gap: 8, paddingHorizontal: 10, marginBottom: 8 },
  prazoBtn: {
    flex: 1, padding: 10, borderRadius: 8, alignItems: "center",
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd",
  },
  prazoBtnAtivo: { backgroundColor: VERDE, borderColor: VERDE },
  prazoTxt: { fontWeight: "600", color: "#666" },
  prazoTxtAtivo: { color: "#fff" },
  prazoInput: {
    flex: 1, backgroundColor: "#fff", borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: "#ddd", fontSize: 14, color: "#1a1a18", textAlign: "center",
  },
  label: { fontSize: 12, color: "#666", marginBottom: 4, fontWeight: "500", paddingHorizontal: 10 },
  scanOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
  },
  scanFrame: {
    width: 250, height: 150, borderWidth: 2,
    borderColor: VERDE, borderRadius: 12, marginBottom: 20,
  },
  scanTxt: {
    color: "#fff", fontSize: 14, textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)", padding: 8, borderRadius: 8,
  },
  scanFechar: {
    position: "absolute", top: 50, right: 20,
    backgroundColor: "rgba(0,0,0,0.6)", padding: 10, borderRadius: 20,
  },
  scanManual: {
    position: "absolute", bottom: 50, alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)", padding: 12,
    borderRadius: 20, paddingHorizontal: 20,
  },
});