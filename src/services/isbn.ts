import { Livro } from '../types';

const ISBN_TIMEOUT_MS = 6500;
const cacheISBN = new Map<string, Promise<BuscaISBNResultado>>();

export type FonteISBN = 'Google Books' | 'BrasilAPI' | 'Open Library';

export interface ISBNNormalizado {
  original: string;
  codigo: string;
  tipo: 'ISBN-10' | 'ISBN-13';
  isbn10?: string;
  isbn13?: string;
}

export interface LivroISBNNormalizado {
  fonte: FonteISBN;
  isbn10?: string;
  isbn13?: string;
  titulo?: string;
  subtitulo?: string;
  autores?: string[];
  editora?: string;
  dataPublicacao?: string;
  ano?: number;
  paginas?: number;
  descricao?: string;
  categorias?: string[];
  idioma?: string;
  capaUrl?: string;
}

export interface BuscaISBNResultado {
  encontrado: boolean;
  isbn: ISBNNormalizado;
  dados?: Partial<Livro>;
  fontes: FonteISBN[];
  resultados: LivroISBNNormalizado[];
  erros: FonteISBN[];
}

export interface UltimoScanISBN {
  codigo: string;
  timestamp: number;
}

export const normalizarCodigoISBN = (valor: string) =>
  valor.replace(/[^0-9xX]/g, '').toUpperCase();

export const deveIgnorarScanDuplicado = (
  ultimo: UltimoScanISBN | null,
  codigo: string,
  agora = Date.now(),
  intervaloMs = 3000
) => Boolean(ultimo?.codigo === codigo && agora - ultimo.timestamp < intervaloMs);

const somenteDigitos = (valor: string) => valor.replace(/\D/g, '');

export const validarISBN10 = (isbn: string) => {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;

  const soma = isbn.split('').reduce((total, char, index) => {
    const valor = char === 'X' ? 10 : Number(char);
    return total + valor * (10 - index);
  }, 0);

  return soma % 11 === 0;
};

export const validarISBN13 = (isbn: string) => {
  if (!/^\d{13}$/.test(isbn)) return false;

  const soma = isbn
    .slice(0, 12)
    .split('')
    .reduce((total, char, index) => {
      return total + Number(char) * (index % 2 === 0 ? 1 : 3);
    }, 0);
  const digito = (10 - (soma % 10)) % 10;

  return digito === Number(isbn[12]);
};

const calcularDigitoISBN13 = (base12: string) => {
  const soma = base12.split('').reduce((total, char, index) => {
    return total + Number(char) * (index % 2 === 0 ? 1 : 3);
  }, 0);
  return String((10 - (soma % 10)) % 10);
};

const calcularDigitoISBN10 = (base9: string) => {
  const soma = base9.split('').reduce((total, char, index) => {
    return total + Number(char) * (10 - index);
  }, 0);
  const resto = 11 - (soma % 11);
  if (resto === 10) return 'X';
  if (resto === 11) return '0';
  return String(resto);
};

const isbn10Para13 = (isbn10: string) => {
  const base = `978${isbn10.slice(0, 9)}`;
  return `${base}${calcularDigitoISBN13(base)}`;
};

const isbn13Para10 = (isbn13: string) => {
  if (!isbn13.startsWith('978')) return undefined;
  const base = isbn13.slice(3, 12);
  return `${base}${calcularDigitoISBN10(base)}`;
};

export const normalizarISBN = (valor: string): ISBNNormalizado | null => {
  const codigo = normalizarCodigoISBN(valor);

  if (codigo.length === 10 && validarISBN10(codigo)) {
    return {
      original: valor,
      codigo,
      tipo: 'ISBN-10',
      isbn10: codigo,
      isbn13: isbn10Para13(codigo),
    };
  }

  if (codigo.length === 13 && validarISBN13(codigo)) {
    return {
      original: valor,
      codigo,
      tipo: 'ISBN-13',
      isbn10: isbn13Para10(codigo),
      isbn13: codigo,
    };
  }

  return null;
};

const identificadoresISBN = (isbn: ISBNNormalizado) =>
  [isbn.codigo, isbn.isbn10, isbn.isbn13].filter(Boolean) as string[];

const contemISBN = (valores: unknown, isbn: ISBNNormalizado) => {
  const procurados = new Set(identificadoresISBN(isbn).map(normalizarCodigoISBN));
  const lista = Array.isArray(valores) ? valores : [valores];

  return lista.some((valor) => {
    if (typeof valor === 'string' || typeof valor === 'number') {
      return procurados.has(normalizarCodigoISBN(String(valor)));
    }
    return false;
  });
};

