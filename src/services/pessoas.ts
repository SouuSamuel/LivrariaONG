import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Pessoa } from '../types';

const col = collection(db, 'pessoas');

export const adicionarPessoa = (pessoa: Pessoa) => addDoc(col, pessoa);

export const buscarPessoas = async (): Promise<Pessoa[]> => {
  const snap = await getDocs(col);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Pessoa));
};

export const atualizarPessoa = (id: string, dados: Partial<Pessoa>) =>
  updateDoc(doc(db, 'pessoas', id), dados);