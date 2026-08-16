import React, { useEffect, useRef, useState } from "react";
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
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  CATEGORIAS_LIVRO,
  adicionarLivro,
  buscarLivrosPagina,
  buscarLivrosPorTexto,
  excluirLivro,
  normalizarCategoriaLivro,
  obterCategoriaLivro,
  prepararLivroParaFirestore,
} from "../../services/livros";
import {
  type ImagemLivroEntrada,
  descreverErroImagem,
  enviarImagemLivro,
  prepararImagemLivro,
  removerImagemLivro,
} from "../../services/imagens";
import { buscarLivroPorISBN, deveIgnorarScanDuplicado, normalizarCodigoISBN, normalizarISBN } from "../../services/isbn";
import { Livro } from "../../types";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

const VERDE = "#1D9E75";
const RASCUNHO_LIVRO_KEY = "@cantinhoLivro:rascunhoLivro";
const RASCUNHO_LIVRO_TTL_MS = 30 * 60 * 1000;

const erroEhPermissaoFirestore = (erro: any) =>
  erro?.code === "permission-denied" || erro?.code === "firestore/permission-denied";

const erroEhConexao = (erro: any) =>
  erro?.code === "unavailable" ||
  erro?.code === "deadline-exceeded" ||
  erro?.name === "AbortError" ||
  String(erro?.message || "").toLowerCase().includes("network");

