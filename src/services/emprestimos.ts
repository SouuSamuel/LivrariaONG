import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { Emprestimo, Livro, Pessoa } from '../types';
import { normalizarLivroDados } from './livros';

const col = collection(db, 'emprestimos');
export const STATUS_EMPRESTIMO_FINALIZADO = 'Devolvido';
export const TAMANHO_LOTE_LIMPEZA_EMPRESTIMOS = 400;

interface CriarEmprestimoParams {
  livro: Livro;
  pessoa: Pessoa;
  diasPrazo: number;
}

export interface ResultadoLimpezaHistoricoEmprestimos {
  total: number;
  removidos: number;
  falhas: number;
  lotes: number;
  lotesComFalha: number;
}

export const criarEmprestimo = (emp: Emprestimo) => addDoc(col, emp);

export const emprestimoEstaFinalizado = (emprestimo: Pick<Emprestimo, 'status'>) =>
  emprestimo.status === STATUS_EMPRESTIMO_FINALIZADO;

export const dividirEmLotes = <T>(itens: T[], tamanho = TAMANHO_LOTE_LIMPEZA_EMPRESTIMOS) => {
  const lotes: T[][] = [];
  for (let indice = 0; indice < itens.length; indice += tamanho) {
    lotes.push(itens.slice(indice, indice + tamanho));
  }
  return lotes;
};

const buscarDocsEmprestimosFinalizados = async (): Promise<QueryDocumentSnapshot<DocumentData>[]> => {
  const q = query(col, where('status', '==', STATUS_EMPRESTIMO_FINALIZADO));
  const snap = await getDocs(q);
  return snap.docs;
};

export const contarEmprestimosFinalizados = async () => {
  const docs = await buscarDocsEmprestimosFinalizados();
  return docs.length;
};

export const limparHistoricoEmprestimosFinalizados =
  async (): Promise<ResultadoLimpezaHistoricoEmprestimos> => {
    const docs = await buscarDocsEmprestimosFinalizados();
    const lotes = dividirEmLotes(docs);
    const resultado: ResultadoLimpezaHistoricoEmprestimos = {
      total: docs.length,
      removidos: 0,
      falhas: 0,
      lotes: lotes.length,
      lotesComFalha: 0,
    };

    for (let indice = 0; indice < lotes.length; indice += 1) {
      const lote = lotes[indice];
      const batch = writeBatch(db);
      lote.forEach((emprestimoDoc) => batch.delete(emprestimoDoc.ref));

      try {
        await batch.commit();
        resultado.removidos += lote.length;
      } catch (erro) {
        resultado.falhas += lote.length;
        resultado.lotesComFalha += 1;
        console.error('Erro ao limpar lote de emprestimos finalizados:', {
          lote: indice + 1,
          quantidade: lote.length,
          erro,
        });
      }
    }

    return resultado;
  };

export const criarEmprestimoComTransacao = async ({
  livro,
  pessoa,
  diasPrazo,
}: CriarEmprestimoParams) => {
  if (!livro.id || !pessoa.id) {
    throw new Error('Livro e pessoa precisam estar cadastrados antes do empréstimo.');
  }

  const livroId = livro.id;
  const pessoaId = pessoa.id;
  const prazo = Number.isFinite(diasPrazo) && diasPrazo > 0 ? diasPrazo : 14;
  const hoje = new Date();
  const prevista = new Date();
  prevista.setDate(hoje.getDate() + prazo);

  await runTransaction(db, async (transaction) => {
    const livroRef = doc(db, 'livros', livroId);
    const livroSnap = await transaction.get(livroRef);

    if (!livroSnap.exists()) {
      throw new Error('Este livro não existe mais no acervo.');
    }

    const livroAtual = normalizarLivroDados(livroSnap.id, livroSnap.data());
    const quantidadeTotal = Math.max(livroAtual.quantidadeTotal ?? 1, 1);
    const quantidadeDisponivel = livroAtual.quantidadeDisponivelInformada
      ? Math.max(livroAtual.quantidadeDisponivel ?? 0, 0)
      : livroAtual.indisponivelInformado
        ? 0
      : quantidadeTotal;

    if (quantidadeDisponivel <= 0) {
      throw new Error('Não há exemplares disponíveis deste livro.');
    }

    const novaQuantidadeDisponivel = quantidadeDisponivel - 1;
    const emprestimoRef = doc(col);

    transaction.update(livroRef, {
      quantidadeTotal,
      quantidadeDisponivel: novaQuantidadeDisponivel,
      status: novaQuantidadeDisponivel > 0 ? 'Disponível' : 'Emprestado',
    });

    transaction.set(emprestimoRef, {
      livroId,
      nomeLivro: livroAtual.titulo || livro.titulo,
      pessoaId,
      nomePessoa: pessoa.nome,
      telefonePessoa: pessoa.telefone,
      dataEmprestimo: hoje.toISOString(),
      dataPrevista: prevista.toISOString(),
      dataDevolucao: null,
      diasPrazo: prazo,
      status: 'Emprestado',
    } satisfies Emprestimo);
  });
};

export const buscarEmprestimos = async (): Promise<Emprestimo[]> => {
  const snap = await getDocs(col);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Emprestimo));
};

export const buscarEmprestimosAtivos = async (): Promise<Emprestimo[]> => {
  const q = query(col, where('status', '==', 'Emprestado'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Emprestimo));
};

export const registrarDevolucao = async (id: string) => {
  await runTransaction(db, async (transaction) => {
    const emprestimoRef = doc(db, 'emprestimos', id);
    const emprestimoSnap = await transaction.get(emprestimoRef);

    if (!emprestimoSnap.exists()) {
      throw new Error('Empréstimo não encontrado.');
    }

    const emprestimo = { id: emprestimoSnap.id, ...emprestimoSnap.data() } as Emprestimo;
    if (emprestimo.status === 'Devolvido') return;

    if (emprestimo.livroId) {
      const livroRef = doc(db, 'livros', emprestimo.livroId);
      const livroSnap = await transaction.get(livroRef);

      if (livroSnap.exists()) {
        const livro = normalizarLivroDados(livroSnap.id, livroSnap.data());
        const quantidadeTotal = Math.max(livro.quantidadeTotal ?? 1, 1);
        const quantidadeAtual = livro.quantidadeDisponivelInformada
          ? Math.max(livro.quantidadeDisponivel ?? 0, 0)
          : Math.max(quantidadeTotal - 1, 0);
        const novaQuantidadeDisponivel = Math.min(quantidadeAtual + 1, quantidadeTotal);

        transaction.update(livroRef, {
          quantidadeTotal,
          quantidadeDisponivel: novaQuantidadeDisponivel,
          status: novaQuantidadeDisponivel > 0 ? 'Disponível' : 'Emprestado',
        });
      }
    }

    transaction.update(emprestimoRef, {
      status: 'Devolvido',
      dataDevolucao: new Date().toISOString()
    });
  });
};
