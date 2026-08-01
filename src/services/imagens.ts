import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface ImagemLivroResultado {
  dataUrl: string;
}

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

export const removerImagemLivro = async (_storagePath?: string) => {};
