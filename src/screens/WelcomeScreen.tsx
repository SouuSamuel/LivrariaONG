import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from "react-native";

const VERDE = "#1D9E75";

export default function WelcomeScreen({ navigation }: any) {
  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />

      {/* HERO */}
      <View style={s.hero}>
        <Text style={s.heroIcone}>📚</Text>
        <Text style={s.heroTitulo}>Casa do Caminho</Text>
        <Text style={s.heroSub}>Biblioteca comunitária</Text>
      </View>

      {/* AÇÕES */}
      <View style={s.acoes}>
        <Text style={s.acoesTitulo}>Como deseja continuar?</Text>

        <TouchableOpacity
          style={s.btnPublico}
          onPress={() => navigation.navigate("Acervo")}
        >
          <Text style={s.btnPublicoIcone}>🔍</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.btnPublicoTitulo}>Ver acervo</Text>
            <Text style={s.btnPublicoSub}>Consulte os livros disponíveis</Text>
          </View>
          <Text style={s.btnSeta}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.btnADM}
          onPress={() => navigation.navigate("Login")}
        >
          <Text style={s.btnADMIcone}>🔐</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.btnADMTitulo}>Entrar como ADM</Text>
            <Text style={s.btnADMSub}>Acesso restrito aos administradores</Text>
          </View>
          <Text style={[s.btnSeta, { color: VERDE }]}>›</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.rodape}>Casa do Caminho · Sistema de gestão de biblioteca</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: VERDE },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 60,
  },
  heroIcone: { fontSize: 72, marginBottom: 16 },
  heroTitulo: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#fff",
    letterSpacing: 1,
  },
  heroSub: {
    fontSize: 16,
    color: "rgba(255,255,255,0.8)",
    marginTop: 6,
  },
  acoes: {
    backgroundColor: "#F4F6F8",
    borderRadius: 24,
    padding: 24,
    margin: 16,
    marginBottom: 32,
  },
  acoesTitulo: {
    fontSize: 13,
    color: "#888",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  btnPublico: {
    backgroundColor: VERDE,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  btnPublicoIcone: { fontSize: 28 },
  btnPublicoTitulo: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
  },
  btnPublicoSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
  },
  btnADM: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  btnADMIcone: { fontSize: 28 },
  btnADMTitulo: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1a1a18",
  },
  btnADMSub: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  btnSeta: { fontSize: 24, color: "#fff", fontWeight: "bold" },
  rodape: {
    textAlign: "center",
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    marginBottom: 20,
  },
});
