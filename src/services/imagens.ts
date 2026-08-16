import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Platform } from 'react-native';
import { auth, storage } from './firebase';

export interface ImagemLivroResultado {
  uri: string;
  contentType: string;
}

export interface ImagemLivroUpload {
  url: string;
  storagePath: string;
  metodo: 'xhr-blob' | 'storage-rest';
}

const criarCaminhoCapaLivro = () =>
  `livros/capas/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

interface ContextoErroImagem {
  etapa?: string;
  uri?: string;
  mime?: string;
}

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
  return erro;
};

const descreverUriSemCaminho = (uri?: string) => {
  if (!uri) return undefined;
  const esquema = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1] || 'sem-esquema';
  const extensao = uri.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/)?.[1]?.toLowerCase();
  return `${esquema}://${extensao ? `*.${extensao}` : 'sem-extensao'}`;
};

const obterEsquemaUri = (uri?: string) =>
  uri?.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1] || 'sem-esquema';

const obterBucketStorage = () =>
  storage.app.options.storageBucket?.replace(/^gs:\/\//, '');

const criarDiagnosticoUpload = ({
  metodo,
  uri,
  mime,
  blob,
  etapa,
  erro,
}: {
  metodo: ImagemLivroUpload['metodo'];
  uri: string;
  mime?: string;
  blob?: Blob;
  etapa: string;
  erro?: any;
}) => ({
  metodo,
  esquemaUri: obterEsquemaUri(uri),
  mime,
  tamanhoBlob: typeof blob?.size === 'number' ? blob.size : undefined,
  etapa,
  code: typeof erro?.code === 'string' ? erro.code : undefined,
  message: typeof erro?.message === 'string' ? erro.message : undefined,
});

const erroIndicaConversaoArrayBuffer = (erro: any) => {
  const message = String(erro?.message || '').toLowerCase();
  return (
    message.includes('arraybuffer') ||
    message.includes('arraybufferview') ||
    (erro?.code === 'storage/unknown' && message.includes('blob'))
  );
};

export const descreverErroImagem = (erro: any, contexto: ContextoErroImagem = {}) => {
  const code = typeof erro?.code === 'string' ? erro.code : 'storage/unknown';
  const message =
    typeof erro?.message === 'string' && erro.message.trim()
      ? erro.message
      : 'Falha desconhecida ao processar ou enviar a imagem.';
  const etapa = erro?.etapa || contexto.etapa || 'desconhecida';
  const mime = contexto.mime || erro?.mime;
  const uri = descreverUriSemCaminho(contexto.uri || erro?.uri);

  let mensagemUsuario = 'Não foi possível enviar a capa para o Firebase Storage.';
  if (code === 'storage/unauthenticated') {
    mensagemUsuario = 'Você precisa estar logado para enviar uma capa.';
  } else if (code === 'storage/unauthorized') {
    mensagemUsuario = 'O Firebase Storage bloqueou o envio da capa pelas regras de segurança.';
  } else if (code === 'storage/bucket-not-found') {
    mensagemUsuario = 'O bucket do Firebase Storage não foi encontrado ou não está configurado.';
  } else if (code === 'storage/missing-bucket-config') {
    mensagemUsuario = 'A configuração storageBucket do Firebase não está disponível no app.';
  } else if (code === 'storage/invalid-image') {
    mensagemUsuario = 'A imagem preparada não está em um formato aceito para upload.';
  } else if (code === 'image/invalid-uri') {
    mensagemUsuario = 'A imagem escolhida não possui um endereço local válido.';
  } else if (code === 'image/prepare-failed') {
    mensagemUsuario = 'Não foi possível preparar a imagem escolhida.';
  } else if (code === 'image/blob-fetch-failed') {
    mensagemUsuario = 'Não foi possível ler o arquivo local da capa.';
  } else if (code === 'image/blob-xhr-failed') {
    mensagemUsuario = 'Não foi possível ler o arquivo local da capa.';
  } else if (code === 'storage/rest-upload-failed') {
    mensagemUsuario = 'Não foi possível enviar a capa pelo Firebase Storage.';
  }

  return { code, message, mensagemUsuario, etapa, plataforma: Platform.OS, uri, mime };
};

export const prepararImagemLivro = async (
  uri: string,
  onProgress?: (progresso: number) => void
): Promise<ImagemLivroResultado> => {
  if (!uri || !/^(file|content|asset):\/\//.test(uri)) {
    throw criarErroImagem('image/invalid-uri', 'URI local da imagem inválida ou incompatível.', undefined, {
      etapa: 'validacao-uri',
      uri,
    });
  }

  onProgress?.(0.25);

  let imagem;
  try {
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: 420 });
    imagem = await context.renderAsync();
  } catch (e) {
    throw criarErroImagem('image/prepare-failed', 'Falha ao redimensionar a imagem local.', e, {
      etapa: 'redimensionar',
      uri,
    });
  }

  onProgress?.(0.65);

  let imagemComprimida: { uri?: string };
  try {
    imagemComprimida = await imagem.saveAsync({
      compress: 0.55,
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

const lerBlobLocalViaXhr = async (uri: string): Promise<Blob> =>
  new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        reject(criarErroImagem(
          'image/blob-xhr-failed',
          `Falha ao ler imagem local: HTTP ${xhr.status}`,
          undefined,
          {
            etapa: 'uri-para-blob-xhr',
            uri,
          }
        ));
      }
    };

    xhr.onerror = () => {
      reject(criarErroImagem(
        'image/blob-xhr-failed',
        'Falha ao converter a URI local em Blob',
        undefined,
        {
          etapa: 'uri-para-blob-xhr',
          uri,
        }
      ));
    };

    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });

