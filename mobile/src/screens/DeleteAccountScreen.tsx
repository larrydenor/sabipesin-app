import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { deleteAccount } from '../api/account';
import { ApiError } from '../api/errors';
import { getSubscriptionStatus, SubscriptionStatusResponse } from '../api/subscriptions';
import { useAuth } from '../auth/AuthContext';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing } from '../theme';

// Account deletion (App Store Guideline 5.1.1(v)). Reached from a link on
// SubscriptionScreen. The subscription-status fetch here is best-effort and
// purely informational (drives the warning copy below) — unlike
// SubscriptionScreen's own required fetch, a failure here must NOT block
// deletion, so there's no error/retry state for it, just a silently-skipped
// warning.

export function DeleteAccountScreen() {
  const { signOut } = useAuth();

  const [status, setStatus] = useState<SubscriptionStatusResponse | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    getSubscriptionStatus()
      .then(setStatus)
      .catch(() => {
        // Best-effort: leave `status` null, the warning block below just
        // doesn't render. Deletion itself must always stay available.
      });
  }, []);

  const isActiveUnlimited = status?.plan === 'unlimited' && status?.status === 'active';

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      // Clears the Keychain/Keystore tokens and flips `isAuthenticated`, which
      // RootNavigator reads to swap straight to the phone-entry screen — no
      // manual navigation needed, same as every other sign-out.
      await signOut();
    } catch (e) {
      const err = e as ApiError;
      setDeleteError(err.message);
      setDeleting(false);
    }
  }, [signOut]);

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your profile, photos, and swipe history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void handleDelete() },
      ],
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Delete your account</Text>
      <Text style={styles.text}>
        This permanently deletes your profile, photos, and swipe history. It cannot be
        undone.
      </Text>
      <Text style={styles.text}>
        People you’ve matched with keep their side of your chat history — deleting your
        account removes you from their matches and conversations, but doesn’t erase what
        you already sent them.
      </Text>

      {isActiveUnlimited ? (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>You have an active Unlimited subscription</Text>
          <Text style={styles.warningText}>
            Deleting your account ends your remaining Unlimited time immediately.
          </Text>
          {status?.paymentPlatform === 'ios_iap' ? (
            <Text style={styles.warningText}>
              This does not cancel your subscription in the App Store — cancel it
              yourself in Settings → your name → Subscriptions to stop being charged.
            </Text>
          ) : null}
        </View>
      ) : null}

      {deleteError ? <Text style={styles.errorText}>{deleteError}</Text> : null}

      <View style={styles.action}>
        {deleting ? (
          <ActivityIndicator color={colors.danger} size="large" />
        ) : (
          <PrimaryButton title="Delete my account" onPress={confirmDelete} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  text: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  warning: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  warningTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  warningText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  action: {
    marginTop: spacing.lg,
  },
});