const texto = (valor: unknown) =>
  typeof valor === 'string' && valor.trim() ? valor.trim() : undefined;

const numero = (valor: unknown) => {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string' && valor.trim()) {
    const parsed = Number(valor);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const listaTexto = (valor: unknown) => {
  if (Array.isArray(valor)) {
    return valor.map((item) => texto(item)).filter(Boolean) as string[];
  }
  const unico = texto(valor);
  return unico ? [unico] : undefined;
};

const anoDeData = (valor?: string) => {
  const match = valor?.match(/\d{4}/);
  return match ? Number(match[0]) : undefined;
};

const https = (url?: string) => url?.replace(/^http:\/\//, 'https://');

const fetchJSONComTimeout = async (url: string, timeoutMs = ISBN_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resposta = await fetch(url, { signal: controller.signal });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return await resposta.json();
  } finally {
    clearTimeout(timer);
  }
};

const buscarGoogleBooks = async (isbn: ISBNNormalizado): Promise<LivroISBNNormalizado | null> => {
  const json = await fetchJSONComTimeout(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn.codigo}&maxResults=5`
  );
  const item = json.items?.find((volume: any) =>
    contemISBN(
      volume?.volumeInfo?.industryIdentifiers?.map((ident: any) => ident.identifier),
      isbn
    )
  );

  if (!item) return null;

  const info = item.volumeInfo || {};
  const identificadores = info.industryIdentifiers || [];
  const isbn10 = identificadores.find((ident: any) => ident.type === 'ISBN_10')?.identifier;
  const isbn13 = identificadores.find((ident: any) => ident.type === 'ISBN_13')?.identifier;
  const dataPublicacao = texto(info.publishedDate);

  return {
    fonte: 'Google Books',
    isbn10,
    isbn13,
    titulo: texto(info.title),
    subtitulo: texto(info.subtitle),
    autores: listaTexto(info.authors),
    editora: texto(info.publisher),
    dataPublicacao,
    ano: anoDeData(dataPublicacao),
    paginas: numero(info.pageCount),
    descricao: texto(info.description),
    categorias: listaTexto(info.categories),
    idioma: texto(info.language),
    capaUrl: https(info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail),
  };
};

const buscarBrasilAPI = async (isbn: ISBNNormalizado): Promise<LivroISBNNormalizado | null> => {
  const json = await fetchJSONComTimeout(
    `https://brasilapi.com.br/api/isbn/v1/${isbn.codigo}`
  );
  const ids = [
    json.isbn,
    json.isbn_10,
    json.isbn10,
    json.isbn_13,
    json.isbn13,
  ];

  if (!contemISBN(ids, isbn)) return null;

  const dataPublicacao = texto(json.published_date || json.data_publicacao || json.year || json.ano);

  return {
    fonte: 'BrasilAPI',
    isbn10: texto(json.isbn_10 || json.isbn10),
    isbn13: texto(json.isbn_13 || json.isbn13 || json.isbn),
    titulo: texto(json.title || json.titulo),
    subtitulo: texto(json.subtitle || json.subtitulo),
    autores: listaTexto(json.authors || json.autores),
    editora: texto(json.publisher || json.editora),
    dataPublicacao,
    ano: numero(json.year || json.ano) || anoDeData(dataPublicacao),
    paginas: numero(json.page_count || json.pageCount || json.paginas),
    descricao: texto(json.synopsis || json.description || json.sinopse),
    categorias: listaTexto(json.subjects || json.categories || json.categorias),
    idioma: texto(json.language || json.idioma),
    capaUrl: https(json.cover_url || json.coverUrl || json.capa),
  };
};

const buscarOpenLibrary = async (isbn: ISBNNormalizado): Promise<LivroISBNNormalizado | null> => {
  const json = await fetchJSONComTimeout(
    `https://openlibrary.org/search.json?isbn=${isbn.codigo}&fields=key,title,author_name,publisher,first_publish_year,publish_date,number_of_pages_median,isbn,cover_i,language&limit=5`
  );
  const doc = json.docs?.find((item: any) => contemISBN(item?.isbn, isbn));

  if (!doc) return null;

  const dataPublicacao = texto(doc.publish_date?.[0]) || texto(doc.first_publish_year);
  const capaISBN = isbn.isbn13 || isbn.isbn10 || isbn.codigo;

  return {
    fonte: 'Open Library',
    isbn10: doc.isbn?.find((item: string) => normalizarCodigoISBN(item).length === 10),
    isbn13: doc.isbn?.find((item: string) => normalizarCodigoISBN(item).length === 13),
    titulo: texto(doc.title),
    autores: listaTexto(doc.author_name),
    editora: texto(doc.publisher?.[0]),
    dataPublicacao,
    ano: numero(doc.first_publish_year) || anoDeData(dataPublicacao),
    paginas: numero(doc.number_of_pages_median),
    idioma: texto(doc.language?.[0]),
    capaUrl: capaISBN ? `https://covers.openlibrary.org/b/isbn/${capaISBN}-L.jpg` : undefined,
  };
};

