import { Livro } from '../types';

const ISBN_TIMEOUT_MS = 6500;
const CAPA_TIMEOUT_MS = 2800;
const GOOGLE_MAX_RESULTS = 10;
const cacheISBN = new Map<string, Promise<BuscaISBNResultado>>();

export type FonteISBN = 'Google Books' | 'BrasilAPI' | 'Open Library';
export type FonteImagemISBN = 'google-books' | 'open-library' | 'brasil-api' | 'nenhuma';

export interface ISBNNormalizado {
  original: string;
  codigo: string;
  tipo: 'ISBN-10' | 'ISBN-13';
  isbn10?: string;
  isbn13?: string;
}

interface CandidataCapa {
  fonte: FonteImagemISBN;
  url: string;
  prioridade: number;
  origem: string;
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
  imagemFonte?: FonteImagemISBN;
  candidatasCapa?: CandidataCapa[];
}

export interface DiagnosticoCapaISBN {
  candidatas: number;
  escolhida?: FonteImagemISBN;
  rejeicoes: Array<{
    fonte: FonteImagemISBN;
    origem: string;
    motivo: string;
  }>;
}

export interface BuscaISBNResultado {
  encontrado: boolean;
  isbn: ISBNNormalizado;
  dados?: Partial<Livro>;
  fontes: FonteISBN[];
  resultados: LivroISBNNormalizado[];
  erros: FonteISBN[];
  imagemFonte: FonteImagemISBN;
  diagnosticoCapas: DiagnosticoCapaISBN;
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
  Array.from(new Set([isbn.codigo, isbn.isbn10, isbn.isbn13].filter(Boolean))) as string[];

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

const textoOuNumero = (valor: unknown) => {
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  return texto(valor);
};

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

const criarErro = (message: string, code?: string) => {
  const erro = new Error(message);
  if (code) (erro as any).code = code;
  return erro;
};

const normalizarUrlImagem = (url?: string) => {
  const limpa = texto(url);
  if (!limpa) return undefined;

  try {
    const segura = limpa.replace(/^http:\/\//i, 'https://');
    const parsed = new URL(segura);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
};

const urlParecePlaceholder = (url: string) => {
  const normalizada = url.toLowerCase();
  return [
    'no_cover',
    'nocover',
    'no-cover',
    'placeholder',
    'spacer',
    'transparent',
    'blank',
    'nophoto',
  ].some((trecho) => normalizada.includes(trecho));
};

const descreverUrlCapa = (url: string) => {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return 'url-invalida';
  }
};

const adicionarCandidata = (
  candidatas: CandidataCapa[],
  fonte: FonteImagemISBN,
  url: string | undefined,
  prioridade: number,
  origem: string
) => {
  const normalizada = normalizarUrlImagem(url);
  if (!normalizada) return;
  if (urlParecePlaceholder(normalizada)) return;

  const existe = candidatas.some((candidata) => candidata.url === normalizada);
  if (!existe) {
    candidatas.push({ fonte, url: normalizada, prioridade, origem });
  }
};

const fetchJSONComTimeout = async (url: string, timeoutMs = ISBN_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resposta = await fetch(url, { signal: controller.signal });
    if (!resposta.ok) throw criarErro(`HTTP ${resposta.status}`, `http/${resposta.status}`);
    return await resposta.json();
  } finally {
    clearTimeout(timer);
  }
};

const validarCapaRemota = async (candidata: CandidataCapa) => {
  if (!candidata.url) return 'url-vazia';
  if (urlParecePlaceholder(candidata.url)) return 'placeholder-conhecido';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAPA_TIMEOUT_MS);

