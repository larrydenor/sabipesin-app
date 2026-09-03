import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme';
import { AppStackParamList, AuthStackParamList } from './types';
import { PhoneEntryScreen } from '../screens/PhoneEntryScreen';
import { OtpEntryScreen } from '../screens/OtpEntryScreen';
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
  return (
    <AppStack.Navigator screenOptions={screenOptions}>
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
});
