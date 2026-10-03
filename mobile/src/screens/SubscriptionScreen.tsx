import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { ApiError } from '../api/errors';
import {
  getSubscriptionStatus,
  subscribeToUnlimited,
  SubscriptionStatusResponse,
} from '../api/subscriptions';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing } from '../theme';

// Polling cadence/budget after the Paystack browser session closes. The webhook
// that actually activates the plan runs async server-side, so there's no signal
// at browser-close time for success vs. cancel vs. dismiss — we just wait and see.
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 15; // ~30s

type Screen = 'loading' | 'ready' | 'error';
// 'ready' states beyond the base status fetch: 'checkout' while the browser is
// open/polling, 'success' once the webhook flips the plan, 'timeout' when the
// poll budget runs out without an answer either way.
type Phase = 'idle' | 'checkout' | 'polling' | 'success' | 'timeout';

export function SubscriptionScreen() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [actionError, setActionError] = useState<string | null>(null);

  // Guards a poll loop that outlives the screen (user navigates away mid-poll).
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setScreen('loading');
    setLoadError(null);
    try {
      const s = await getSubscriptionStatus();
      setStatus(s);
      setScreen('ready');
    } catch (e) {
      const err = e as ApiError;
      setLoadError(err.message);
      setScreen('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isActiveUnlimited = status?.plan === 'unlimited' && status?.status === 'active';

  async function pollUntilActiveOrTimeout() {
    setPhase('polling');
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (!mountedRef.current) return;

      try {
        const s = await getSubscriptionStatus();
        if (!mountedRef.current) return;
        setStatus(s);
        if (s.plan === 'unlimited' && s.status === 'active') {
          setPhase('success');
          return;
        }
      } catch {
        // A transient error mid-poll isn't fatal — just keep polling on the
        // existing schedule rather than surfacing a scary error for a blip.
      }
    }
    if (mountedRef.current) setPhase('timeout');
  }

  async function onUpgrade() {
    if (Platform.OS !== 'android') return;
    setActionError(null);
    setPhase('checkout');
    try {
      const { authorizationUrl } = await subscribeToUnlimited();
      // Opened for ANY close reason (pay, cancel, dismiss) — WebBrowser can't
      // reliably distinguish them, so polling below is the only source of truth.
      await WebBrowser.openAuthSessionAsync(authorizationUrl);
      await pollUntilActiveOrTimeout();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409) {
        // Already active — not an error, just refresh to show the real state.
        await load();
        setPhase('idle');
      } else {
        setActionError(err.message);
        setPhase('idle');
      }
    }
  }

  if (screen === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (screen === 'error') {
    return (
      <View style={styles.stateContainer}>
        <View style={styles.stateContent}>
          <Text style={styles.stateTitle}>Couldn’t load your subscription</Text>
          <Text style={styles.stateText}>{loadError}</Text>
        </View>
        <PrimaryButton title="Try again" onPress={() => void load()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Unlimited</Text>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Current plan</Text>
        <Text style={styles.statusValue}>
          {isActiveUnlimited ? 'Unlimited' : 'Free'}
        </Text>
        {isActiveUnlimited && status?.currentPeriodEnd ? (
          <Text style={styles.statusDetail}>
            Renews {new Date(status.currentPeriodEnd).toLocaleDateString()}
          </Text>
        ) : null}
      </View>

      {isActiveUnlimited ? (
        <Text style={styles.subtitle}>
          You have unlimited swipes, can see who liked you, and get the advanced filters.
        </Text>
      ) : (
        <Text style={styles.subtitle}>
          Lift the daily swipe cap, see who liked you, and unlock advanced filters.
        </Text>
      )}

      {actionError ? <Text style={styles.formError}>{actionError}</Text> : null}

      {!isActiveUnlimited && Platform.OS === 'android' && (
        <View style={styles.action}>
          <PrimaryButton
            title="Upgrade to Unlimited"
            onPress={() => void onUpgrade()}
            loading={phase === 'checkout' || phase === 'polling'}
          />
        </View>
      )}

      {!isActiveUnlimited && Platform.OS === 'ios' && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Coming soon</Text>
          <Text style={styles.noticeText}>
            Upgrading to Unlimited on iOS isn’t available yet.
          </Text>
        </View>
      )}

      {phase === 'polling' && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Checking payment status…</Text>
        </View>
      )}

      {phase === 'success' && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>You’re on Unlimited</Text>
          <Text style={styles.noticeText}>Your upgrade is active.</Text>
        </View>
      )}

      {phase === 'timeout' && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Still processing</Text>
          <Text style={styles.noticeText}>
            We haven’t confirmed your payment yet. This can take a few minutes — check
            back shortly.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    lineHeight: 21,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  statusLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  statusValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  statusDetail: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  action: {
    marginTop: spacing.md,
  },
  formError: {
    color: colors.danger,
    fontSize: 14,
    marginTop: spacing.md,
  },
  notice: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: 'rgba(240, 96, 58, 0.10)',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  noticeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  noticeText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  stateContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  stateContent: {
    flex: 1,
    justifyContent: 'center',
  },
  stateTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  stateText: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
});
