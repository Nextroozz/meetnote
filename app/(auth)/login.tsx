import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { Colors } from '@/constants/Colors';
import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) Alert.alert('Erreur', error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) { Alert.alert('Erreur', error.message); return; }
        if (data.user) {
          await supabase.from('users').insert({ id: data.user.id, email, full_name: fullName });
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={styles.logoMark} />
          <Text style={styles.title}>MeetNote</Text>
          <Text style={styles.subtitle}>
            {mode === 'login' ? 'Connectez-vous pour accéder à vos réunions.' : 'Créez votre compte organisateur.'}
          </Text>
        </View>

        <View style={styles.form}>
          {mode === 'signup' && (
            <View style={styles.inputWrapper}>
              <Text style={styles.label}>Nom complet</Text>
              <TextInput
                style={styles.input}
                placeholder="Jean Dupont"
                placeholderTextColor={Colors.text.tertiary}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Adresse e-mail</Text>
            <TextInput
              style={styles.input}
              placeholder="vous@exemple.com"
              placeholderTextColor={Colors.text.tertiary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={Colors.text.tertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.buttonText}>{mode === 'login' ? 'Se connecter' : 'Créer le compte'}</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            <Text style={styles.switchText}>
              {mode === 'login' ? "Pas encore de compte ? " : 'Déjà un compte ? '}
              <Text style={styles.switchLink}>
                {mode === 'login' ? "S'inscrire" : 'Se connecter'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 48 },
  logoMark: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: Colors.accent, marginBottom: 20,
  },
  title: { fontSize: 30, fontWeight: '700', color: Colors.text.primary, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: Colors.text.secondary, marginTop: 8, textAlign: 'center', lineHeight: 22 },
  form: { gap: 16 },
  inputWrapper: { gap: 6 },
  label: { fontSize: 13, fontWeight: '500', color: Colors.text.secondary },
  input: {
    backgroundColor: Colors.surfaceElevated, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: Colors.text.primary,
    borderWidth: 1, borderColor: Colors.border,
  },
  button: {
    backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#000' },
  switchText: { textAlign: 'center', color: Colors.text.secondary, fontSize: 14, marginTop: 8 },
  switchLink: { color: Colors.accent, fontWeight: '600' },
});
