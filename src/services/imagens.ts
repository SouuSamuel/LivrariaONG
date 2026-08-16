import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { deleteObject, getDownloadURL, ref, uploadString } from 'firebase/storage';
import { auth, storage } from './firebase';

export interface ImagemLivroResultado {
  dataUrl: string;
}

export interface ImagemLivroUpload {
  url: string;
  storagePath: string;
}

const criarCaminhoCapaLivro = () =>
  `livros/capas/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

const criarErroImagem = (code: string, message: string, cause?: unknown) => {
  const erro = new Error(message);
  (erro as any).code = code;
  (erro as any).cause = cause;
  return erro;
};

export const descreverErroImagem = (erro: any) => {
  const code = typeof erro?.code === 'string' ? erro.code : 'storage/unknown';
  const message =
    typeof erro?.message === 'string' && erro.message.trim()
      ? erro.message
      : 'Falha desconhecida ao processar ou enviar a imagem.';

  let mensagemUsuario = 'Não foi possível enviar a capa para o Firebase Storage.';
  if (code === 'storage/unauthenticated') {
    mensagemUsuario = 'Você precisa estar logado para enviar uma capa.';
  } else if (code === 'storage/unauthorized') {
    mensagemUsuario = 'O Firebase Storage bloqueou o envio da capa pelas regras de segurança.';
  } else if (code === 'storage/bucket-not-found') {
    mensagemUsuario = 'O bucket do Firebase Storage não foi encontrado ou não está configurado.';
  } else if (code === 'storage/missing-bucket-config') {
    mensagemUsuario = 'A configuração storageBucket do Firebase não está disponível no app.';
  } else if (code === 'storage/invalid-data-url') {
    mensagemUsuario = 'A imagem preparada não está em um formato aceito para upload.';
  } else if (code === 'image/invalid-uri') {
    mensagemUsuario = 'A imagem escolhida não possui um endereço local válido.';
  } else if (code === 'image/prepare-failed') {
    mensagemUsuario = 'Não foi possível preparar a imagem escolhida.';
  }

  return { code, message, mensagemUsuario };
};

export const prepararImagemLivro = async (
  uri: string,
  onProgress?: (progresso: number) => void
): Promise<ImagemLivroResultado> => {
  if (!uri || !/^(file|content|asset):\/\//.test(uri)) {
    throw criarErroImagem('image/invalid-uri', 'URI local da imagem inválida ou incompatível.');
  }

  onProgress?.(0.25);

  let imagem;
  try {
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: 420 });
    imagem = await context.renderAsync();
  } catch (e) {
    throw criarErroImagem('image/prepare-failed', 'Falha ao redimensionar a imagem local.', e);
  }

  onProgress?.(0.65);

  let imagemComprimida;
  try {
    imagemComprimida = await imagem.saveAsync({
      base64: true,
      compress: 0.55,
      format: SaveFormat.JPEG,
    });
  } catch (e) {
    throw criarErroImagem('image/prepare-failed', 'Falha ao comprimir a imagem local.', e);
  }

  if (!imagemComprimida.base64) {
    throw criarErroImagem('image/prepare-failed', 'Imagem comprimida sem conteúdo base64.');
  }

  onProgress?.(1);

  return {
    dataUrl: `data:image/jpeg;base64,${imagemComprimida.base64}`,
  };
};

export const enviarImagemLivro = async (
  dataUrl: string,
  storagePath = criarCaminhoCapaLivro()
): Promise<ImagemLivroUpload> => {
  if (!auth.currentUser) {
    throw criarErroImagem('storage/unauthenticated', 'Usuário não autenticado para upload no Storage.');
  }
  if (!storage.app.options.storageBucket) {
    throw criarErroImagem('storage/missing-bucket-config', 'Configuração storageBucket ausente no Firebase.');
  }
  if (!dataUrl.startsWith('data:image/jpeg;base64,')) {
    throw criarErroImagem('storage/invalid-data-url', 'Imagem preparada em formato inválido para upload.');
  }

  const imagemRef = ref(storage, storagePath);
  await uploadString(imagemRef, dataUrl, 'data_url', {
    contentType: 'image/jpeg',
  });

  return {
    url: await getDownloadURL(imagemRef),
    storagePath,
  };
};

export const removerImagemLivro = async (storagePath?: string) => {
  if (!storagePath) return;

  try {
    await deleteObject(ref(storage, storagePath));
  } catch (e: any) {
    if (e?.code !== 'storage/object-not-found') throw e;
  }
};
