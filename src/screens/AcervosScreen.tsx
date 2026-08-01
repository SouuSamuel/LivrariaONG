import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Image,
} from "react-native";
import {
  buscarLivrosPagina,
  buscarLivrosPorTexto,
  livroTemExemplarDisponivel,
} from "../services/livros";
import { buscarEmprestimos } from "../services/emprestimos";
import { Livro, Emprestimo } from "../types";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

const VERDE = "#1D9E75";
const AMBER = "#BA7517";

export default function AcervoScreen({ navigation }: any) {
  const [livros, setLivros] = useState<Livro[]>([]);
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "disponivel" | "emprestado">("todos");
  const [livroDetalhe, setLivroDetalhe] = useState<Livro | null>(null);
  const [erro, setErro] = useState("");
  const [ultimoDoc, setUltimoDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => carregar(busca, filtro), 350);
    return () => clearTimeout(timer);
  }, [busca, filtro]);

  const carregar = async (termo = "", filtroAtual = filtro) => {
    setLoading(true);
    setErro("");
    try {
      const empsPromise = buscarEmprestimos();
      const precisaAcervoCompleto = termo.trim() || filtroAtual !== "todos";
      const livsPromise = precisaAcervoCompleto
        ? buscarLivrosPorTexto(termo)
        : buscarLivrosPagina();
      const [livsResultado, emps] = await Promise.all([livsPromise, empsPromise]);

      if (Array.isArray(livsResultado)) {
        setLivros(livsResultado);
        setUltimoDoc(null);
        setTemMais(false);
      } else {
        setLivros(livsResultado.livros);
        setUltimoDoc(livsResultado.ultimoDoc);
        setTemMais(livsResultado.temMais);
      }
      setEmprestimos(emps);
    } catch (e) {
      console.log("Erro ao carregar acervo:", e);
      setErro("Não foi possível carregar o acervo.");
    } finally {
      setLoading(false);
    }
  };

  const carregarMais = async () => {
    if (!temMais || carregandoMais || busca.trim() || filtro !== "todos") return;
    setCarregandoMais(true);
    try {
      const pagina = await buscarLivrosPagina(ultimoDoc);
      setLivros((atuais) => [...atuais, ...pagina.livros]);
      setUltimoDoc(pagina.ultimoDoc);
      setTemMais(pagina.temMais);
    } catch (e) {
      console.log("Erro ao carregar mais livros do acervo:", e);
      setErro("Não foi possível carregar mais livros.");
    } finally {
      setCarregandoMais(false);
    }
  };

  const isDisponivel = (livro: Livro) => {
    return livroTemExemplarDisponivel(livro, emprestimos);
  };

  const livrosFiltrados = livros
    .filter((l) => {
      if (filtro === "disponivel") return isDisponivel(l);
      if (filtro === "emprestado") return !isDisponivel(l);
      return true;
    })
    .filter((l) =>
      `${l.titulo} ${l.autor} ${l.categoria}`
        .toLowerCase()
        .includes(busca.toLowerCase())
    );

  const stats = {
    total: livros.length,
    disponiveis: livros.filter(isDisponivel).length,
    emprestados: livros.filter((l) => !isDisponivel(l)).length,
  };

  return (
    <View style={s.container}>
      {/* HEADER */}
      <View style={s.header}>
        <TouchableOpacity style={s.voltarBtn} onPress={() => navigation.goBack()}>
          <Text style={s.voltarTxt}>← Voltar</Text>
        </TouchableOpacity>
        <Text style={s.titulo}>📚 Acervo</Text>
        <Text style={s.subtitulo}>{livros.length} livros cadastrados</Text>
      </View>

      {/* STATS */}
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={[s.statNum, { color: VERDE }]}>{stats.total}</Text>
          <Text style={s.statLbl}>Total</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statNum, { color: VERDE }]}>{stats.disponiveis}</Text>
          <Text style={s.statLbl}>Disponíveis</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statNum, { color: AMBER }]}>{stats.emprestados}</Text>
          <Text style={s.statLbl}>Emprestados</Text>
        </View>
      </View>

      {/* BUSCA */}
      <TextInput
        placeholder="Buscar por título, autor ou categoria..."
        value={busca}
        onChangeText={setBusca}
        style={s.input}
        placeholderTextColor="#aaa"
      />

      {/* FILTROS */}
      <View style={s.filtros}>
        {[
          { key: "todos", label: "Todos" },
          { key: "disponivel", label: "✅ Disponíveis" },
          { key: "emprestado", label: "📤 Emprestados" },
        ].map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[s.filtroBtn, filtro === f.key && s.filtroBtnAtivo]}
            onPress={() => setFiltro(f.key as any)}
          >
            <Text style={[s.filtroTxt, filtro === f.key && s.filtroTxtAtivo]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* LISTA */}
      {loading ? (
        <ActivityIndicator color={VERDE} size="large" style={{ marginTop: 40 }} />
      ) : erro ? (
        <View style={s.vazio}>
          <Text style={s.vazioTxt}>{erro}</Text>
          <TouchableOpacity style={[s.filtroBtnAtivo, { marginTop: 12, padding: 12, borderRadius: 10 }]} onPress={() => carregar(busca, filtro)}>
            <Text style={s.filtroTxtAtivo}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : livrosFiltrados.length === 0 ? (
        <View style={s.vazio}>
          <Text style={s.vazioIcone}>📭</Text>
          <Text style={s.vazioTxt}>Nenhum livro encontrado</Text>
        </View>
      ) : (
        <FlatList
          data={livrosFiltrados}
          keyExtractor={(i) => i.id!}
          contentContainerStyle={{ padding: 12 }}
          onEndReached={carregarMais}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            carregandoMais ? (
              <ActivityIndicator color={VERDE} style={{ marginVertical: 16 }} />
            ) : null
          }
          renderItem={({ item }) => {
            const disponivel = isDisponivel(item);
            return (
              <TouchableOpacity
                style={s.card}
                onPress={() => setLivroDetalhe(item)}
              >
                {item.imagem ? (
                  <Image source={{ uri: item.imagem }} style={s.capa} />
                ) : (
                  <View style={[s.capa, s.capaVazia]}>
                    <Text style={{ fontSize: 28 }}>📖</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitulo} numberOfLines={2}>{item.titulo}</Text>
                  <Text style={s.cardAutor}>{item.autor}</Text>
                  {item.categoria ? (
                    <Text style={s.cardCategoria}>{item.categoria}</Text>
                  ) : null}
                  <View style={[
                    s.badge,
                    { backgroundColor: disponivel ? "#E1F5EE" : "#FAEEDA" }
                  ]}>
                    <Text style={{
                      fontSize: 11, fontWeight: "600",
                      color: disponivel ? "#0F6E56" : AMBER,
                    }}>
                      {disponivel ? "✅ Disponível" : "📤 Emprestado"}
                    </Text>
                  </View>
                </View>
                <Text style={s.seta}>›</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* MODAL DETALHE */}
      <Modal
        visible={!!livroDetalhe}
        animationType="slide"
        onRequestClose={() => setLivroDetalhe(null)}
      >
        {livroDetalhe && (
          <ScrollView style={s.modal} contentContainerStyle={{ paddingBottom: 40 }}>
            <TouchableOpacity
              style={s.modalFechar}
              onPress={() => setLivroDetalhe(null)}
            >
              <Text style={s.modalFecharTxt}>← Voltar</Text>
            </TouchableOpacity>

            {livroDetalhe.imagem ? (
              <Image
                source={{ uri: livroDetalhe.imagem }}
                style={s.capaDetalhe}
                resizeMode="contain"
              />
            ) : (
              <View style={[s.capaDetalhe, s.capaVazia]}>
                <Text style={{ fontSize: 64 }}>📖</Text>
              </View>
            )}

            {/* STATUS DESTAQUE */}
            <View style={[
              s.statusDetalhe,
              {
                backgroundColor: isDisponivel(livroDetalhe) ? "#E1F5EE" : "#FAEEDA",
                borderColor: isDisponivel(livroDetalhe) ? VERDE : AMBER,
              }
            ]}>
              <Text style={{
                fontSize: 16, fontWeight: "bold",
                color: isDisponivel(livroDetalhe) ? "#0F6E56" : AMBER,
                textAlign: "center",
              }}>
                {isDisponivel(livroDetalhe)
                  ? "✅ Disponível para empréstimo"
                  : "📤 Emprestado no momento"}
              </Text>
            </View>

            {/* INFOS */}
            <View style={s.infoCard}>
              {[
                { label: "Título", valor: livroDetalhe.titulo },
                { label: "Autor", valor: livroDetalhe.autor },
                { label: "Editora", valor: livroDetalhe.editora },
                { label: "Categoria", valor: livroDetalhe.categoria },
                { label: "ISBN", valor: livroDetalhe.isbn },
              ].filter(i => i.valor).map((item) => (
                <View key={item.label} style={s.infoRow}>
                  <Text style={s.infoLabel}>{item.label}</Text>
                  <Text style={s.infoValor}>{item.valor}</Text>
                </View>
              ))}
            </View>

            <Text style={s.infoRodape}>
              Para emprestar este livro, fale com o administrador da biblioteca.
            </Text>
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6F8" },
  header: { backgroundColor: VERDE, padding: 20, paddingTop: 50 },
  voltarBtn: { marginBottom: 8 },
  voltarTxt: { color: "rgba(255,255,255,0.8)", fontSize: 14 },
  titulo: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  subtitulo: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 2 },
  statsRow: { flexDirection: "row", padding: 12, gap: 8 },
  statCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 12,
    padding: 12, alignItems: "center",
    borderWidth: 0.5, borderColor: "#e0e0e0",
  },
  statNum: { fontSize: 24, fontWeight: "bold" },
  statLbl: { fontSize: 11, color: "#888", marginTop: 2 },
  input: {
    backgroundColor: "#fff", margin: 10, padding: 12,
    borderRadius: 10, fontSize: 14, color: "#1a1a18",
  },
  filtros: { flexDirection: "row", paddingHorizontal: 10, gap: 6, marginBottom: 4 },
  filtroBtn: {
    flex: 1, padding: 7, borderRadius: 8, alignItems: "center",
    backgroundColor: "#fff", borderWidth: 0.5, borderColor: "#ddd",
  },
  filtroBtnAtivo: { backgroundColor: VERDE },
  filtroTxt: { fontSize: 11, color: "#666", fontWeight: "500" },
  filtroTxtAtivo: { color: "#fff" },
  vazio: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 60 },
  vazioIcone: { fontSize: 48, marginBottom: 12 },
  vazioTxt: { fontSize: 16, color: "#555" },
  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", marginBottom: 10, padding: 12,
    borderRadius: 12, gap: 12,
    borderWidth: 0.5, borderColor: "#e0e0e0",
  },
  capa: { width: 60, height: 80, borderRadius: 8 },
  capaVazia: {
    backgroundColor: "#f0f0f0",
    alignItems: "center", justifyContent: "center",
  },
  cardTitulo: { fontSize: 14, fontWeight: "bold", color: "#1a1a18" },
  cardAutor: { fontSize: 12, color: "#666", marginTop: 2 },
  cardCategoria: { fontSize: 11, color: "#aaa", marginTop: 2 },
  badge: {
    alignSelf: "flex-start", paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 100, marginTop: 6,
  },
  seta: { fontSize: 22, color: "#ccc" },
  modal: { flex: 1, backgroundColor: "#F4F6F8", padding: 20, paddingTop: 50 },
  modalFechar: { marginBottom: 16 },
  modalFecharTxt: { color: VERDE, fontSize: 16, fontWeight: "600" },
  capaDetalhe: {
    width: "100%", height: 200, borderRadius: 14,
    marginBottom: 16, backgroundColor: "#f0f0f0",
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
  },
  infoLabel: { fontSize: 13, color: "#888" },
  infoValor: { fontSize: 13, fontWeight: "500", color: "#1a1a18", maxWidth: "60%", textAlign: "right" },
  infoRodape: {
    textAlign: "center", color: "#aaa",
    fontSize: 13, fontStyle: "italic",
  },
});
