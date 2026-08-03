import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { login } from '../services/api';

export default function LoginScreen({ navigation }) {
  // Credenciais pré-preenchidas SÓ em desenvolvimento (__DEV__); vazio em produção.
  const [email, setEmail] = useState(__DEV__ ? 'motorista@demo.com' : '');
  const [password, setPassword] = useState(__DEV__ ? 'motorista123' : '');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      // roteia por papel (RBAC no cliente; backend também valida)
      if (user.role === 'driver') navigation.replace('DriverMap');
      else navigation.replace('SupervisorDashboard');
    } catch (e) {
      Alert.alert('Erro', 'Credenciais inválidas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🚚 RotaTravada</Text>
      <TextInput
        style={styles.input}
        placeholder="E-mail"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Senha"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Entrando...' : 'Entrar'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0f172a' },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 40 },
  input: { backgroundColor: '#1e293b', color: '#fff', padding: 14, borderRadius: 10, marginBottom: 14 },
  button: { backgroundColor: '#22c55e', padding: 16, borderRadius: 10, marginTop: 10 },
  buttonText: { color: '#0f172a', fontWeight: 'bold', textAlign: 'center', fontSize: 16 },
});
