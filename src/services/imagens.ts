import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

export interface ImagemLivroEntrada {
  uri: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface ImagemLivroResultado {
  uri: string;
  contentType: string;
}

export interface ImagemLivroUpload {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

interface ContextoErroImagem {
  etapa?: string;
  uri?: string;
  mime?: string;
  status?: number;
}

type CloudinaryResposta = {
  secure_url?: string;
  public_id?: string;
  resource_type?: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  error?: {
    message?: string;
  };
};

const CLOUDINARY_CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const DIMENSAO_MAXIMA_CAPA = 1000;

const criarErroImagem = (
  code: string,
  message: string,
  cause?: unknown,
  contexto: ContextoErroImagem = {}
) => {
  const erro = new Error(message);
  (erro as any).code = code;
  (erro as any).cause = cause;
  (erro as any).etapa = contexto.etapa;
  (erro as any).uri = contexto.uri;
  (erro as any).mime = contexto.mime;
  (erro as any).status = contexto.status;
  return erro;
};

const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');

const obterEsquemaUri = (uri?: string) =>
  uri?.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1] || 'sem-esquema';

const descreverUriSemCaminho = (uri?: string) => {
  if (!uri) return undefined;
  const extensao = uri.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/)?.[1]?.toLowerCase();
  return `${obterEsquemaUri(uri)}://${extensao ? `*.${extensao}` : 'sem-extensao'}`;
};

