import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { TextInput, Button } from 'react-native-paper';
import { auth } from '../../services/firebase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const mensagemErroLogin = (codigo?: string) => {
    switch (codigo) {
      case 'auth/invalid-email':
        return 'O e-mail digitado não é válido.';
      case 'auth/invalid-credential':
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'E-mail ou senha incorretos.';
      case 'auth/user-disabled':
        return 'Este usuário está desativado no Firebase.';
      case 'auth/operation-not-allowed':
        return 'Login por e-mail e senha não está ativado no Firebase Authentication.';
      case 'auth/network-request-failed':
        return 'Falha de conexão. Verifique sua internet e tente novamente.';
      case 'auth/invalid-api-key':
      case 'auth/app-not-authorized':
        return 'Configuração do Firebase inválida para este app.';
      default:
        return codigo ? `Não foi possível entrar. Código: ${codigo}` : 'Não foi possível entrar.';
    }
  };

  const handleLogin = async () => {
    const emailLimpo = email.trim();
    if (!emailLimpo || !senha) { Alert.alert('Preencha e-mail e senha'); return; }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, emailLimpo, senha);
    } catch (e: any) {
      console.log('Erro no login:', e?.code, e?.message);
      Alert.alert('Erro no login', mensagemErroLogin(e?.code));
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
