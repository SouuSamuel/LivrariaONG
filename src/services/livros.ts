import {
  QueryDocumentSnapshot,
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  type DocumentData,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from './firebase';
import { Emprestimo, Livro } from '../types';

const col = collection(db, 'livros');

export const LIVROS_PAGE_SIZE = 50;

export type CategoriaLivroCanonica = 'adulto' | 'crianca' | 'juvenil';

export const CATEGORIAS_LIVRO: Array<{
  valor: CategoriaLivroCanonica;
  label: string;
  cor: string;
}> = [
  { valor: 'adulto', label: 'Adulto', cor: '#185FA5' },
  { valor: 'crianca', label: 'Criança', cor: '#1D9E75' },
  { valor: 'juvenil', label: 'Juvenil', cor: '#A32D2D' },
];

export interface LivrosPagina {
  livros: Livro[];
  ultimoDoc: QueryDocumentSnapshot<DocumentData> | null;
  temMais: boolean;
}

const texto = (valor: unknown) => (typeof valor === 'string' ? valor : '');
const textoLimpo = (valor: unknown) => texto(valor).trim();

const numeroPositivo = (valor: unknown): number | undefined => {
  if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0) {
    return valor;
  }
  if (typeof valor === 'string' && valor.trim()) {
    const parsed = Number(valor);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
};

export const normalizarTextoBusca = (valor: string) =>
  valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const montarTextoBuscaLivro = (livro: Partial<Livro>) =>
  normalizarTextoBusca(
    [
      livro.titulo,
      livro.autor,
      livro.editora,
      livro.categoria,
      livro.isbn,
      livro.codigoBarras,
    ]
      .filter(Boolean)
      .join(' ')
  );

export const normalizarCategoriaLivro = (categoria: unknown): CategoriaLivroCanonica | '' => {
  const valor = normalizarTextoBusca(texto(categoria));
  if (valor === 'adulto') return 'adulto';
  if (valor === 'crianca' || valor === 'criança') return 'crianca';
  if (valor === 'juvenil') return 'juvenil';
  return '';
};

export const obterCategoriaLivro = (categoria: unknown) => {
  const canonica = normalizarCategoriaLivro(categoria);
  const encontrada = CATEGORIAS_LIVRO.find((item) => item.valor === canonica);
  if (encontrada) return encontrada;

  const legada = textoLimpo(categoria);
  return legada
    ? { valor: legada, label: legada, cor: '#777', legado: true }
    : { valor: '', label: 'Sem categoria', cor: '#777', legado: true };
};

const atribuirTexto = (destino: Record<string, unknown>, chave: string, valor: unknown) => {
  const limpo = textoLimpo(valor);
  if (limpo) destino[chave] = limpo;
};

const atribuirNumero = (destino: Record<string, unknown>, chave: string, valor: unknown) => {
  const numero = numeroPositivo(valor);
  if (numero !== undefined && Number.isFinite(numero)) destino[chave] = numero;
};

export const prepararLivroParaFirestore = (livro: Partial<Livro>) => {
  const quantidadeTotal = Math.max(numeroPositivo(livro.quantidadeTotal) ?? 1, 1);
  const quantidadeDisponivel = Math.min(
    Math.max(numeroPositivo(livro.quantidadeDisponivel) ?? quantidadeTotal, 0),
    quantidadeTotal
  );
  const categoria = normalizarCategoriaLivro(livro.categoria) || 'adulto';

  const dados: Record<string, unknown> = {
    titulo: textoLimpo(livro.titulo),
    autor: textoLimpo(livro.autor),
    editora: textoLimpo(livro.editora),
    ano: numeroPositivo(livro.ano) ?? 0,
    isbn: textoLimpo(livro.isbn),
    codigoBarras: textoLimpo(livro.codigoBarras),
    categoria,
    status: 'Disponível',
    imagem: textoLimpo(livro.imagem),
    quantidadeTotal,
    quantidadeDisponivel,
    dataCadastro: textoLimpo(livro.dataCadastro) || new Date().toISOString(),
  };

  atribuirTexto(dados, 'isbn10', livro.isbn10);
  atribuirTexto(dados, 'isbn13', livro.isbn13);
  atribuirTexto(dados, 'subtitulo', livro.subtitulo);
  atribuirTexto(dados, 'dataPublicacao', livro.dataPublicacao);
  atribuirNumero(dados, 'paginas', livro.paginas);
  atribuirTexto(dados, 'descricao', livro.descricao);
  atribuirTexto(dados, 'idioma', livro.idioma);
  atribuirTexto(dados, 'fonteDados', livro.fonteDados);
  atribuirTexto(dados, 'imagemStoragePath', livro.imagemStoragePath);

  dados.busca = montarTextoBuscaLivro(dados as Partial<Livro>);

  return dados as unknown as Livro;
};

export const normalizarLivroDados = (id: string, data: DocumentData): Livro => {
  const quantidadeTotal =
    numeroPositivo(data.quantidadeTotal) ??
    numeroPositivo(data.quantidade) ??
    numeroPositivo(data.totalExemplares) ??
    numeroPositivo(data.exemplares) ??
    1;

  const quantidadeDisponivel =
    numeroPositivo(data.quantidadeDisponivel) ??
    numeroPositivo(data.disponiveis) ??
    numeroPositivo(data.exemplaresDisponiveis);

  const statusBruto = texto(data.status).toLowerCase();
  const booleanDisponivel =
    typeof data.disponivel === 'boolean'
      ? data.disponivel
      : typeof data.available === 'boolean'
        ? data.available
        : undefined;
  const emprestado = data.emprestado === true || statusBruto.includes('emprest');
  const indisponivelInformado =
    booleanDisponivel === false ||
    data.emprestado === true ||
    statusBruto.includes('indispon');

  const status: Livro['status'] =
    quantidadeDisponivel !== undefined
      ? quantidadeDisponivel > 0
        ? 'Disponível'
        : 'Emprestado'
      : booleanDisponivel === false || emprestado
        ? 'Emprestado'
        : 'Disponível';

  const livro: Livro = {
    id,
    titulo: texto(data.titulo),
    autor: texto(data.autor),
    editora: texto(data.editora),
    ano: numeroPositivo(data.ano) ?? 0,
    isbn: texto(data.isbn),
    codigoBarras: texto(data.codigoBarras),
    categoria: texto(data.categoria),
    status,
    imagem:
      texto(data.imagem) ||
      texto(data.fotoUrl) ||
      texto(data.capaUrl) ||
      texto(data.coverUrl) ||
      texto(data.imageUrl),
    imagemStoragePath:
      texto(data.imagemStoragePath) ||
      texto(data.fotoStoragePath) ||
      texto(data.capaStoragePath),
    quantidadeTotal,
    quantidadeDisponivel: quantidadeDisponivel ?? undefined,
    quantidadeDisponivelInformada: quantidadeDisponivel !== undefined,
    indisponivelInformado,
    busca: texto(data.busca),
    dataCadastro: texto(data.dataCadastro),
  };

  return {
    ...livro,
    busca: livro.busca || montarTextoBuscaLivro(livro),
  };
};

const normalizarSnap = (snap: QueryDocumentSnapshot<DocumentData>) =>
  normalizarLivroDados(snap.id, snap.data());

export const calcularQuantidadeDisponivel = (
  livro: Livro,
  emprestimosAtivos: Emprestimo[] = []
) => {
  if (livro.quantidadeDisponivelInformada) {
    return Math.max(livro.quantidadeDisponivel ?? 0, 0);
  }
  if (livro.indisponivelInformado) return 0;

  const total = Math.max(livro.quantidadeTotal ?? 1, 0);
  const ativos = emprestimosAtivos.filter(
    (emp) => emp.livroId === livro.id && emp.status === 'Emprestado'
  ).length;

  return Math.max(total - ativos, 0);
};

export const livroTemExemplarDisponivel = (
  livro: Livro,
  emprestimosAtivos: Emprestimo[] = []
) => calcularQuantidadeDisponivel(livro, emprestimosAtivos) > 0;

export const adicionarLivro = (livro: Partial<Livro>) =>
  addDoc(col, prepararLivroParaFirestore(livro));

export const buscarLivros = async (): Promise<Livro[]> => {
  const snap = await getDocs(col);
  return snap.docs.map(normalizarSnap);
};

export const buscarLivrosPagina = async (
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = LIVROS_PAGE_SIZE
): Promise<LivrosPagina> => {
  const constraints: QueryConstraint[] = [orderBy(documentId()), limit(pageSize)];
  if (cursor) constraints.push(startAfter(cursor));

  const snap = await getDocs(query(col, ...constraints));

  return {
    livros: snap.docs.map(normalizarSnap),
    ultimoDoc: snap.docs[snap.docs.length - 1] ?? null,
    temMais: snap.docs.length === pageSize,
  };
};

export const buscarLivrosPorTexto = async (termo: string): Promise<Livro[]> => {
  const termoNormalizado = normalizarTextoBusca(termo);
  if (!termoNormalizado) return buscarLivros();

  const livros = await buscarLivros();
  return livros.filter((livro) =>
    (livro.busca || montarTextoBuscaLivro(livro)).includes(termoNormalizado)
  );
};

export const atualizarLivro = (id: string, dados: Partial<Livro>) =>
  updateDoc(doc(db, 'livros', id), dados);

export const excluirLivro = (id: string) =>
  deleteDoc(doc(db, 'livros', id));