const enviarBlobPorRest = async (
  blob: Blob,
  imagem: ImagemLivroResultado,
  storagePath: string
): Promise<ImagemLivroUpload> => {
  const usuario = auth.currentUser;
  if (!usuario) {
    throw criarErroImagem('storage/unauthenticated', 'Usuário não autenticado para upload no Storage.', undefined, {
      etapa: 'autenticacao-rest',
      uri: imagem.uri,
      mime: imagem.contentType,
    });
  }

  const bucket = obterBucketStorage();
  if (!bucket) {
    throw criarErroImagem('storage/missing-bucket-config', 'Configuração storageBucket ausente no Firebase.', undefined, {
      etapa: 'configuracao-storage-rest',
      uri: imagem.uri,
      mime: imagem.contentType,
    });
  }

  const token = await usuario.getIdToken();
  const contentType = imagem.contentType || 'image/jpeg';
  const endpoint =
    `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?name=${encodeURIComponent(storagePath)}`;

  const resposta = await new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.onload = () => {
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (ok) {
        resolve(xhr.response || {});
        return;
      }

      reject(criarErroImagem(
        'storage/rest-upload-failed',
        `Falha no upload REST do Firebase Storage: HTTP ${xhr.status}`,
        undefined,
        {
          etapa: 'upload-storage-rest',
          uri: imagem.uri,
          mime: contentType,
        }
      ));
    };

    xhr.onerror = () => {
      reject(criarErroImagem(
        'storage/rest-upload-failed',
        'Falha de rede no upload REST do Firebase Storage.',
        undefined,
        {
          etapa: 'upload-storage-rest',
          uri: imagem.uri,
          mime: contentType,
        }
      ));
    };

    xhr.responseType = 'json';
    xhr.open('POST', endpoint, true);
    xhr.setRequestHeader('Authorization', `Firebase ${token}`);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.send(blob);
  });

  const downloadTokens =
    typeof resposta?.downloadTokens === 'string'
      ? resposta.downloadTokens
      : typeof resposta?.metadata?.firebaseStorageDownloadTokens === 'string'
        ? resposta.metadata.firebaseStorageDownloadTokens
        : '';
  const downloadToken = downloadTokens.split(',').find(Boolean);
  const url = downloadToken
    ? `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(downloadToken)}`
    : await getDownloadURL(ref(storage, storagePath));

  return {
    url,
    storagePath,
    metodo: 'storage-rest',
  };
};

