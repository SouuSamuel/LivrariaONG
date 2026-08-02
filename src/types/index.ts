export interface Livro {
  id?: string;
  titulo: string;
  autor: string;
  editora: string;
  ano: number;
  isbn: string;
  isbn10?: string;
  isbn13?: string;
  codigoBarras: string;
  subtitulo?: string;
  categoria: string;
  dataPublicacao?: string;
  paginas?: number;
  descricao?: string;
  idioma?: string;
  fonteDados?: string;
  status: 'Disponível' | 'Emprestado';
  imagem: string;
  imagemStoragePath?: string;
  quantidadeTotal?: number;
  quantidadeDisponivel?: number;
  quantidadeDisponivelInformada?: boolean;
  indisponivelInformado?: boolean;
  busca?: string;
  dataCadastro: string;
}

export interface Pessoa {
  id?: string;
  nome: string;
  telefone: string;
  idade: number;
  observacoes: string;
  ativo?: boolean;
  arquivado?: boolean;
  dataArquivamento?: string;
  dataCadastro: string;
}

export interface Emprestimo {
  id?: string;
  livroId: string;
  nomeLivro: string;
  pessoaId: string;
  nomePessoa: string;
  telefonePessoa: string;
  dataEmprestimo: string;
  dataPrevista: string;
  dataDevolucao: string | null;
  diasPrazo: number;
  status: 'Emprestado' | 'Devolvido' | 'Atrasado';
}
