import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';

interface LoginScreenProps {
  onLoginSuccess: (role: 'DRIVER' | 'DISPATCH', driverId: string | null) => void;
}

export default function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [passcode, setPasscode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = () => {
    setErrorMsg('');
    const userLower = username.trim().toLowerCase();
    const codeTrim = passcode.trim();

    if (userLower === 'driver1' && codeTrim === '1111') {
      onLoginSuccess('DRIVER', 'drv-01');
    } else if (userLower === 'driver2' && codeTrim === '2222') {
      onLoginSuccess('DRIVER', 'drv-02');
    } else if (userLower === 'dispatch' && codeTrim === '0000') {
      onLoginSuccess('DISPATCH', null);
    } else {
      setErrorMsg('Invalid username or passcode.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.logo}>🚚</Text>
          <Text style={styles.title}>IAW Courier Portal</Text>
          <Text style={styles.subtitle}>Enter credentials to access waybills</Text>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="e.g. driver1 or dispatch"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Passcode</Text>
          <TextInput
            style={styles.input}
            value={passcode}
            onChangeText={setPasscode}
            placeholder="4-digit passcode"
            secureTextEntry
            keyboardType="numeric"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
            <Text style={styles.loginBtnText}>SIGN IN</Text>
          </TouchableOpacity>

          <View style={styles.credentialsTip}>
            <Text style={styles.tipTitle}>Test Logins:</Text>
            <Text style={styles.tipText}>• Driver 1: driver1 / 1111</Text>
            <Text style={styles.tipText}>• Driver 2: driver2 / 2222</Text>
            <Text style={styles.tipText}>• Dispatcher: dispatch / 0000</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'stretch',
  },
  logo: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#212529',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#6C757D',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 13,
    fontWeight: 'bold',
    backgroundColor: '#FFE5E5',
    padding: 10,
    borderRadius: 6,
    textAlign: 'center',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#CED4DA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#212529',
    marginBottom: 16,
  },
  loginBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  loginBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  credentialsTip: {
    backgroundColor: '#E8F4FD',
    borderRadius: 8,
    padding: 12,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#BEE5EB',
  },
  tipTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#004085',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 11,
    color: '#004085',
    lineHeight: 16,
  },
});
