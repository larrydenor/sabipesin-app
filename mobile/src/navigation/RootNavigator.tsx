import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { getMyProfile } from '../api/profile';
import { ApiError } from '../api/errors';
import { useAuth } from '../auth/AuthContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing } from '../theme';
import { AppStackParamList, AuthStackParamList } from './types';
import { PhoneEntryScreen } from '../screens/PhoneEntryScreen';
import { OtpEntryScreen } from '../screens/OtpEntryScreen';
import { ProfileSetupScreen } from '../screens/ProfileSetupScreen';
import { HomeScreen } from '../screens/HomeScreen';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

// Dark theme so the native container background matches our screens (avoids a
// white flash between transitions).
const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.background },
};

const screenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.text,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: colors.background },
};

function AuthFlow() {
  return (
    <AuthStack.Navigator screenOptions={screenOptions}>
      <AuthStack.Screen
        name="PhoneEntry"
        component={PhoneEntryScreen}
        options={{ title: 'Sign in' }}
      />
      <AuthStack.Screen
        name="OtpEntry"
        component={OtpEntryScreen}
        options={{ title: 'Verify' }}
      />
    </AuthStack.Navigator>
  );
}

function AppFlow() {
  const { signOut } = useAuth();
  // Resolve where an authenticated user lands by asking the backend whether they
  // have a profile yet. A 404 from GET /profile/me means "no profile" → start on
  // ProfileSetup; a 200 → start on Home. Any other failure (network/5xx) is
  // retriable rather than silently dropping the user into the wrong screen.
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasProfile, setHasProfile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolveProfile = useCallback(async () => {
    setStatus('loading');
    try {
      await getMyProfile();
      setHasProfile(true);
      setStatus('ready');
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 404) {
        // Expected for a brand-new user — route to setup, not an error.
        setHasProfile(false);
        setStatus('ready');
      } else {
        setErrorMessage(err.message);
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    resolveProfile();
  }, [resolveProfile]);

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.errorContainer}>
        <View style={styles.errorContent}>
          <Text style={styles.errorTitle}>Couldn’t load your profile</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
        <PrimaryButton title="Try again" onPress={resolveProfile} />
        <View style={styles.errorSignOut}>
          <PrimaryButton title="Sign out" onPress={signOut} />
        </View>
      </View>
    );
  }

  // Both screens live in the stack; the fetched flag only chooses the entry
  // point. After creating a profile, ProfileSetup resets the stack to Home.
  return (
    <AppStack.Navigator
      screenOptions={screenOptions}
      initialRouteName={hasProfile ? 'Home' : 'ProfileSetup'}
    >
      <AppStack.Screen
        name="ProfileSetup"
        component={ProfileSetupScreen}
        options={{ title: 'Your profile', headerBackVisible: false, gestureEnabled: false }}
      />
      <AppStack.Screen name="Home" component={HomeScreen} options={{ title: 'SabiPesin' }} />
    </AppStack.Navigator>
  );
}

export function RootNavigator() {
  const { isAuthenticated, isBootstrapping } = useAuth();

  // While we read tokens from secure storage, show a spinner rather than briefly
  // flashing the phone-entry screen to an already-signed-in user.
  if (isBootstrapping) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {isAuthenticated ? <AppFlow /> : <AuthFlow />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  errorContent: {
    flex: 1,
    justifyContent: 'center',
  },
  errorTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  errorText: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  errorSignOut: {
    marginTop: spacing.md,
  },
});