const gerarNomeArquivoCapa = () =>
  `capa-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

const obterConfigCloudinary = () => {
  const cloudName = texto(CLOUDINARY_CLOUD_NAME);
  const uploadPreset = texto(CLOUDINARY_UPLOAD_PRESET);

  if (!cloudName || !uploadPreset) {
    throw criarErroImagem(
      'cloudinary/config-missing',
      'Configuração do Cloudinary ausente no aplicativo.',
      undefined,
      { etapa: 'validacao-config-cloudinary' }
    );
  }

  return { cloudName, uploadPreset };
};

const criarDiagnosticoCloudinary = ({
  etapa,
  uri,
  mime,
  status,
  mensagem,
}: {
  etapa: string;
  uri?: string;
  mime?: string;
  status?: number;
  mensagem?: string;
}) => ({
  metodo: 'cloudinary-formdata',
  etapa,
  esquemaUri: obterEsquemaUri(uri),
  mime,
  status,
  mensagem,
  plataforma: Platform.OS,
});

export const descreverErroImagem = (erro: any, contexto: ContextoErroImagem = {}) => {
  const code = typeof erro?.code === 'string' ? erro.code : 'cloudinary/upload-failed';
  const message =
    typeof erro?.message === 'string' && erro.message.trim()
      ? erro.message
      : 'Falha desconhecida ao processar ou enviar a imagem.';
  const etapa = erro?.etapa || contexto.etapa || 'desconhecida';
  const mime = contexto.mime || erro?.mime;
  const uri = descreverUriSemCaminho(contexto.uri || erro?.uri);
  const status =
    typeof erro?.status === 'number'
      ? erro.status
      : typeof contexto.status === 'number'
        ? contexto.status
        : undefined;

  let mensagemUsuario = 'Não foi possível enviar a capa. Verifique a conexão e tente novamente.';
  if (code === 'cloudinary/config-missing') {
    mensagemUsuario = 'Configuração do Cloudinary ausente. Verifique as variáveis do ambiente.';
  } else if (code === 'image/invalid-uri') {
    mensagemUsuario = 'A imagem escolhida não possui um endereço local válido.';
  } else if (code === 'image/prepare-failed') {
    mensagemUsuario = 'Não foi possível preparar a imagem escolhida.';
  } else if (code === 'cloudinary/invalid-response') {
    mensagemUsuario = 'O Cloudinary respondeu sem os dados necessários da capa.';
  }

  return { code, message, mensagemUsuario, etapa, plataforma: Platform.OS, uri, mime, status };
};

const calcularResize = (entrada: ImagemLivroEntrada) => {
  const width = typeof entrada.width === 'number' && Number.isFinite(entrada.width) ? entrada.width : 0;
  const height = typeof entrada.height === 'number' && Number.isFinite(entrada.height) ? entrada.height : 0;

  if (width <= DIMENSAO_MAXIMA_CAPA && height <= DIMENSAO_MAXIMA_CAPA) return undefined;
  if (width >= height && width > 0) return { width: DIMENSAO_MAXIMA_CAPA };
  if (height > 0) return { height: DIMENSAO_MAXIMA_CAPA };
  return { width: DIMENSAO_MAXIMA_CAPA };
};

export const prepararImagemLivro = async (
  entrada: string | ImagemLivroEntrada,
  onProgress?: (progresso: number) => void
): Promise<ImagemLivroResultado> => {
  const dadosEntrada: ImagemLivroEntrada =
    typeof entrada === 'string' ? { uri: entrada, mimeType: 'image/jpeg' } : entrada;
  const { uri } = dadosEntrada;

  if (!uri || !/^(file|content|asset):\/\//.test(uri)) {
    throw criarErroImagem('image/invalid-uri', 'URI local da imagem inválida ou incompatível.', undefined, {
      etapa: 'validacao-uri',
      uri,
      mime: dadosEntrada.mimeType,
    });
  }

  onProgress?.(0.25);

  let imagem;
  try {
    const context = ImageManipulator.manipulate(uri);
    const resize = calcularResize(dadosEntrada);
    if (resize) context.resize(resize);
    imagem = await context.renderAsync();
  } catch (e) {
    throw criarErroImagem('image/prepare-failed', 'Falha ao redimensionar a imagem local.', e, {
      etapa: 'redimensionar',
      uri,
      mime: dadosEntrada.mimeType,
    });
  }

  onProgress?.(0.7);

  let imagemComprimida: { uri?: string };
  try {
    imagemComprimida = await imagem.saveAsync({
      compress: 0.75,
      format: SaveFormat.JPEG,
    });
  } catch (e) {
    throw criarErroImagem('image/prepare-failed', 'Falha ao comprimir a imagem local.', e, {
      etapa: 'comprimir',
      uri,
      mime: 'image/jpeg',
    });
  }

  if (!imagemComprimida.uri) {
    throw criarErroImagem('image/prepare-failed', 'Imagem comprimida sem URI local.', undefined, {
      etapa: 'comprimir',
      uri,
      mime: 'image/jpeg',
    });
  }

  onProgress?.(1);

  return {
    uri: imagemComprimida.uri,
    contentType: 'image/jpeg',
  };
};

const validarRespostaCloudinary = (
  resposta: CloudinaryResposta,
  contexto: ContextoErroImagem
): ImagemLivroUpload => {
  const secureUrl = texto(resposta.secure_url);
  const publicId = texto(resposta.public_id);

  if (!secureUrl || !publicId) {
    throw criarErroImagem(
      'cloudinary/invalid-response',
      'Resposta do Cloudinary sem secure_url ou public_id.',
      undefined,
      contexto
    );
  }

  if (resposta.resource_type && resposta.resource_type !== 'image') {
    throw criarErroImagem(
      'cloudinary/invalid-response',
      `Resposta do Cloudinary com resource_type inválido: ${resposta.resource_type}`,
      undefined,
      contexto
    );
  }

  return {
    url: secureUrl,
    publicId,
    width: typeof resposta.width === 'number' ? resposta.width : undefined,
    height: typeof resposta.height === 'number' ? resposta.height : undefined,
    format: texto(resposta.format) || undefined,
    bytes: typeof resposta.bytes === 'number' ? resposta.bytes : undefined,
  };
};

export const enviarImagemLivro = async (
  imagem: ImagemLivroResultado,
  _destinoLegado?: string,
  onProgress?: (progresso: number) => void
): Promise<ImagemLivroUpload> => {
  const { cloudName, uploadPreset } = obterConfigCloudinary();

  if (!imagem.uri || !imagem.contentType?.startsWith('image/')) {
    throw criarErroImagem('cloudinary/invalid-image', 'Imagem preparada em formato inválido para upload.', undefined, {
      etapa: 'validacao-upload-cloudinary',
      uri: imagem.uri,
      mime: imagem.contentType,
    });
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`;
  const formData = new FormData();
  formData.append('file', {
    uri: imagem.uri,
    type: imagem.contentType || 'image/jpeg',
    name: gerarNomeArquivoCapa(),
  } as any);
  formData.append('upload_preset', uploadPreset);

  console.log('Upload de capa: enviando para Cloudinary.', criarDiagnosticoCloudinary({
    etapa: 'upload-cloudinary',
    uri: imagem.uri,
    mime: imagem.contentType,
  }));

  let respostaHttp: Response;
  onProgress?.(0.1);
  try {
    respostaHttp = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });
  } catch (e) {
    console.error('Falha de rede ao enviar capa para Cloudinary:', criarDiagnosticoCloudinary({
      etapa: 'upload-cloudinary',
      uri: imagem.uri,
      mime: imagem.contentType,
      mensagem: (e as any)?.message,
    }));
    throw criarErroImagem(
      'cloudinary/network-failed',
      (e as any)?.message || 'Falha de rede no upload para o Cloudinary.',
      e,
      {
        etapa: 'upload-cloudinary',
        uri: imagem.uri,
        mime: imagem.contentType,
      }
    );
  }

  onProgress?.(0.75);

  let respostaJson: CloudinaryResposta;
  try {
    respostaJson = await respostaHttp.json();
  } catch (e) {
    console.error('Falha ao ler resposta do Cloudinary:', criarDiagnosticoCloudinary({
      etapa: 'parse-resposta-cloudinary',
      uri: imagem.uri,
      mime: imagem.contentType,
      status: respostaHttp.status,
      mensagem: (e as any)?.message,
    }));
    throw criarErroImagem(
      'cloudinary/invalid-response',
      'Resposta do Cloudinary não pôde ser interpretada.',
      e,
      {
        etapa: 'parse-resposta-cloudinary',
        uri: imagem.uri,
        mime: imagem.contentType,
        status: respostaHttp.status,
      }
    );
  }

  if (!respostaHttp.ok) {
    const mensagem = texto(respostaJson.error?.message) || `HTTP ${respostaHttp.status}`;
    console.error('Cloudinary recusou upload da capa:', criarDiagnosticoCloudinary({
      etapa: 'upload-cloudinary',
      uri: imagem.uri,
      mime: imagem.contentType,
      status: respostaHttp.status,
      mensagem,
    }));
    throw criarErroImagem('cloudinary/upload-failed', mensagem, undefined, {
      etapa: 'upload-cloudinary',
      uri: imagem.uri,
      mime: imagem.contentType,
      status: respostaHttp.status,
    });
  }

  const resultado = validarRespostaCloudinary(respostaJson, {
    etapa: 'validar-resposta-cloudinary',
    uri: imagem.uri,
    mime: imagem.contentType,
    status: respostaHttp.status,
  });
  onProgress?.(1);
  return resultado;
};

export const removerImagemLivro = async (identificador?: string) => {
  if (!identificador) return;

  console.log(
    'Remoção de capa ignorada no cliente. Cloudinary destroy exige backend ou função serverless.',
    { origem: identificador.includes('/') ? 'legado-ou-cloudinary' : 'desconhecida' }
  );
};
