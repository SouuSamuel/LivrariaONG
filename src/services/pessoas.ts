import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { Emprestimo, Pessoa } from '../types';

const col = collection(db, 'pessoas');
const emprestimosCol = collection(db, 'emprestimos');

export const adicionarPessoa = (pessoa: Pessoa) => addDoc(col, pessoa);

export type ResultadoExclusaoPessoa = 'bloqueada_emprestimo_ativo' | 'arquivada_historico' | 'excluida_sem_historico';

const pessoaEstaArquivada = (pessoa: Pessoa) =>
  pessoa.arquivado === true || pessoa.ativo === false;

export const buscarPessoas = async (opcoes: { incluirArquivadas?: boolean } = {}): Promise<Pessoa[]> => {
  const snap = await getDocs(col);
  const pessoas = snap.docs.map(d => ({ id: d.id, ...d.data() } as Pessoa));
  if (opcoes.incluirArquivadas) return pessoas;
  return pessoas.filter((pessoa) => !pessoaEstaArquivada(pessoa));
};

export const atualizarPessoa = (id: string, dados: Partial<Pessoa>) =>
  updateDoc(doc(db, 'pessoas', id), dados);

export const excluirOuArquivarPessoa = async (pessoaId: string): Promise<ResultadoExclusaoPessoa> => {
  const q = query(emprestimosCol, where('pessoaId', '==', pessoaId));
  const snap = await getDocs(q);
  const emprestimos = snap.docs.map(d => ({ id: d.id, ...d.data() } as Emprestimo));
  const temEmprestimoAtivo = emprestimos.some((emp) =>
    emp.status === 'Emprestado' || emp.status === 'Atrasado'
  );

  if (temEmprestimoAtivo) return 'bloqueada_emprestimo_ativo';

  if (emprestimos.length > 0) {
    await updateDoc(doc(db, 'pessoas', pessoaId), {
      ativo: false,
      arquivado: true,
      dataArquivamento: new Date().toISOString(),
    });
    return 'arquivada_historico';
  }

  await deleteDoc(doc(db, 'pessoas', pessoaId));
  return 'excluida_sem_historico';
};

export const restaurarPessoa = (id: string) =>
  updateDoc(doc(db, 'pessoas', id), {
    ativo: true,
    arquivado: false,
    dataArquivamento: null,
  });
