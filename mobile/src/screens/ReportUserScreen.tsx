import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';

import { ApiError } from '../api/errors';
import { blockUser, reportUser, REPORT_REASONS, ReportReason } from '../api/safety';
import { PrimaryButton } from '../components/PrimaryButton';
import { AppStackParamList } from '../navigation/types';
import { consumeCallback, releaseCallback } from '../navigation/reportCallbacks';
import { colors, spacing } from '../theme';

// Report-a-user flow: pick one of the backend's fixed reasons, an optional note,
// submit. On success, offers a one-tap "Block this person too" (reusing the same
// block call every other overflow menu uses) so a reporter isn't left still
// seeing the person they just reported — `onBlockedId` resolves (via
// `reportCallbacks`) to a callback that owns what happens next (local list/deck
// state + navigation), since that differs by where this screen was opened from
// (Discovery vs Chat).

type ReportUserRoute = RouteProp<AppStackParamList, 'ReportUser'>;

type Stage = 'form' | 'submitting' | 'submitted';

export function ReportUserScreen() {
  const route = useRoute<ReportUserRoute>();
  const { userId, userName, onBlockedId, onDoneId } = route.params;

  // Whichever of the two callbacks didn't fire (e.g. the user backs out of the
  // form without submitting, or submits but dismisses without tapping "Block"
  // or "Done") must still be dropped from the registry on the way out, or it
  // leaks forever — consuming one is a no-op for the other's release below.
  useEffect(() => {
    return () => {
      releaseCallback(onBlockedId);
      releaseCallback(onDoneId);
    };
  }, [onBlockedId, onDoneId]);

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [stage, setStage] = useState<Stage>('form');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!reason || stage === 'submitting') return;
    setStage('submitting');
    setSubmitError(null);
    try {
      await reportUser(userId, reason, details.trim());
      setStage('submitted');
    } catch (e) {
      const err = e as ApiError;
      setSubmitError(err.message);
      setStage('form');
    }
  }

  async function handleBlockToo() {
    if (blocking) return;
    setBlocking(true);
    setBlockError(null);
    try {
      await blockUser(userId);
      consumeCallback(onBlockedId)?.();
    } catch (e) {
      const err = e as ApiError;
      setBlockError(err.message);
      setBlocking(false);
    }
  }

  if (stage === 'submitted') {
    return (
      <View style={styles.stateContainer}>
        <View style={styles.stateContent}>
          <Text style={styles.stateTitle}>Report submitted</Text>
          <Text style={styles.stateText}>
            Thanks — our team will review this. {userName || 'This person'} won’t be notified.
          </Text>
          {blockError ? <Text style={styles.errorText}>{blockError}</Text> : null}
        </View>
        <PrimaryButton
          title={`Block ${userName || 'this person'} too`}
          onPress={() => void handleBlockToo()}
          loading={blocking}
        />
        <View style={styles.doneButton}>
          <Pressable onPress={() => consumeCallback(onDoneId)?.()} accessibilityRole="button">
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>Why are you reporting {userName || 'this person'}?</Text>

      <View style={styles.reasons}>
        {REPORT_REASONS.map((r) => {
          const selected = reason === r.value;
          return (
            <Pressable
              key={r.value}
              onPress={() => setReason(r.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => [
                styles.reasonRow,
                selected && styles.reasonRowSelected,
                pressed && styles.reasonRowPressed,
              ]}
            >
              <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>
                {r.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Anything else we should know? (optional)</Text>
      <TextInput
        style={styles.notes}
        value={details}
        onChangeText={setDetails}
        placeholder="Add details…"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={1000}
      />

      {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

      <PrimaryButton
        title="Submit report"
        onPress={() => void handleSubmit()}
        loading={stage === 'submitting'}
        disabled={!reason}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  reasons: {
    gap: spacing.sm,
  },
  reasonRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  reasonRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryDisabled,
  },
  reasonRowPressed: {
    opacity: 0.85,
  },
  reasonText: {
    color: colors.text,
    fontSize: 15,
  },
  reasonTextSelected: {
    fontWeight: '700',
  },
  notes: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.surface,
    color: colors.text,
    padding: spacing.md,
    fontSize: 15,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  stateContainer: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'flex-end',
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
  doneButton: {
    marginTop: spacing.md,
    alignItems: 'center',
    padding: spacing.sm,
  },
  doneText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '700',
  },
});
