import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { TextInput, Button } from 'react-native-paper';
import { auth } from '../../services/firebase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !senha) { Alert.alert('Preencha e-mail e senha'); return; }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, senha);
    } catch (e) {
      Alert.alert('Erro', 'E-mail ou senha incorretos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.titulo}>📚 BiblioONG</Text>
        <Text style={s.sub}>Sistema de empréstimos</Text>
      </View>
      <View style={s.form}>
        <TextInput label="E-mail" value={email} onChangeText={setEmail}
          keyboardType="email-address" autoCapitalize="none"
          mode="outlined" activeOutlineColor="#1D9E75" style={s.input} />
        <TextInput label="Senha" value={senha} onChangeText={setSenha}
          secureTextEntry mode="outlined" activeOutlineColor="#1D9E75" style={s.input} />
        <Button mode="contained" onPress={handleLogin} loading={loading}
          buttonColor="#1D9E75" style={s.btn}>
          Entrar
        </Button>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f4f2', justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  titulo: { fontSize: 32, fontWeight: '600', color: '#1D9E75' },
  sub: { fontSize: 14, color: '#888', marginTop: 4 },
  form: { gap: 12 },
  input: { backgroundColor: '#fff' },
  btn: { marginTop: 8, borderRadius: 8, paddingVertical: 4 }
});