  try {
    let resposta = await fetch(candidata.url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    if (resposta.status === 405) {
      resposta = await fetch(candidata.url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        signal: controller.signal,
      });
    }

    if (!resposta.ok) return `http-${resposta.status}`;

    const contentType = resposta.headers.get('content-type') || '';
    if (contentType && !contentType.toLowerCase().startsWith('image/')) {
      return `content-type-${contentType}`;
    }

    if (!contentType && !/\.(jpe?g|png|webp|gif)(?:[?#].*)?$/i.test(candidata.url)) {
      return 'content-type-ausente';
    }

    return undefined;
  } catch (e: any) {
    return e?.name === 'AbortError' ? 'timeout' : e?.message || 'falha-validacao';
  } finally {
    clearTimeout(timer);
  }
};

const extrairIdentificadoresGoogle = (info: any) => info?.industryIdentifiers || [];

const criarResultadoGoogle = (
  info: any,
  isbn: ISBNNormalizado,
  indexResultado: number
): LivroISBNNormalizado | null => {
  const identificadores = extrairIdentificadoresGoogle(info);
  if (!contemISBN(identificadores.map((ident: any) => ident.identifier), isbn)) return null;

  const isbn10 = identificadores.find((ident: any) => ident.type === 'ISBN_10')?.identifier;
  const isbn13 = identificadores.find((ident: any) => ident.type === 'ISBN_13')?.identifier;
  const dataPublicacao = texto(info.publishedDate);
  const candidatasCapa: CandidataCapa[] = [];
  const imageLinks = info.imageLinks || {};

  [
    ['extraLarge', 120],
    ['large', 110],
    ['medium', 100],
    ['small', 90],
    ['thumbnail', 80],
    ['smallThumbnail', 70],
  ].forEach(([campo, prioridade]) => {
    adicionarCandidata(
      candidatasCapa,
      'google-books',
      imageLinks[campo],
      Number(prioridade) - indexResultado,
      `google-books:${campo}`
    );
  });

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
    capaUrl: candidatasCapa[0]?.url,
    imagemFonte: candidatasCapa.length ? 'google-books' : undefined,
    candidatasCapa,
  };
};

const buscarGoogleBooks = async (isbn: ISBNNormalizado): Promise<LivroISBNNormalizado[]> => {
  const consultas = await Promise.allSettled(
    identificadoresISBN(isbn).map((codigo) =>
      fetchJSONComTimeout(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(codigo)}&maxResults=${GOOGLE_MAX_RESULTS}`
      )
    )
  );

  const volumes = new Map<string, any>();
  let algumaConsultaValida = false;

  consultas.forEach((consulta, index) => {
    const codigo = identificadoresISBN(isbn)[index];
    if (consulta.status === 'rejected') {
      console.log('ISBN: falha parcial no Google Books.', {
        codigo,
        motivo: consulta.reason?.message || 'erro-desconhecido',
      });
      return;
    }

    algumaConsultaValida = true;
    const items = Array.isArray(consulta.value?.items) ? consulta.value.items : [];
    items.forEach((item: any) => {
      const id = texto(item.id) || JSON.stringify(item.volumeInfo?.industryIdentifiers || []);
      if (id && !volumes.has(id)) volumes.set(id, item);
    });
  });

  if (!algumaConsultaValida) {
    throw criarErro('Todas as consultas ao Google Books falharam.');
  }

  return Array.from(volumes.values())
    .map((item, index) => criarResultadoGoogle(item.volumeInfo || {}, isbn, index))
    .filter(Boolean) as LivroISBNNormalizado[];
};

const buscarBrasilAPI = async (isbn: ISBNNormalizado): Promise<LivroISBNNormalizado[]> => {
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

  if (!contemISBN(ids, isbn)) return [];

  const dataPublicacao = texto(json.published_date || json.data_publicacao || json.year || json.ano);
  const candidatasCapa: CandidataCapa[] = [];
  adicionarCandidata(candidatasCapa, 'brasil-api', json.cover_url || json.coverUrl || json.capa, 65, 'brasil-api:cover');

  return [{
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
    capaUrl: candidatasCapa[0]?.url,
    imagemFonte: candidatasCapa.length ? 'brasil-api' : undefined,
    candidatasCapa,
  }];
};

const capasOpenLibraryPorId = (
  candidatas: CandidataCapa[],
  tipo: 'id' | 'olid' | 'isbn',
  valor: unknown,
  prioridadeBase: number,
  origem: string
) => {
  const valores = Array.isArray(valor) ? valor : [valor];
  valores
    .map((item) => textoOuNumero(item))
    .filter(Boolean)
    .forEach((item) => {
      [
        ['L', prioridadeBase],
        ['M', prioridadeBase - 15],
        ['S', prioridadeBase - 30],
      ].forEach(([tamanho, prioridade]) => {
        adicionarCandidata(
          candidatas,
          'open-library',
          `https://covers.openlibrary.org/b/${tipo}/${item}-${tamanho}.jpg?default=false`,
          Number(prioridade),
          `${origem}:${tamanho}`
        );
      });
    });
};

