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
  Image,
} from "react-native";
import { CameraView, Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { buscarLivrosPagina, buscarLivrosPorTexto, adicionarLivro, excluirLivro } from "../../services/livros";
import { prepararImagemLivro, removerImagemLivro } from "../../services/imagens";
import { Livro } from "../../types";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

const VERDE = "#1D9E75";

export default function LivrosScreen({ route }: any) {
  const [livros, setLivros] = useState<Livro[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [modalScan, setModalScan] = useState(false);
  const [modalForm, setModalForm] = useState(false);
  const [scanAtivo, setScanAtivo] = useState(true);
  const [buscandoAPI, setBuscandoAPI] = useState(false);
  const [form, setForm] = useState<Partial<Livro>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ultimoDoc, setUltimoDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [imagemLocalUri, setImagemLocalUri] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => carregar(busca), 350);
    return () => clearTimeout(timer);
  }, [busca]);

  // Recebe ISBN vindo da tela de empréstimos
  useEffect(() => {
    if (route?.params?.isbnParaCadastrar) {
      const isbn = route.params.isbnParaCadastrar;
      setForm({ isbn, codigoBarras: isbn, status: "Disponível" });
      setImagemLocalUri(null);
      setModalForm(true);
      buscarPorISBN(isbn);
    }
  }, [route?.params?.isbnParaCadastrar]);

  const carregar = async (termo = "") => {
    setLoading(true);
    setErro("");
    try {
      if (termo.trim()) {
        const data = await buscarLivrosPorTexto(termo);
        setLivros(data);
        setUltimoDoc(null);
        setTemMais(false);
      } else {
        const pagina = await buscarLivrosPagina();
        setLivros(pagina.livros);
        setUltimoDoc(pagina.ultimoDoc);
        setTemMais(pagina.temMais);
      }
    } catch (e) {
      console.log("Erro ao carregar livros:", e);
      setErro("Não foi possível carregar os livros. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const carregarMais = async () => {
    if (!temMais || carregandoMais || busca.trim()) return;
    setCarregandoMais(true);
    try {
      const pagina = await buscarLivrosPagina(ultimoDoc);
      setLivros((atuais) => [...atuais, ...pagina.livros]);
      setUltimoDoc(pagina.ultimoDoc);
      setTemMais(pagina.temMais);
    } catch (e) {
      console.log("Erro ao carregar mais livros:", e);
      setErro("Não foi possível carregar mais livros.");
    } finally {
      setCarregandoMais(false);
    }
  };

  const pedirPermissao = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    return status === "granted";
  };

  const abrirScanner = async () => {
    const ok = await pedirPermissao();
    if (!ok) return Alert.alert("Erro", "Sem permissão da câmera");
    setScanAtivo(true);
    setModalScan(true);
  };

  const abrirCameraCapa = async () => {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      return Alert.alert("Permissão necessária", "Autorize a câmera para fotografar a capa.");
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      const uri = result.assets[0].uri;
      setImagemLocalUri(uri);
      setForm((f) => ({ ...f, imagem: uri, imagemStoragePath: undefined }));
    }
  };

  const escolherCapaGaleria = async () => {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      return Alert.alert("Permissão necessária", "Autorize a galeria para escolher a capa.");
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      const uri = result.assets[0].uri;
      setImagemLocalUri(uri);
      setForm((f) => ({ ...f, imagem: uri, imagemStoragePath: undefined }));
    }
  };

  const removerCapa = () => {
    setImagemLocalUri(null);
    setForm((f) => ({ ...f, imagem: "", imagemStoragePath: undefined }));
  };

  // Busca por ISBN direto (usado quando vem da tela de empréstimos)
  const buscarPorISBN = async (isbn: string) => {
    setBuscandoAPI(true);
    const isbn10 =
      isbn.length === 13 && isbn.startsWith("978")
        ? isbn.slice(3, 12)
        : isbn;
    await buscarNasAPIs(isbn, isbn10);
    setBuscandoAPI(false);
  };

  const onScan = async ({ data }: { data: string }) => {
    if (!scanAtivo) return;
    setScanAtivo(false);
    setModalScan(false);
    setModalForm(true);
    setBuscandoAPI(true);

    const codigoLimpo = data.replace(/\D/g, "");
    setForm({ codigoBarras: data, isbn: codigoLimpo, status: "Disponível" });

    console.log("Código lido:", data);
    console.log("Código limpo:", codigoLimpo);

    const isbn13 = codigoLimpo;
    const isbn10 =
      codigoLimpo.length === 13 && codigoLimpo.startsWith("978")
        ? codigoLimpo.slice(3, 12)
        : codigoLimpo;

    const encontrado = await buscarNasAPIs(isbn13, isbn10);
    setBuscandoAPI(false);

    if (!encontrado) {
      Alert.alert(
        "Livro não encontrado nas APIs",
        `ISBN: ${codigoLimpo}\n\nPreencha os dados manualmente.`
      );
    }
  };

  const buscarNasAPIs = async (isbn13: string, isbn10: string): Promise<boolean> => {
    // 1. Open Library
    try {
      console.log("Tentando Open Library:", isbn13);
      const res = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`
      );
      const json = await res.json();
      const chave = `ISBN:${isbn13}`;
      if (json[chave]) {
        const info = json[chave];
        setForm((f) => ({
          ...f,
          titulo: info.title || "",
          autor: info.authors?.map((a: any) => a.name).join(", ") || "",
          editora: info.publishers?.[0]?.name || "",
          imagem: info.cover?.medium || info.cover?.large || "",
          isbn: isbn13,
          status: "Disponível",
        }));
        return true;
      }
    } catch (e) {
      console.log("Open Library falhou:", e);
    }

    // 2. Google Books com ISBN-13
    try {
      console.log("Tentando Google Books ISBN-13:", isbn13);
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}&maxResults=1`
      );
      const json = await res.json();
      if (json.items?.length > 0) {
        preencherForm(json.items[0].volumeInfo, isbn13);
        return true;
      }
    } catch (e) {
      console.log("Google Books ISBN-13 falhou:", e);
    }

    // 3. Google Books com ISBN-10
    if (isbn10 !== isbn13) {
      try {
        console.log("Tentando Google Books ISBN-10:", isbn10);
        const res = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn10}&maxResults=1`
        );
        const json = await res.json();
        if (json.items?.length > 0) {
          preencherForm(json.items[0].volumeInfo, isbn13);
          return true;
        }
      } catch (e) {
        console.log("Google Books ISBN-10 falhou:", e);
      }
    }

    return false;
  };

  const preencherForm = (info: any, isbn: string) => {
    setForm((f) => ({
      ...f,
      titulo: info.title || "",
      autor: info.authors?.join(", ") || "",
      editora: info.publisher || "",
      imagem: info.imageLinks?.thumbnail?.replace("http://", "https://") || "",
      isbn,
      status: "Disponível",
    }));
  };

  const salvar = async () => {
    if (!form.titulo || !form.autor) {
      return Alert.alert("Erro", "Preencha título e autor");
    }
    setSalvando(true);
    setUploadProgress(0);

    let imagemPreparada: { dataUrl: string } | null = null;
    let imagemEnviada: { storagePath?: string } | undefined;
    try {
      if (imagemLocalUri) {
        imagemPreparada = await prepararImagemLivro(imagemLocalUri, setUploadProgress);
      }

      await adicionarLivro({
        ...(form as Livro),
        imagem: imagemPreparada?.dataUrl || form.imagem || "",
        imagemStoragePath: undefined,
        quantidadeTotal: form.quantidadeTotal || 1,
        quantidadeDisponivel: form.quantidadeDisponivel || form.quantidadeTotal || 1,
        status: "Disponível",
        dataCadastro: new Date().toISOString(),
      });

      setModalForm(false);
      setForm({});
      setImagemLocalUri(null);
      carregar(busca);
      Alert.alert("✅ Livro cadastrado!", "Agora você pode realizar o empréstimo.");
    } catch (e) {
      console.log("Erro ao salvar livro:", e);
      if (imagemEnviada?.storagePath) {
        try {
          await removerImagemLivro(imagemEnviada.storagePath);
        } catch (erroRemocao) {
          console.log("Erro ao remover imagem após falha:", erroRemocao);
        }
      }
      Alert.alert("Erro", "Não foi possível cadastrar o livro. Nenhum registro incompleto foi salvo.");
    } finally {
      setSalvando(false);
      setUploadProgress(0);
    }
  };

  const livrosFiltrados = livros;

  return (
    <View style={s.container}>
      {/* HEADER */}
      <View style={s.header}>
        <Text style={s.titulo}>📚 Biblioteca ONG</Text>
        <Text style={s.subtitulo}>
          {busca.trim() ? `${livros.length} resultado(s)` : `${livros.length} livro(s) carregado(s)`}
        </Text>
      </View>

      {/* BUSCA */}
      <TextInput
        placeholder="Buscar livro..."
        value={busca}
        onChangeText={setBusca}
        style={s.input}
        placeholderTextColor="#aaa"
      />

      {/* BOTÕES */}
      <View style={s.row}>
        <TouchableOpacity style={s.btn} onPress={abrirScanner}>
          <Text style={s.btnText}>📷 Escanear</Text>
        </TouchableOpacity>
        <View style={{ width: 10 }} />
        <TouchableOpacity
          style={[s.btn, s.btnOutline]}
          onPress={() => {
            setForm({ status: "Disponível" });
            setImagemLocalUri(null);
            setModalForm(true);
          }}
        >
          <Text style={[s.btnText, { color: VERDE }]}>✏️ Manual</Text>
        </TouchableOpacity>
      </View>

      {/* LISTA */}
      {loading ? (
        <ActivityIndicator color={VERDE} size="large" style={{ marginTop: 40 }} />
      ) : erro ? (
        <View style={s.vazio}>
          <Text style={s.vazioTxt}>{erro}</Text>
          <TouchableOpacity style={[s.btn, { marginTop: 12, maxWidth: 180 }]} onPress={() => carregar(busca)}>
            <Text style={s.btnText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : livrosFiltrados.length === 0 ? (
        <View style={s.vazio}>
          <Text style={s.vazioTxt}>
            {busca.trim() ? "Nenhum livro encontrado" : "Nenhum livro cadastrado"}
          </Text>
          <Text style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>
            {busca.trim() ? "Revise o termo buscado" : "Escaneie ou cadastre manualmente"}
          </Text>
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
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onLongPress={() =>
                Alert.alert("Excluir", `Excluir "${item.titulo}"?`, [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Excluir",
                    style: "destructive",
                    onPress: async () => {
                      await excluirLivro(item.id!);
                      carregar(busca);
                    },
                  },
                ])
              }
            >
              {item.imagem ? (
                <Image source={{ uri: item.imagem }} style={s.img} />
              ) : (
                <View style={[s.img, s.imgVazia]}>
                  <Text style={{ fontSize: 24 }}>📖</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle} numberOfLines={2}>{item.titulo}</Text>
                <Text style={s.cardSub}>{item.autor}</Text>
                {item.editora ? (
                  <Text style={s.cardMeta}>{item.editora}</Text>
                ) : null}
                <View style={[s.badge, {
                  backgroundColor: item.status === "Disponível" ? "#E1F5EE" : "#FAEEDA",
                }]}>
                  <Text style={{
                    fontSize: 11, fontWeight: "500",
                    color: item.status === "Disponível" ? "#0F6E56" : "#BA7517",
                  }}>
                    {item.status}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* MODAL SCANNER */}
      <Modal
        visible={modalScan}
        animationType="slide"
        onRequestClose={() => { setModalScan(false); setScanAtivo(false); }}
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
            onPress={() => { setModalScan(false); setScanAtivo(false); }}
          >
            <Text style={{ color: "#fff", fontSize: 16 }}>✕ Fechar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* MODAL FORMULÁRIO */}
      <Modal
        visible={modalForm}
        animationType="slide"
        onRequestClose={() => setModalForm(false)}
      >
        <ScrollView style={s.modal} contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={s.modalTitle}>
            {form.codigoBarras ? "📷 Dados do livro" : "✏️ Cadastro manual"}
          </Text>

          {buscandoAPI && (
            <View style={s.buscandoRow}>
              <ActivityIndicator color={VERDE} />
              <Text style={{ marginLeft: 8, color: VERDE, fontSize: 13 }}>
                Buscando informações do livro...
              </Text>
            </View>
          )}

          {form.imagem ? (
            <Image
              source={{ uri: form.imagem }}
              style={s.capaPreview}
              resizeMode="contain"
            />
          ) : (
            <View style={[s.capaPreview, s.capaPreviewVazia]}>
              <Text style={{ fontSize: 42 }}>📖</Text>
              <Text style={{ color: "#888", marginTop: 6 }}>Sem capa</Text>
            </View>
          )}

          <View style={s.row}>
            <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={abrirCameraCapa} disabled={salvando}>
              <Text style={[s.btnText, { color: VERDE }]}>📷 Foto</Text>
            </TouchableOpacity>
            <View style={{ width: 10 }} />
            <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={escolherCapaGaleria} disabled={salvando}>
              <Text style={[s.btnText, { color: VERDE }]}>🖼️ Galeria</Text>
            </TouchableOpacity>
          </View>

          {form.imagem ? (
            <TouchableOpacity style={s.btnRemoverCapa} onPress={removerCapa} disabled={salvando}>
              <Text style={s.btnRemoverCapaTxt}>Remover capa</Text>
            </TouchableOpacity>
          ) : null}

          {salvando && uploadProgress > 0 ? (
            <Text style={s.uploadTxt}>Preparando capa: {Math.round(uploadProgress * 100)}%</Text>
          ) : null}

          {[
            { label: "Título *", key: "titulo", placeholder: "Ex: Dom Casmurro" },
            { label: "Autor *", key: "autor", placeholder: "Ex: Machado de Assis" },
            { label: "Editora", key: "editora", placeholder: "Ex: Companhia das Letras" },
            { label: "Categoria", key: "categoria", placeholder: "Ex: Literatura" },
            { label: "ISBN", key: "isbn", placeholder: "978-..." },
          ].map((campo) => (
            <View key={campo.key} style={{ marginBottom: 12 }}>
              <Text style={s.label}>{campo.label}</Text>
              <TextInput
                style={s.input}
                placeholder={campo.placeholder}
                placeholderTextColor="#aaa"
                value={(form as any)[campo.key] || ""}
                onChangeText={(v) => setForm((f) => ({ ...f, [campo.key]: v }))}
              />
            </View>
          ))}

          <View style={s.row}>
            <TouchableOpacity
              style={[s.btn, s.btnOutline]}
              onPress={() => { setModalForm(false); setForm({}); setImagemLocalUri(null); }}
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
    backgroundColor: "#fff", margin: 10, padding: 12,
    borderRadius: 10, fontSize: 14, color: "#1a1a18",
  },
  row: { flexDirection: "row", paddingHorizontal: 10, marginBottom: 4 },
  btn: { backgroundColor: VERDE, padding: 12, borderRadius: 10, flex: 1, alignItems: "center" },
  btnOutline: { backgroundColor: "#fff", borderWidth: 1, borderColor: VERDE },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  vazio: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: 60 },
  vazioTxt: { fontSize: 16, color: "#555" },
  card: {
    flexDirection: "row", backgroundColor: "#fff", marginBottom: 10,
    padding: 12, borderRadius: 12, alignItems: "center",
    gap: 12, borderWidth: 0.5, borderColor: "#e0e0e0",
  },
  img: { width: 55, height: 75, borderRadius: 6 },
  imgVazia: { backgroundColor: "#f0f0f0", alignItems: "center", justifyContent: "center" },
  cardTitle: { fontWeight: "bold", fontSize: 14, color: "#1a1a18" },
  cardSub: { color: "#666", fontSize: 12, marginTop: 2 },
  cardMeta: { color: "#aaa", fontSize: 11, marginTop: 2 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, marginTop: 6 },
  scanOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: 250, height: 150, borderWidth: 2, borderColor: VERDE, borderRadius: 12, marginBottom: 20 },
  scanTxt: { color: "#fff", fontSize: 14, textAlign: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 8, borderRadius: 8 },
  scanFechar: { position: "absolute", top: 50, right: 20, backgroundColor: "rgba(0,0,0,0.6)", padding: 10, borderRadius: 20 },
  modal: { flex: 1, backgroundColor: "#f4f4f2", padding: 20, paddingTop: 50 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#1a1a18", marginBottom: 16 },
  buscandoRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#E1F5EE", padding: 12, borderRadius: 10, marginBottom: 16 },
  capaPreview: { width: "100%", height: 160, borderRadius: 10, marginBottom: 16, backgroundColor: "#eee" },
  capaPreviewVazia: { alignItems: "center", justifyContent: "center" },
  btnRemoverCapa: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 },
  btnRemoverCapaTxt: { color: "#A32D2D", fontWeight: "600", fontSize: 13 },
  uploadTxt: { color: VERDE, fontSize: 13, textAlign: "center", marginBottom: 12, fontWeight: "600" },
  label: { fontSize: 12, color: "#666", marginBottom: 4, fontWeight: "500" },
});