export const enviarImagemLivro = async (
  imagem: ImagemLivroResultado,
  storagePath = criarCaminhoCapaLivro(),
  onProgress?: (progresso: number) => void
): Promise<ImagemLivroUpload> => {
  if (!auth.currentUser) {
    throw criarErroImagem('storage/unauthenticated', 'Usuário não autenticado para upload no Storage.', undefined, {
      etapa: 'autenticacao',
      uri: imagem.uri,
      mime: imagem.contentType,
    });
  }
  if (!storage.app.options.storageBucket) {
    throw criarErroImagem('storage/missing-bucket-config', 'Configuração storageBucket ausente no Firebase.', undefined, {
      etapa: 'configuracao-storage',
      uri: imagem.uri,
      mime: imagem.contentType,
    });
  }
  if (!imagem.uri || !imagem.contentType?.startsWith('image/')) {
    throw criarErroImagem('storage/invalid-image', 'Imagem preparada em formato inválido para upload.', undefined, {
      etapa: 'validacao-upload',
      uri: imagem.uri,
      mime: imagem.contentType,
    });
  }

  const imagemRef = ref(storage, storagePath);
  let blob: Blob | undefined;

  try {
    onProgress?.(0.1);
    blob = await lerBlobLocalViaXhr(imagem.uri);
    onProgress?.(0.45);

    if (typeof blob.size === 'number' && blob.size <= 0) {
      throw criarErroImagem('image/blob-xhr-failed', 'Arquivo local da capa veio vazio.', undefined, {
        etapa: 'uri-para-blob-xhr',
        uri: imagem.uri,
        mime: imagem.contentType,
      });
    }

    console.log('Upload de capa: Blob local preparado.', criarDiagnosticoUpload({
      metodo: 'xhr-blob',
      uri: imagem.uri,
      mime: imagem.contentType,
      blob,
      etapa: 'uri-para-blob-xhr',
    }));
  } catch (e: any) {
    if (e?.code) throw e;
    throw criarErroImagem('image/blob-xhr-failed', 'Falha ao ler a URI local como Blob.', e, {
      etapa: 'uri-para-blob-xhr',
      uri: imagem.uri,
      mime: imagem.contentType,
    });
  }

  try {
    onProgress?.(0.7);
    console.log('Upload de capa: tentando Firebase SDK.', criarDiagnosticoUpload({
      metodo: 'xhr-blob',
      uri: imagem.uri,
      mime: imagem.contentType,
      blob,
      etapa: 'upload-storage-sdk',
    }));

    await uploadBytes(imagemRef, blob, {
      contentType: imagem.contentType || 'image/jpeg',
    });
    onProgress?.(0.95);

    return {
      url: await getDownloadURL(imagemRef),
      storagePath,
      metodo: 'xhr-blob',
    };
  } catch (e) {
    const erroUpload = criarErroImagem(
      (e as any)?.code || 'storage/unknown',
      (e as any)?.message || 'Falha ao enviar Blob para o Firebase Storage.',
      e,
      {
        etapa: 'upload-storage-sdk',
        uri: imagem.uri,
        mime: imagem.contentType,
      }
    );

    console.error('Upload de capa: falha no Firebase SDK.', criarDiagnosticoUpload({
      metodo: 'xhr-blob',
      uri: imagem.uri,
      mime: imagem.contentType,
      blob,
      etapa: 'upload-storage-sdk',
      erro: erroUpload,
    }));

    if (!erroIndicaConversaoArrayBuffer(erroUpload)) {
      throw erroUpload;
    }

    console.log('Upload de capa: usando fallback REST.', criarDiagnosticoUpload({
      metodo: 'storage-rest',
      uri: imagem.uri,
      mime: imagem.contentType,
      blob,
      etapa: 'upload-storage-rest',
    }));

    try {
      const resultadoRest = await enviarBlobPorRest(blob, imagem, storagePath);
      onProgress?.(0.95);
      return resultadoRest;
    } catch (erroRest) {
      console.error('Upload de capa: falha no fallback REST.', criarDiagnosticoUpload({
        metodo: 'storage-rest',
        uri: imagem.uri,
        mime: imagem.contentType,
        blob,
        etapa: 'upload-storage-rest',
        erro: erroRest,
      }));
      throw erroRest;
    }
  } finally {
    (blob as any)?.close?.();
  }
};

export const removerImagemLivro = async (storagePath?: string) => {
  if (!storagePath) return;

  try {
    await deleteObject(ref(storage, storagePath));
  } catch (e: any) {
    if (e?.code !== 'storage/object-not-found') throw e;
  }
};
