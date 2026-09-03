import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../auth/AuthContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing } from '../theme';

// Placeholder landing screen shown once the user is authenticated. Sign out
// clears the stored tokens, which flips the navigator back to the auth flow.
export function HomeScreen() {
  const { signOut } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>You're in 🎉</Text>
        <Text style={styles.subtitle}>
          Phone verified and tokens stored securely. The real home experience
          (discovery, matches, chat) will live here.
        </Text>
      </View>
      <PrimaryButton title="Sign out" onPress={signOut} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
    marginTop: spacing.md,
    lineHeight: 22,
  },
});