export default function LivrosScreen({ route }: any) {
  const insets = useSafeAreaInsets();
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
  const [imagemLocalInfo, setImagemLocalInfo] = useState<ImagemLivroEntrada | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [abrindoSeletorCapa, setAbrindoSeletorCapa] = useState(false);
  const ultimoScanRef = useRef<{ codigo: string; timestamp: number } | null>(null);
  const montadoRef = useRef(true);
  const formRef = useRef<Partial<Livro>>({});
  const modalFormRef = useRef(false);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    modalFormRef.current = modalForm;
  }, [modalForm]);

  useEffect(() => {
    let ativo = true;

    const restaurarEstadoInterrompido = async () => {
      try {
        await restaurarRascunhoCadastroLivro();
        const pendente = await ImagePicker.getPendingResultAsync();
        if (!ativo || !montadoRef.current || !pendente) return;

        if ("code" in pendente) {
          console.error("ImagePicker retornou erro pendente:", {
            code: pendente.code,
            message: pendente.message,
          });
          return;
        }

        aplicarResultadoCapa(pendente, "resultado-pendente");
      } catch (e) {
        console.error("Erro ao restaurar rascunho ou resultado pendente da capa:", e);
      }
    };

    restaurarEstadoInterrompido();

    return () => {
      ativo = false;
      montadoRef.current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => carregar(busca), 350);
    return () => clearTimeout(timer);
  }, [busca]);

  // Recebe ISBN vindo da tela de empréstimos
  useEffect(() => {
    if (route?.params?.isbnParaCadastrar) {
      const isbn = route.params.isbnParaCadastrar;
      void limparRascunhoCadastroLivro();
      setForm({ isbn, codigoBarras: isbn, status: "Disponível" });
      setImagemLocalUri(null);
      setImagemLocalInfo(null);
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
      console.error("Erro ao carregar livros:", e);
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
      console.error("Erro ao carregar mais livros:", e);
      setErro("Não foi possível carregar mais livros.");
    } finally {
      setCarregandoMais(false);
    }
  };

  const limparRascunhoCadastroLivro = async () => {
    try {
      await AsyncStorage.removeItem(RASCUNHO_LIVRO_KEY);
    } catch (e) {
      console.error("Erro ao limpar rascunho do cadastro de livro:", e);
    }
  };

  const salvarRascunhoCadastroLivro = async () => {
    const atual = formRef.current;
    const categoria = normalizarCategoriaLivro(atual.categoria);
    const rascunho = {
      titulo: atual.titulo?.trim() || "",
      autor: atual.autor?.trim() || "",
      isbn: atual.isbn?.trim() || "",
      categoria,
      modalAberto: modalFormRef.current,
      timestamp: Date.now(),
    };

    try {
      await AsyncStorage.setItem(RASCUNHO_LIVRO_KEY, JSON.stringify(rascunho));
    } catch (e) {
      console.error("Erro ao salvar rascunho do cadastro de livro:", e);
    }
  };

  const restaurarRascunhoCadastroLivro = async () => {
    const bruto = await AsyncStorage.getItem(RASCUNHO_LIVRO_KEY);
    if (!bruto) return;

    let rascunho: any;
    try {
      rascunho = JSON.parse(bruto);
    } catch {
      await limparRascunhoCadastroLivro();
      return;
    }

    const timestamp = Number(rascunho?.timestamp);
    const expirado = !Number.isFinite(timestamp) || Date.now() - timestamp > RASCUNHO_LIVRO_TTL_MS;
    if (expirado) {
      await limparRascunhoCadastroLivro();
      return;
    }

    if (!rascunho?.modalAberto || !montadoRef.current) return;

    const isbn = typeof rascunho.isbn === "string" ? rascunho.isbn : "";
    setForm((f) => ({
      ...f,
      titulo: typeof rascunho.titulo === "string" ? rascunho.titulo : "",
      autor: typeof rascunho.autor === "string" ? rascunho.autor : "",
      isbn,
      codigoBarras: isbn || f.codigoBarras,
      categoria: normalizarCategoriaLivro(rascunho.categoria) || f.categoria,
      status: "Disponível",
    }));
    setModalForm(true);
  };

  const aplicarResultadoCapa = (result: ImagePicker.ImagePickerResult | null, etapa: string) => {
    if (!result || result.canceled) {
      if (montadoRef.current) setModalForm(true);
      return false;
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      console.error("ImagePicker retornou resultado sem asset de imagem:", {
        etapa,
        canceled: result.canceled,
        assets: result.assets?.length ?? 0,
      });
      if (montadoRef.current) setModalForm(true);
      return false;
    }

    if (!montadoRef.current) return false;

    setImagemLocalUri(asset.uri);
    setImagemLocalInfo({
      uri: asset.uri,
      mimeType: asset.mimeType || "image/jpeg",
      width: asset.width,
      height: asset.height,
    });
    setForm((f) => ({
      ...f,
      imagem: asset.uri,
      imagemStoragePath: undefined,
      imagemCloudinaryPublicId: undefined,
    }));
    setModalForm(true);
    return true;
  };

  const abrirConfiguracoesApp = async () => {
    try {
      await Linking.openSettings();
    } catch (e) {
      console.error("Erro ao abrir configurações do aplicativo:", e);
    }
  };

  const mostrarPermissaoNegadaCapa = (origem: "camera" | "galeria", podePedirNovamente?: boolean) => {
    const mensagem =
      origem === "camera"
        ? "Autorize a câmera para fotografar a capa do livro."
        : "Autorize a galeria para escolher a capa do livro.";
    const tentarNovamente = origem === "camera" ? abrirCameraCapa : escolherCapaGaleria;
    const botoes = [
      { text: "Cancelar", style: "cancel" as const },
      ...(podePedirNovamente ? [{ text: "Tentar novamente", onPress: tentarNovamente }] : []),
      { text: "Abrir configurações", onPress: abrirConfiguracoesApp },
    ];

    Alert.alert("Permissão negada", mensagem, botoes);
  };

  const pedirPermissao = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    return status === "granted";
  };

  const abrirScanner = async () => {
    const ok = await pedirPermissao();
    if (!ok) return Alert.alert("Permissão negada", "Autorize a câmera para escanear o ISBN.");
    setScanAtivo(true);
    setModalScan(true);
  };

  const abrirCameraCapa = async () => {
    if (abrindoSeletorCapa || salvando) return;

    setAbrindoSeletorCapa(true);
    try {
      const permissao = await ImagePicker.requestCameraPermissionsAsync();
      if (!montadoRef.current) return;

      if (!permissao.granted) {
        mostrarPermissaoNegadaCapa("camera", permissao.canAskAgain);
        return;
      }

      await salvarRascunhoCadastroLivro();
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.9,
      });

      aplicarResultadoCapa(result, "camera");
    } catch (e) {
      console.error("Erro ao abrir câmera para capa:", e);
      if (montadoRef.current) {
        Alert.alert("Erro na câmera", "Não foi possível abrir a câmera para fotografar a capa.");
        setModalForm(true);
      }
    } finally {
      if (montadoRef.current) setAbrindoSeletorCapa(false);
    }
  };

  const escolherCapaGaleria = async () => {
    if (abrindoSeletorCapa || salvando) return;

    setAbrindoSeletorCapa(true);
    try {
      const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!montadoRef.current) return;

      if (!permissao.granted) {
        mostrarPermissaoNegadaCapa("galeria", permissao.canAskAgain);
        return;
      }

      await salvarRascunhoCadastroLivro();
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.9,
      });

      aplicarResultadoCapa(result, "galeria");
    } catch (e) {
      console.error("Erro ao abrir galeria para capa:", e);
      if (montadoRef.current) {
        Alert.alert("Erro na galeria", "Não foi possível abrir a galeria para escolher a capa.");
        setModalForm(true);
      }
    } finally {
      if (montadoRef.current) setAbrindoSeletorCapa(false);
    }
  };

  const removerCapa = () => {
    setImagemLocalUri(null);
    setImagemLocalInfo(null);
    setForm((f) => ({
      ...f,
      imagem: "",
      imagemStoragePath: undefined,
      imagemCloudinaryPublicId: undefined,
    }));
  };

  const cancelarCadastroLivro = async () => {
    await limparRascunhoCadastroLivro();
    if (!montadoRef.current) return;
    setModalForm(false);
    setForm({});
    setImagemLocalUri(null);
    setImagemLocalInfo(null);
  };

  const aplicarDadosISBN = (dados: Partial<Livro>) => {
    const imagemApi = dados.imagem?.startsWith("https://") ? dados.imagem : "";
    setForm((f) => ({
      ...f,
      titulo: dados.titulo || f.titulo,
      autor: dados.autor || f.autor,
      isbn: dados.isbn || f.isbn,
      codigoBarras: dados.codigoBarras || dados.isbn || f.codigoBarras,
      categoria: normalizarCategoriaLivro(dados.categoria) || f.categoria,
      imagem: f.imagem || imagemApi,
      imagemStoragePath: f.imagemStoragePath,
      imagemCloudinaryPublicId: f.imagemCloudinaryPublicId,
      status: "Disponível",
    }));
  };

  // Busca por ISBN direto (usado quando vem da tela de empréstimos)
  const buscarPorISBN = async (entrada: string) => {
    const isbn = normalizarISBN(entrada);
    const codigo = normalizarCodigoISBN(entrada);

    if (!isbn) {
      setForm((f) => ({
        ...f,
        isbn: codigo,
        codigoBarras: codigo,
        status: "Disponível",
      }));
      Alert.alert("ISBN inválido", "Confira o código ou preencha os dados manualmente.");
      return;
    }

    setForm((f) => ({
      ...f,
      isbn: isbn.isbn13 || isbn.isbn10 || isbn.codigo,
      codigoBarras: isbn.isbn13 || isbn.codigo,
      isbn10: isbn.isbn10,
      isbn13: isbn.isbn13,
      status: "Disponível",
    }));

    setBuscandoAPI(true);
    try {
      const resultado = await buscarLivroPorISBN(isbn.codigo);
      if (resultado?.encontrado && resultado.dados) {
        aplicarDadosISBN(resultado.dados);
      } else {
        Alert.alert(
          "Livro não encontrado",
          `ISBN: ${isbn.codigo}\n\nNão encontramos esse livro nas fontes públicas. Você pode preencher manualmente.`
        );
      }
    } catch (e) {
      console.error("Busca de ISBN falhou:", e);
      Alert.alert(
        erroEhConexao(e) ? "Falha de conexão" : "Busca indisponível",
        "Não foi possível consultar as fontes agora. Preencha manualmente."
      );
    } finally {
      setBuscandoAPI(false);
    }
  };

  const onScan = async ({ data }: { data: string }) => {
    if (!scanAtivo) return;

    const codigo = normalizarCodigoISBN(data);
    const agora = Date.now();
    const ultimo = ultimoScanRef.current;
    if (deveIgnorarScanDuplicado(ultimo, codigo, agora)) {
      setScanAtivo(false);
      setModalScan(false);
      Alert.alert("Código duplicado", "Esse ISBN acabou de ser lido. Aguarde um instante e tente novamente.");
      return;
    }
    ultimoScanRef.current = { codigo, timestamp: agora };

    setScanAtivo(false);
    setModalScan(false);
    setModalForm(true);
    setImagemLocalUri(null);
    setImagemLocalInfo(null);
    void limparRascunhoCadastroLivro();

    console.log("Código lido:", data);
    console.log("Código normalizado:", codigo);

    await buscarPorISBN(data);
  };

  const salvar = async () => {
    if (salvando) return;

    const titulo = form.titulo?.trim();
    const autor = form.autor?.trim();
    const categoria = normalizarCategoriaLivro(form.categoria);
    const isbnDigitado = form.isbn?.trim() || "";
    const isbnNormalizado = isbnDigitado ? normalizarISBN(isbnDigitado) : null;

    if (!titulo || !autor) {
      return Alert.alert("Campos obrigatórios", "Preencha título e autor antes de salvar.");
    }
    if (!categoria) {
      return Alert.alert("Categoria obrigatória", "Escolha Jovem, Criança ou Adolescente.");
    }
    if (isbnDigitado && !isbnNormalizado) {
      return Alert.alert("ISBN inválido", "Revise o ISBN informado ou deixe o campo vazio.");
    }

    setSalvando(true);
    setUploadProgress(0);

    let imagemEnviada: { url: string; publicId: string } | undefined;
    try {
      let imagemFinal = form.imagem || "";
      let imagemCloudinaryPublicId = form.imagemCloudinaryPublicId;
      const origemCapa = imagemLocalUri ? "foto_local" : form.imagem ? "capa_remota_ou_existente" : "sem_foto";
      console.log("Cadastro de livro: origem da capa", {
        origemCapa,
        usaCloudinary: Boolean(imagemLocalUri),
      });

      if (!imagemLocalUri && imagemFinal && !imagemFinal.startsWith("https://")) {
        console.error("Imagem ignorada antes do Firestore: URL de capa não HTTPS ou URI local.", {
          origemCapa,
          prefixo: imagemFinal.slice(0, 16),
        });
        imagemFinal = "";
        imagemCloudinaryPublicId = undefined;
      }

      if (imagemLocalUri) {
        try {
          const imagemPreparada = await prepararImagemLivro(
            imagemLocalInfo || { uri: imagemLocalUri, mimeType: "image/jpeg" },
            (progresso) =>
              montadoRef.current && setUploadProgress(progresso * 0.55)
          );
          imagemEnviada = await enviarImagemLivro(
            imagemPreparada,
            undefined,
            (progresso) => montadoRef.current && setUploadProgress(0.55 + progresso * 0.4)
          );
          imagemFinal = imagemEnviada.url;
          imagemCloudinaryPublicId = imagemEnviada.publicId;
          if (montadoRef.current) setUploadProgress(1);
        } catch (e) {
          const erroImagem = descreverErroImagem(e, {
            etapa: "salvar-livro",
            uri: imagemLocalUri,
            mime: imagemLocalInfo?.mimeType || "image/jpeg",
          });
          console.error("Falha no Cloudinary ao enviar capa do livro:", erroImagem);
          if (montadoRef.current) {
            Alert.alert(
              "Falha ao enviar capa",
              erroImagem.status
                ? `${erroImagem.mensagemUsuario}\n\nStatus técnico: ${erroImagem.status}`
                : erroImagem.mensagemUsuario
            );
          }
          return;
        }
      }

      const isbnFinal = isbnNormalizado?.isbn13 || isbnNormalizado?.isbn10 || "";
      const livroParaSalvar = prepararLivroParaFirestore({
        titulo,
        autor,
        categoria,
        isbn: isbnFinal,
        codigoBarras: isbnFinal,
        imagem: imagemFinal,
        imagemCloudinaryPublicId,
        quantidadeTotal: 1,
        quantidadeDisponivel: 1,
        status: "Disponível",
        dataCadastro: new Date().toISOString(),
      });

      console.log("Cadastro de livro: documento pronto para Firestore", {
        colecao: "livros",
        campos: Object.keys(livroParaSalvar),
        categoria: livroParaSalvar.categoria,
        temImagem: Boolean(livroParaSalvar.imagem),
        temImagemCloudinaryPublicId: Boolean(livroParaSalvar.imagemCloudinaryPublicId),
      });

      try {
        await adicionarLivro(livroParaSalvar);
      } catch (e) {
        console.error("Falha no Firestore ao salvar livro:", e);
        if (imagemEnviada?.publicId) {
          try {
            await removerImagemLivro(imagemEnviada.publicId);
          } catch (erroRemocao) {
            console.error("Erro ao registrar pendência de remoção da imagem após falha no Firestore:", erroRemocao);
          }
        }

        Alert.alert(
          erroEhPermissaoFirestore(e) ? "Falha no Firestore" : erroEhConexao(e) ? "Falha de conexão" : "Falha no Firestore",
          erroEhPermissaoFirestore(e)
            ? "O Firestore recusou a gravação. Verifique permissões/regras para a coleção livros."
            : "Não foi possível salvar o livro no Firestore. Tente novamente."
        );
        return;
      }

      await limparRascunhoCadastroLivro();
      if (montadoRef.current) {
        setModalForm(false);
        setForm({});
        setImagemLocalUri(null);
        setImagemLocalInfo(null);
        carregar(busca);
        Alert.alert("✅ Livro cadastrado!", "Agora você pode realizar o empréstimo.");
      }
    } catch (e) {
      console.error("Erro inesperado ao salvar livro:", e);
      if (imagemEnviada?.publicId) {
        try {
          await removerImagemLivro(imagemEnviada.publicId);
        } catch (erroRemocao) {
          console.error("Erro ao registrar pendência de remoção da imagem após falha inesperada:", erroRemocao);
        }
      }
      if (montadoRef.current) {
        Alert.alert("Erro inesperado", "Não foi possível cadastrar o livro. Nenhum registro incompleto foi salvo.");
      }
    } finally {
      if (montadoRef.current) {
        setSalvando(false);
        setUploadProgress(0);
      }
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
            void limparRascunhoCadastroLivro();
            setForm({ status: "Disponível" });
            setImagemLocalUri(null);
            setImagemLocalInfo(null);
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
          renderItem={({ item }) => {
            const categoria = obterCategoriaLivro(item.categoria);
            return (
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
                        if (item.imagemStoragePath) {
                          try {
                            await removerImagemLivro(item.imagemStoragePath);
                          } catch (e) {
                            console.error("Erro ao registrar remoção de capa legada:", e);
                          }
                        }
                        if (item.imagemCloudinaryPublicId) {
                          console.log(
                            "Livro excluído; capa Cloudinary não foi removida pelo cliente.",
                            { publicIdPresente: true }
                          );
                        }
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
                  <View style={s.badgeRowLivro}>
                    <View style={[s.categoriaBadge, { borderColor: categoria.cor }]}>
                      <View style={[s.categoriaPonto, { backgroundColor: categoria.cor }]} />
                      <Text style={[s.categoriaBadgeTxt, { color: categoria.cor }]}>
                        {categoria.label}
                      </Text>
                    </View>
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
                </View>
              </TouchableOpacity>
            );
          }}
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
        onRequestClose={cancelarCadastroLivro}
      >
        <ScrollView
          style={s.modal}
          contentContainerStyle={[
            s.modalConteudo,
            { paddingBottom: Math.max(insets.bottom, 16) + 96 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.modalTitle}>
            {form.codigoBarras ? "📷 Dados do livro" : "✏️ Cadastro manual"}
          </Text>

          {buscandoAPI && (
            <View style={s.buscandoRow}>
              <ActivityIndicator color={VERDE} />
              <Text style={{ marginLeft: 8, color: VERDE, fontSize: 13 }}>
                Procurando livro em várias fontes...
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
            <TouchableOpacity
              style={[s.btn, s.btnOutline]}
              onPress={abrirCameraCapa}
              disabled={salvando || abrindoSeletorCapa}
            >
              <Text style={[s.btnText, { color: VERDE }]}>📷 Foto</Text>
            </TouchableOpacity>
            <View style={{ width: 10 }} />
            <TouchableOpacity
              style={[s.btn, s.btnOutline]}
              onPress={escolherCapaGaleria}
              disabled={salvando || abrindoSeletorCapa}
            >
              <Text style={[s.btnText, { color: VERDE }]}>🖼️ Galeria</Text>
            </TouchableOpacity>
          </View>

          {form.imagem ? (
            <TouchableOpacity style={s.btnRemoverCapa} onPress={removerCapa} disabled={salvando}>
              <Text style={s.btnRemoverCapaTxt}>Remover capa</Text>
            </TouchableOpacity>
          ) : null}

          {salvando && uploadProgress > 0 ? (
            <Text style={s.uploadTxt}>Preparando e enviando capa: {Math.round(uploadProgress * 100)}%</Text>
          ) : null}

          {[
            { label: "Título *", key: "titulo", placeholder: "Ex: Dom Casmurro" },
            { label: "Autor *", key: "autor", placeholder: "Ex: Machado de Assis" },
            { label: "ISBN", key: "isbn", placeholder: "Opcional" },
          ].map((campo) => (
            <View key={campo.key} style={{ marginBottom: 12 }}>
              <Text style={s.label}>{campo.label}</Text>
              <TextInput
                style={s.input}
                placeholder={campo.placeholder}
                placeholderTextColor="#aaa"
                keyboardType={(campo as any).keyboardType || "default"}
                multiline={(campo as any).multiline}
                value={(form as any)[campo.key]?.toString() || ""}
                onChangeText={(v) =>
                  setForm((f) => ({
                    ...f,
                    [campo.key]: (campo as any).numeric ? (v ? Number(v) : undefined) : v,
                  }))
                }
              />
            </View>
          ))}

          <View style={{ marginBottom: 12 }}>
            <Text style={s.label}>Categoria *</Text>
            <View style={s.categoriasRow}>
              {CATEGORIAS_LIVRO.map((categoria) => {
                const ativa = normalizarCategoriaLivro(form.categoria) === categoria.valor;
                return (
                  <TouchableOpacity
                    key={categoria.valor}
                    style={[
                      s.categoriaBtn,
                      { borderColor: categoria.cor },
                      ativa && { backgroundColor: categoria.cor },
                    ]}
                    onPress={() => setForm((f) => ({ ...f, categoria: categoria.valor }))}
                    disabled={salvando}
                  >
                    <View
                      style={[
                        s.categoriaPonto,
                        { backgroundColor: ativa ? "#fff" : categoria.cor },
                      ]}
                    />
                    <Text style={[s.categoriaTxt, ativa && s.categoriaTxtAtiva]}>
                      {categoria.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[s.row, s.formActions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity
              style={[s.btn, s.btnOutline]}
              onPress={cancelarCadastroLivro}
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
  badgeRowLivro: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, marginTop: 6 },
  categoriaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoriaBadgeTxt: { fontSize: 11, fontWeight: "700" },
  scanOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  scanFrame: { width: 250, height: 150, borderWidth: 2, borderColor: VERDE, borderRadius: 12, marginBottom: 20 },
  scanTxt: { color: "#fff", fontSize: 14, textAlign: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 8, borderRadius: 8 },
  scanFechar: { position: "absolute", top: 50, right: 20, backgroundColor: "rgba(0,0,0,0.6)", padding: 10, borderRadius: 20 },
  modal: { flex: 1, backgroundColor: "#f4f4f2", padding: 20, paddingTop: 50 },
  modalConteudo: { paddingBottom: 120 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#1a1a18", marginBottom: 16 },
  buscandoRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#E1F5EE", padding: 12, borderRadius: 10, marginBottom: 16 },
  capaPreview: { width: "100%", height: 160, borderRadius: 10, marginBottom: 16, backgroundColor: "#eee" },
  capaPreviewVazia: { alignItems: "center", justifyContent: "center" },
  btnRemoverCapa: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 },
  btnRemoverCapaTxt: { color: "#A32D2D", fontWeight: "600", fontSize: 13 },
  uploadTxt: { color: VERDE, fontSize: 13, textAlign: "center", marginBottom: 12, fontWeight: "600" },
  categoriasRow: { flexDirection: "row", gap: 8, paddingHorizontal: 10 },
  categoriaBtn: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#fff",
  },
  categoriaPonto: { width: 9, height: 9, borderRadius: 5 },
  categoriaTxt: { fontSize: 12, fontWeight: "700", color: "#333" },
  categoriaTxtAtiva: { color: "#fff" },
  formActions: { marginTop: 8 },
  label: { fontSize: 12, color: "#666", marginBottom: 4, fontWeight: "500" },
});
