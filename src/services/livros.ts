import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { Livro } from '../types';

const col = collection(db, 'livros');

export const adicionarLivro = (livro: Livro) => addDoc(col, livro);

export const buscarLivros = async (): Promise<Livro[]> => {
  const snap = await getDocs(col);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Livro));
};

export const atualizarLivro = (id: string, dados: Partial<Livro>) =>
  updateDoc(doc(db, 'livros', id), dados);

export const excluirLivro = (id: string) =>
  deleteDoc(doc(db, 'livros', id));