const buscarOpenLibrary = async (isbn: ISBNNormalizado): Promise<LivroISBNNormalizado[]> => {
  let docs: any[] = [];

  try {
    const json = await fetchJSONComTimeout(
      `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn.codigo)}&fields=key,title,author_name,publisher,first_publish_year,publish_date,number_of_pages_median,isbn,cover_i,cover_edition_key,edition_key,language&limit=10`
    );
    docs = Array.isArray(json.docs) ? json.docs.filter((item: any) => contemISBN(item?.isbn, isbn)) : [];
  } catch (e: any) {
    console.log('ISBN: falha parcial na busca Open Library; mantendo fallback por ISBN.', {
      motivo: e?.message || 'erro-desconhecido',
    });
  }

  const resultados: LivroISBNNormalizado[] = [];

  docs.forEach((doc: any, index: number) => {
    const dataPublicacao = texto(doc.publish_date?.[0]) || texto(doc.first_publish_year);
    const candidatasCapa: CandidataCapa[] = [];
    capasOpenLibraryPorId(candidatasCapa, 'id', doc.cover_i, 95 - index, 'open-library:cover_i');
    capasOpenLibraryPorId(candidatasCapa, 'olid', doc.cover_edition_key, 90 - index, 'open-library:cover_edition_key');
    capasOpenLibraryPorId(candidatasCapa, 'olid', doc.edition_key, 82 - index, 'open-library:edition_key');

    resultados.push({
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
      capaUrl: candidatasCapa[0]?.url,
      imagemFonte: candidatasCapa.length ? 'open-library' : undefined,
      candidatasCapa,
    });
  });

  const candidatasISBN: CandidataCapa[] = [];
  identificadoresISBN(isbn).forEach((codigo, index) => {
    capasOpenLibraryPorId(candidatasISBN, 'isbn', codigo, 78 - index, 'open-library:isbn');
  });

  if (candidatasISBN.length) {
    resultados.push({
      fonte: 'Open Library',
      isbn10: isbn.isbn10,
      isbn13: isbn.isbn13,
      capaUrl: candidatasISBN[0]?.url,
      imagemFonte: 'open-library',
      candidatasCapa: candidatasISBN,
    });
  }

  return resultados;
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
  ].filter(Boolean).length;
};

const preencherSeMelhor = <T>(atual: T | undefined, proximo: T | undefined) =>
  atual === undefined || atual === null || atual === '' ? proximo || atual : atual;

