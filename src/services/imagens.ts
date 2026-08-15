import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { deleteObject, getDownloadURL, ref, uploadString } from 'firebase/storage';
import { storage } from './firebase';

export interface ImagemLivroResultado {
  dataUrl: string;
}

export interface ImagemLivroUpload {
  url: string;
  storagePath: string;
}

const criarCaminhoCapaLivro = () =>
  `livros/capas/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;

export const prepararImagemLivro = async (
  uri: string,
  onProgress?: (progresso: number) => void
): Promise<ImagemLivroResultado> => {
  onProgress?.(0.25);

  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 420 });
  const imagem = await context.renderAsync();

  onProgress?.(0.65);

  const imagemComprimida = await imagem.saveAsync({
    base64: true,
    compress: 0.55,
    format: SaveFormat.JPEG,
  });

  if (!imagemComprimida.base64) {
    throw new Error('Não foi possível preparar a imagem da capa.');
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
