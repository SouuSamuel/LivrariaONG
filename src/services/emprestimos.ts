import { collection, addDoc, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { Emprestimo } from '../types';

const col = collection(db, 'emprestimos');

export const criarEmprestimo = (emp: Emprestimo) => addDoc(col, emp);

export const buscarEmprestimos = async (): Promise<Emprestimo[]> => {
  const snap = await getDocs(col);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Emprestimo));
};

export const buscarEmprestimosAtivos = async (): Promise<Emprestimo[]> => {
  const q = query(col, where('status', '==', 'Emprestado'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Emprestimo));
};

export const registrarDevolucao = (id: string) =>
  updateDoc(doc(db, 'emprestimos', id), {
    status: 'Devolvido',
    dataDevolucao: new Date().toISOString()
  });