const escolherMelhorCapa = async (
  resultados: LivroISBNNormalizado[]
): Promise<{ capa?: CandidataCapa; diagnostico: DiagnosticoCapaISBN }> => {
  const candidatas = resultados
    .flatMap((resultado) => resultado.candidatasCapa || [])
    .sort((a, b) => b.prioridade - a.prioridade);
  const rejeicoes: DiagnosticoCapaISBN['rejeicoes'] = [];

  for (const candidata of candidatas) {
    const motivo = await validarCapaRemota(candidata);
    if (!motivo) {
      console.log('ISBN: capa escolhida.', {
        fonte: candidata.fonte,
        origem: candidata.origem,
        url: descreverUrlCapa(candidata.url),
      });
      return {
        capa: candidata,
        diagnostico: {
          candidatas: candidatas.length,
          escolhida: candidata.fonte,
          rejeicoes,
        },
      };
    }

    const rejeicao = {
      fonte: candidata.fonte,
      origem: candidata.origem,
      motivo,
    };
    rejeicoes.push(rejeicao);
    console.log('ISBN: candidata de capa rejeitada.', {
      ...rejeicao,
      url: descreverUrlCapa(candidata.url),
    });
  }

  return {
    diagnostico: {
      candidatas: candidatas.length,
      escolhida: 'nenhuma',
      rejeicoes,
    },
  };
};

const combinarResultados = (
  isbn: ISBNNormalizado,
  resultados: LivroISBNNormalizado[],
  capaEscolhida?: CandidataCapa
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
    combinado.categoria = preencherCategoria(combinado.categoria, resultado.categorias?.join(', '));
    combinado.idioma = preencherSeMelhor(combinado.idioma, resultado.idioma);
  }

  if (capaEscolhida?.url) {
    combinado.imagem = capaEscolhida.url;
  }

  combinado.fonteDados = Array.from(new Set(ordenados.map((resultado) => resultado.fonte))).join(', ');

  console.log('ISBN: fontes selecionadas para dados.', {
    titulo: ordenados.find((resultado) => resultado.titulo)?.fonte || 'nenhuma',
    autor: ordenados.find((resultado) => resultado.autores?.length)?.fonte || 'nenhuma',
    capa: capaEscolhida?.fonte || 'nenhuma',
  });

  return combinado;
};

const preencherCategoria = (atual: string | undefined, proximo: string | undefined) =>
  preencherSeMelhor(atual, proximo);

const buscarISBNSemCache = async (isbn: ISBNNormalizado): Promise<BuscaISBNResultado> => {
  console.log('ISBN: consulta iniciada.', {
    codigo: isbn.codigo,
    isbn10: isbn.isbn10,
    isbn13: isbn.isbn13,
  });

  const consultas = await Promise.allSettled([
    buscarGoogleBooks(isbn),
    buscarBrasilAPI(isbn),
    buscarOpenLibrary(isbn),
  ]);
  const fontes: FonteISBN[] = ['Google Books', 'BrasilAPI', 'Open Library'];
  const resultados: LivroISBNNormalizado[] = [];
  const erros: FonteISBN[] = [];

  consultas.forEach((consulta, index) => {
    if (consulta.status === 'fulfilled') {
      resultados.push(...consulta.value);
    } else {
      erros.push(fontes[index]);
      console.log(`ISBN: falha ao consultar ${fontes[index]}.`, {
        motivo: consulta.reason?.message || 'erro-desconhecido',
      });
    }
  });

  const fontesConcluidas = consultas
    .map((consulta, index) => consulta.status === 'fulfilled' ? fontes[index] : undefined)
    .filter(Boolean);
  console.log('ISBN: fontes concluídas.', {
    fontes: fontesConcluidas,
    erros,
  });

  const { capa, diagnostico } = await escolherMelhorCapa(resultados);
  console.log('ISBN: diagnóstico de capas.', {
    candidatas: diagnostico.candidatas,
    rejeicoes: diagnostico.rejeicoes.length,
    escolhida: capa?.fonte || 'nenhuma',
  });

  return {
    encontrado: resultados.length > 0,
    isbn,
    dados: resultados.length ? combinarResultados(isbn, resultados, capa) : undefined,
    fontes: Array.from(new Set(resultados.map((resultado) => resultado.fonte))),
    resultados,
    erros,
    imagemFonte: capa?.fonte || 'nenhuma',
    diagnosticoCapas: diagnostico,
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
  normalizarUrlImagem,
  validarCapaRemota,
  escolherMelhorCapa,
};
