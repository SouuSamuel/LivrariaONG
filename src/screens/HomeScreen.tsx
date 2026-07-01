import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { buscarLivros } from "../services/livros";
import { buscarPessoas } from "../services/pessoas";
import { buscarEmprestimos } from "../services/emprestimos";
import { Emprestimo } from "../types";
import { Alert } from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";

const VERDE = "#1D9E75";
const AMBER = "#BA7517";
const VERMELHO = "#A32D2D";
const AZUL = "#185FA5";

export default function HomeScreen({ navigation }: any) {
  const [stats, setStats] = useState({
    livros: 0,
    pessoas: 0,
    ativos: 0,
    atrasados: 0,
  });
  const [atrasados, setAtrasados] = useState<Emprestimo[]>([]);
  const [ativos, setAtivos] = useState<Emprestimo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const carregar = async () => {
    try {
      const [livros, pessoas, emprestimos] = await Promise.all([
        buscarLivros(),
        buscarPessoas(),
        buscarEmprestimos(),
      ]);

      const hoje = new Date();
      const empsAtivos = emprestimos.filter((e) => e.status === "Emprestado");
      const empsAtrasados = empsAtivos.filter(
        (e) => new Date(e.dataPrevista) < hoje
      );

      setStats({
        livros: livros.length,
        pessoas: pessoas.length,
        ativos: empsAtivos.length,
        atrasados: empsAtrasados.length,
      });

      setAtrasados(
        empsAtrasados.sort(
          (a, b) =>
            new Date(a.dataPrevista).getTime() -
            new Date(b.dataPrevista).getTime()
        )
      );

      setAtivos(
        empsAtivos
          .filter((e) => new Date(e.dataPrevista) >= hoje)
          .sort(
            (a, b) =>
              new Date(a.dataPrevista).getTime() -
              new Date(b.dataPrevista).getTime()
          )
      );
    } catch (e) {
      console.log("Erro ao carregar home:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  {/* HEADER */ }
  <View style={s.header}>
    <View>
      <Text style={s.headerTitulo}>📚 BiblioONG</Text>
      <Text style={s.headerSub}>Sistema de empréstimos</Text>
    </View>
    <TouchableOpacity
      style={s.headerBadge}
      onPress={() =>
        Alert.alert("Sair", "Deseja sair da conta ADM?", [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Sair",
            style: "destructive",
            onPress: () => signOut(auth),
          },
        ])
      }
    >
      <Text style={s.headerBadgeTxt}>🔐 Sair</Text>
    </TouchableOpacity>
  </View>

  // Recarrega toda vez que a tela recebe foco
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      carregar();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    carregar();
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR");

  const diasAtraso = (dataPrevista: string) =>
    Math.floor(
      (new Date().getTime() - new Date(dataPrevista).getTime()) / 86400000
    );

  const diasRestantes = (dataPrevista: string) =>
    Math.ceil(
      (new Date(dataPrevista).getTime() - new Date().getTime()) / 86400000
    );

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={VERDE} />
        <Text style={s.loadingTxt}>Carregando...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={VERDE} />
      }
    >
      {/* HEADER */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitulo}>📚 BiblioONG</Text>
          <Text style={s.headerSub}>Sistema de empréstimos</Text>
        </View>
        <TouchableOpacity
          style={s.headerBadge}
          onPress={() =>
            Alert.alert("Sair", "Deseja sair da conta ADM?", [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Sair",
                style: "destructive",
                onPress: () => signOut(auth),
              },
            ])
          }
        >
          <Text style={s.headerBadgeTxt}>ADM</Text>
        </TouchableOpacity>
      </View>

      {/* ALERTA DE ATRASO */}
      {atrasados.length > 0 && (
        <TouchableOpacity
          style={s.alerta}
          onPress={() => navigation.navigate("Empréstimos")}
        >
          <Text style={s.alertaIcone}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.alertaTitulo}>
              {atrasados.length} livro{atrasados.length > 1 ? "s" : ""} em atraso
            </Text>
            <Text style={s.alertaSub}>Toque para ver os detalhes</Text>
          </View>
          <Text style={s.alertaSeta}>›</Text>
        </TouchableOpacity>
      )}

      {/* STATS */}
      <View style={s.statsGrid}>
        {[
          { label: "Livros", valor: stats.livros, cor: VERDE, icone: "📚" },
          { label: "Pessoas", valor: stats.pessoas, cor: AZUL, icone: "👤" },
          { label: "Emprestados", valor: stats.ativos, cor: AMBER, icone: "📋" },
          { label: "Atrasados", valor: stats.atrasados, cor: VERMELHO, icone: "⚠️" },
        ].map((item) => (
          <View key={item.label} style={s.statCard}>
            <Text style={s.statIcone}>{item.icone}</Text>
            <Text style={[s.statNum, { color: item.cor }]}>{item.valor}</Text>
            <Text style={s.statLbl}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* AÇÕES RÁPIDAS */}
      <Text style={s.sectionLabel}>Ações rápidas</Text>
      <View style={s.acoesGrid}>
        {[
          { icone: "📥", label: "Novo\nempréstimo", tela: "Empréstimos", cor: "#E1F5EE", corIcone: VERDE },
          { icone: "📤", label: "Registrar\ndevolução", tela: "Empréstimos", cor: "#FAEEDA", corIcone: AMBER },
          { icone: "📖", label: "Cadastrar\nlivro", tela: "Livros", cor: "#E6F1FB", corIcone: AZUL },
          { icone: "👤", label: "Cadastrar\npessoa", tela: "Pessoas", cor: "#F3E8FF", corIcone: "#7C3AED" },
        ].map((item) => (
          <TouchableOpacity
            key={item.label}
            style={[s.acaoCard, { backgroundColor: item.cor }]}
            onPress={() => navigation.navigate(item.tela)}
          >
            <Text style={s.acaoIcone}>{item.icone}</Text>
            <Text style={[s.acaoLabel, { color: item.corIcone }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* LIVROS EM ATRASO */}
      {atrasados.length > 0 && (
        <>
          <Text style={s.sectionLabel}>⚠️ Em atraso</Text>
          {atrasados.map((e) => (
            <View key={e.id} style={s.empCard}>
              <View style={s.empCardLeft}>
                <View style={[s.empIcone, { backgroundColor: "#FCEBEB" }]}>
                  <Text style={{ fontSize: 16 }}>📖</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.empLivro} numberOfLines={1}>{e.nomeLivro}</Text>
                <Text style={s.empPessoa}>👤 {e.nomePessoa}</Text>
                <Text style={s.empData}>📞 {e.telefonePessoa || "—"}</Text>
                <Text style={s.empData}>Prazo: {fmt(e.dataPrevista)}</Text>
              </View>
              <View style={s.empBadgeAtraso}>
                <Text style={s.empBadgeAtrasoTxt}>
                  {diasAtraso(e.dataPrevista)}d
                </Text>
              </View>
            </View>
          ))}
        </>
      )}

      {/* EMPRÉSTIMOS ATIVOS */}
      {ativos.length > 0 && (
        <>
          <Text style={s.sectionLabel}>📋 Empréstimos ativos</Text>
          {ativos.slice(0, 5).map((e) => (
            <View key={e.id} style={s.empCard}>
              <View style={s.empCardLeft}>
                <View style={[s.empIcone, { backgroundColor: "#FAEEDA" }]}>
                  <Text style={{ fontSize: 16 }}>📖</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.empLivro} numberOfLines={1}>{e.nomeLivro}</Text>
                <Text style={s.empPessoa}>👤 {e.nomePessoa}</Text>
                <Text style={s.empData}>Devolução: {fmt(e.dataPrevista)}</Text>
              </View>
              <View style={s.empBadgeAtivo}>
                <Text style={s.empBadgeAtivoTxt}>
                  {diasRestantes(e.dataPrevista)}d
                </Text>
              </View>
            </View>
          ))}
          {ativos.length > 5 && (
            <TouchableOpacity
              style={s.verMais}
              onPress={() => navigation.navigate("Empréstimos")}
            >
              <Text style={s.verMaisTxt}>
                Ver todos os {ativos.length} empréstimos ativos →
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ESTADO VAZIO */}
      {atrasados.length === 0 && ativos.length === 0 && (
        <View style={s.vazio}>
          <Text style={s.vazioTitulo}>Tudo em dia!</Text>
          <Text style={s.vazioSub}>Nenhum empréstimo ativo no momento</Text>
        </View>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6F8" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F4F6F8" },
  loadingTxt: { color: "#888", marginTop: 12, fontSize: 14 },
  header: {
    backgroundColor: VERDE,
    padding: 20,
    paddingTop: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitulo: { color: "#fff", fontSize: 22, fontWeight: "bold" },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 2 },
  headerBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  headerBadgeTxt: { color: "#fff", fontSize: 12, fontWeight: "600" },
  alerta: {
    backgroundColor: "#FCEBEB",
    margin: 12,
    padding: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderLeftWidth: 4,
    borderLeftColor: VERMELHO,
  },
  alertaIcone: { fontSize: 20 },
  alertaTitulo: { fontSize: 14, fontWeight: "600", color: VERMELHO },
  alertaSub: { fontSize: 12, color: "#c0392b", marginTop: 2 },
  alertaSeta: { fontSize: 22, color: VERMELHO },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 10,
  },
  statCard: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: "#e0e0e0",
  },
  statIcone: { fontSize: 24, marginBottom: 6 },
  statNum: { fontSize: 28, fontWeight: "bold" },
  statLbl: { fontSize: 12, color: "#888", marginTop: 2 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#888",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  acoesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    gap: 10,
  },
  acaoCard: {
    width: "47%",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 90,
  },
  acaoIcone: { fontSize: 28, marginBottom: 6 },
  acaoLabel: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  empCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    gap: 10,
    borderWidth: 0.5,
    borderColor: "#e0e0e0",
  },
  empCardLeft: {},
  empIcone: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  empLivro: { fontSize: 13, fontWeight: "600", color: "#1a1a18" },
  empPessoa: { fontSize: 12, color: "#555", marginTop: 2 },
  empData: { fontSize: 11, color: "#aaa", marginTop: 1 },
  empBadgeAtraso: {
    backgroundColor: "#FCEBEB",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
    alignItems: "center",
  },
  empBadgeAtrasoTxt: { color: VERMELHO, fontWeight: "bold", fontSize: 13 },
  empBadgeAtivo: {
    backgroundColor: "#FAEEDA",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
    alignItems: "center",
  },
  empBadgeAtivoTxt: { color: AMBER, fontWeight: "bold", fontSize: 13 },
  verMais: {
    marginHorizontal: 12,
    marginTop: 4,
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: "#e0e0e0",
  },
  verMaisTxt: { color: VERDE, fontSize: 13, fontWeight: "600" },
  vazio: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    marginTop: 20,
  },
  vazioIcone: { fontSize: 48, marginBottom: 12 },
  vazioTitulo: { fontSize: 18, fontWeight: "600", color: "#1a1a18" },
  vazioSub: { fontSize: 14, color: "#888", marginTop: 4, textAlign: "center" },
});