const pontuarResultado = (resultado: LivroISBNNormalizado) => {
  return [
    resultado.titulo,
    resultado.autores?.length,
    resultado.editora,
    resultado.dataPublicacao || resultado.ano,
    resultado.paginas,
    resultado.descricao,
    resultado.categorias?.length,
    resultado.idioma,
    resultado.capaUrl,
  ].filter(Boolean).length;
};

const preencherSeMelhor = <T>(atual: T | undefined, proximo: T | undefined) =>
  atual === undefined || atual === null || atual === '' ? proximo || atual : atual;

const combinarResultados = (
  isbn: ISBNNormalizado,
  resultados: LivroISBNNormalizado[]
): Partial<Livro> => {
  const ordenados = [...resultados].sort((a, b) => pontuarResultado(b) - pontuarResultado(a));
  const combinado: Partial<Livro> = {
    isbn: isbn.isbn13 || isbn.isbn10 || isbn.codigo,
    codigoBarras: isbn.isbn13 || isbn.codigo,
    isbn10: isbn.isbn10,
    isbn13: isbn.isbn13,
    status: 'Disponível',
  };

  for (const resultado of ordenados) {
    combinado.titulo = preencherSeMelhor(combinado.titulo, resultado.titulo);
    combinado.subtitulo = preencherSeMelhor(combinado.subtitulo, resultado.subtitulo);
    combinado.autor = preencherSeMelhor(combinado.autor, resultado.autores?.join(', '));
    combinado.editora = preencherSeMelhor(combinado.editora, resultado.editora);
    combinado.dataPublicacao = preencherSeMelhor(combinado.dataPublicacao, resultado.dataPublicacao);
    combinado.ano = preencherSeMelhor(combinado.ano, resultado.ano);
    combinado.paginas = preencherSeMelhor(combinado.paginas, resultado.paginas);
    combinado.descricao = preencherSeMelhor(combinado.descricao, resultado.descricao);
    combinado.categoria = preencherSeMelhor(combinado.categoria, resultado.categorias?.join(', '));
    combinado.idioma = preencherSeMelhor(combinado.idioma, resultado.idioma);
    combinado.imagem = preencherSeMelhor(combinado.imagem, resultado.capaUrl);
  }

  combinado.fonteDados = ordenados.map((resultado) => resultado.fonte).join(', ');

  return combinado;
};

const buscarISBNSemCache = async (isbn: ISBNNormalizado): Promise<BuscaISBNResultado> => {
  const consultas = await Promise.allSettled([
    buscarGoogleBooks(isbn),
    buscarBrasilAPI(isbn),
    buscarOpenLibrary(isbn),
  ]);
  const fontes: FonteISBN[] = ['Google Books', 'BrasilAPI', 'Open Library'];
  const resultados: LivroISBNNormalizado[] = [];
  const erros: FonteISBN[] = [];

  consultas.forEach((consulta, index) => {
    if (consulta.status === 'fulfilled' && consulta.value) {
      resultados.push(consulta.value);
    } else if (consulta.status === 'rejected') {
      erros.push(fontes[index]);
      console.log(`Falha ao consultar ${fontes[index]}:`, consulta.reason);
    }
  });

  return {
    encontrado: resultados.length > 0,
    isbn,
    dados: resultados.length ? combinarResultados(isbn, resultados) : undefined,
    fontes: resultados.map((resultado) => resultado.fonte),
    resultados,
    erros,
  };
};

export const buscarLivroPorISBN = async (entrada: string) => {
  const isbn = normalizarISBN(entrada);
  if (!isbn) return null;

  const chave = isbn.isbn13 || isbn.isbn10 || isbn.codigo;
  const emCache = cacheISBN.get(chave);
  if (emCache) return emCache;

  const consulta = buscarISBNSemCache(isbn);
  cacheISBN.set(chave, consulta);
  return consulta;
};

export const __testesISBN = {
  normalizarISBN,
  validarISBN10,
  validarISBN13,
  normalizarCodigoISBN,
  deveIgnorarScanDuplicado,
  contemISBN,
  combinarResultados,
  fetchJSONComTimeout,
};
