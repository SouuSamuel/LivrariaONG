export interface Livro {
  id?: string;
  titulo: string;
  autor: string;
  editora: string;
  ano: number;
  isbn: string;
  codigoBarras: string;
  categoria: string;
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
