import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { buscarEmprestimos } from "../../services/emprestimos";
import { Emprestimo } from "../../types";

const VERDE = "#1D9E75";
const AMBER = "#BA7517";
const VERMELHO = "#A32D2D";

type Filtro = "todos" | "ativos" | "atrasados" | "devolvidos";

export default function RelatoriosScreen() {
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [nomeONG, setNomeONG] = useState("Casa do Caminho");

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setLoading(true);
    const data = await buscarEmprestimos();
    setEmprestimos(data);
    setLoading(false);
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR");

  const isAtrasado = (e: Emprestimo) =>
    e.status === "Emprestado" && new Date(e.dataPrevista) < new Date();

  const filtrados = emprestimos.filter((e) => {
    if (filtro === "ativos") return e.status === "Emprestado";
    if (filtro === "atrasados") return isAtrasado(e);
    if (filtro === "devolvidos") return e.status === "Devolvido";
    return true;
  });

  const stats = {
    total: emprestimos.length,
    ativos: emprestimos.filter((e) => e.status === "Emprestado").length,
    atrasados: emprestimos.filter(isAtrasado).length,
    devolvidos: emprestimos.filter((e) => e.status === "Devolvido").length,
  };

  const gerarHTML = () => {
    const hoje = new Date().toLocaleDateString("pt-BR");
    const titulo = {
      todos: "Todos os empréstimos",
      ativos: "Empréstimos ativos",
      atrasados: "Empréstimos em atraso",
      devolvidos: "Empréstimos devolvidos",
    }[filtro];

    const linhas = filtrados
      .sort((a, b) => new Date(b.dataEmprestimo).getTime() - new Date(a.dataEmprestimo).getTime())
      .map((e) => {
        const atrasado = isAtrasado(e);
        const cor = e.status === "Devolvido" ? "#0F6E56" : atrasado ? "#A32D2D" : "#BA7517";
        const status = e.status === "Devolvido" ? "Devolvido" : atrasado ? "Em atraso" : "Emprestado";
        return `
          <tr>
            <td>${e.nomeLivro}</td>
            <td>${e.nomePessoa}</td>
            <td>${e.telefonePessoa || "—"}</td>
            <td>${fmt(e.dataEmprestimo)}</td>
            <td>${fmt(e.dataPrevista)}</td>
            <td>${e.dataDevolucao ? fmt(e.dataDevolucao) : "—"}</td>
            <td style="color:${cor};font-weight:600">${status}</td>
          </tr>
        `;
      }).join("");

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #1a1a18; }
          .header { background: #1D9E75; color: white; padding: 24px; }
          .header h1 { font-size: 22px; }
          .header p { font-size: 13px; opacity: 0.85; margin-top: 4px; }
          .stats { display: flex; gap: 12px; padding: 16px; background: #f4f4f2; }
          .stat { flex: 1; background: white; border-radius: 8px; padding: 12px; text-align: center; border: 1px solid #e0e0e0; }
          .stat-num { font-size: 24px; font-weight: bold; color: #1D9E75; }
          .stat-lbl { font-size: 11px; color: #888; margin-top: 2px; }
          .section { padding: 16px; }
          .section h2 { font-size: 14px; color: #555; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #f0f0ee; padding: 8px 10px; text-align: left; font-size: 11px; color: #666; border-bottom: 1px solid #ddd; }
          td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
          tr:nth-child(even) td { background: #fafaf8; }
          .footer { padding: 16px; text-align: center; font-size: 11px; color: #aaa; border-top: 1px solid #eee; margin-top: 20px; }
          .empty { text-align: center; padding: 40px; color: #aaa; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📚 ${nomeONG}</h1>
          <p>Relatório de Empréstimos · Gerado em ${hoje}</p>
        </div>

        <div class="stats">
          <div class="stat">
            <div class="stat-num">${stats.total}</div>
            <div class="stat-lbl">Total</div>
          </div>
          <div class="stat">
            <div class="stat-num" style="color:#BA7517">${stats.ativos}</div>
            <div class="stat-lbl">Ativos</div>
          </div>
          <div class="stat">
            <div class="stat-num" style="color:#A32D2D">${stats.atrasados}</div>
            <div class="stat-lbl">Atrasados</div>
          </div>
          <div class="stat">
            <div class="stat-num">${stats.devolvidos}</div>
            <div class="stat-lbl">Devolvidos</div>
          </div>
        </div>

        <div class="section">
          <h2>${titulo} (${filtrados.length} registros)</h2>
          ${filtrados.length === 0 ? '<div class="empty">Nenhum registro encontrado</div>' : `
          <table>
            <thead>
              <tr>
                <th>Livro</th>
                <th>Pessoa</th>
                <th>Telefone</th>
                <th>Empréstimo</th>
                <th>Prazo</th>
                <th>Devolução</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>`}
        </div>

        <div class="footer">
          ${nomeONG} · Sistema de gestão de biblioteca · ${hoje}
        </div>
      </body>
      </html>
    `;
  };

  const gerarPDF = async () => {
    setGerando(true);
    try {
      const { uri } = await Print.printToFileAsync({
        html: gerarHTML(),
        base64: false,
      });

      const podeCompartilhar = await Sharing.isAvailableAsync();
      if (podeCompartilhar) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Exportar relatório",
        });
      } else {
        Alert.alert("PDF gerado!", `Salvo em:\n${uri}`);
      }
    } catch (e) {
      Alert.alert("Erro", "Não foi possível gerar o PDF.");
      console.log("Erro PDF:", e);
    } finally {
      setGerando(false);
    }
  };

  const filtros: { key: Filtro; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "ativos", label: "Ativos" },
    { key: "atrasados", label: "Atrasados" },
    { key: "devolvidos", label: "Devolvidos" },
  ];

  return (
    <ScrollView style={s.container}>
      {/* HEADER */}
      <View style={s.header}>
        <Text style={s.titulo}>📄 Relatórios</Text>
        <Text style={s.subtitulo}>Exporte o histórico em PDF</Text>
      </View>

      {/* STATS */}
      {loading ? (
        <ActivityIndicator color={VERDE} size="large" style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={s.statsRow}>
            {[
              { label: "Total", valor: stats.total, cor: VERDE },
              { label: "Ativos", valor: stats.ativos, cor: AMBER },
              { label: "Atrasados", valor: stats.atrasados, cor: VERMELHO },
              { label: "Devolvidos", valor: stats.devolvidos, cor: VERDE },
            ].map((item) => (
              <View key={item.label} style={s.statCard}>
                <Text style={[s.statNum, { color: item.cor }]}>{item.valor}</Text>
                <Text style={s.statLbl}>{item.label}</Text>
              </View>
            ))}
          </View>

          {/* FILTROS */}
          <Text style={s.sectionLabel}>Filtrar por</Text>
          <View style={s.filtrosRow}>
            {filtros.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[s.filtroBtn, filtro === f.key && s.filtroBtnAtivo]}
                onPress={() => setFiltro(f.key)}
              >
                <Text style={[s.filtroTxt, filtro === f.key && s.filtroTxtAtivo]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* PREVIEW */}
          <Text style={s.sectionLabel}>
            {filtrados.length} registro{filtrados.length !== 1 ? "s" : ""} no relatório
          </Text>
          {filtrados.slice(0, 5).map((e) => {
            const atrasado = isAtrasado(e);
            return (
              <View key={e.id} style={[s.previewCard, atrasado && s.previewAtrasado]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.previewLivro} numberOfLines={1}>{e.nomeLivro}</Text>
                  <Text style={s.previewPessoa}>{e.nomePessoa} · {e.telefonePessoa || "—"}</Text>
                  <Text style={s.previewData}>
                    {fmt(e.dataEmprestimo)} → {fmt(e.dataPrevista)}
                  </Text>
                </View>
                <Text style={{
                  fontSize: 11, fontWeight: "600",
                  color: e.status === "Devolvido" ? VERDE : atrasado ? VERMELHO : AMBER
                }}>
                  {e.status === "Devolvido" ? "✓" : atrasado ? "⚠" : "●"}
                </Text>
              </View>
            );
          })}
          {filtrados.length > 5 && (
            <Text style={s.maisRegistros}>
              + {filtrados.length - 5} registros no PDF
            </Text>
          )}

          {/* BOTÃO GERAR PDF */}
          <TouchableOpacity
            style={[s.btnPDF, gerando && { opacity: 0.7 }]}
            onPress={gerarPDF}
            disabled={gerando}
          >
            {gerando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnPDFTxt}>📥 Gerar e compartilhar PDF</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.btnAtualizar} onPress={carregar}>
            <Text style={s.btnAtualizarTxt}>↻ Atualizar dados</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F4F6F8" },
  header: { backgroundColor: VERDE, padding: 20, paddingTop: 50 },
  titulo: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  subtitulo: { color: "#fff", opacity: 0.9 },
  statsRow: { flexDirection: "row", padding: 12, gap: 8 },
  statCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 12,
    padding: 12, alignItems: "center",
    borderWidth: 0.5, borderColor: "#e0e0e0",
  },
  statNum: { fontSize: 24, fontWeight: "bold" },
  statLbl: { fontSize: 11, color: "#888", marginTop: 2 },
  sectionLabel: {
    fontSize: 11, fontWeight: "500", color: "#888",
    textTransform: "uppercase", letterSpacing: 0.5,
    paddingHorizontal: 16, marginTop: 16, marginBottom: 8,
  },
  filtrosRow: { flexDirection: "row", paddingHorizontal: 12, gap: 8, marginBottom: 4 },
  filtroBtn: {
    flex: 1, padding: 8, borderRadius: 8, alignItems: "center",
    backgroundColor: "#fff", borderWidth: 0.5, borderColor: "#ddd",
  },
  filtroBtnAtivo: { backgroundColor: VERDE },
  filtroTxt: { fontSize: 12, color: "#666", fontWeight: "500" },
  filtroTxtAtivo: { color: "#fff" },
  previewCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", marginHorizontal: 12,
    marginBottom: 6, padding: 12, borderRadius: 10,
    borderWidth: 0.5, borderColor: "#e0e0e0",
  },
  previewAtrasado: { borderLeftWidth: 3, borderLeftColor: VERMELHO },
  previewLivro: { fontSize: 13, fontWeight: "600", color: "#1a1a18" },
  previewPessoa: { fontSize: 12, color: "#666", marginTop: 2 },
  previewData: { fontSize: 11, color: "#aaa", marginTop: 2 },
  maisRegistros: {
    textAlign: "center", color: "#aaa",
    fontSize: 13, marginTop: 4, marginBottom: 8,
  },
  btnPDF: {
    backgroundColor: VERDE, margin: 16, padding: 16,
    borderRadius: 12, alignItems: "center",
  },
  btnPDFTxt: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  btnAtualizar: {
    marginHorizontal: 16, marginBottom: 40, padding: 12,
    borderRadius: 12, alignItems: "center",
    backgroundColor: "#fff", borderWidth: 0.5, borderColor: "#ddd",
  },
  btnAtualizarTxt: { color: "#666", fontSize: 14 },
});
