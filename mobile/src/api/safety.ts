import { apiClient } from './client';

// Typed wrappers around the safety endpoints (App Store Guideline 1.2):
//   POST /users/:id/report — files a moderation report, no side effects
//   POST /users/:id/block  — mutual-direction block, idempotent server-side
// Both are authenticated; the shared client attaches the bearer token.

// Mirrors the backend's Report.REASONS enum (backend/src/models/Report.js) —
// kept here as the single source of truth for the mobile reason picker.
export type ReportReason =
  | 'inappropriate_photos'
  | 'harassment'
  | 'scam_attempt'
  | 'fake_profile'
  | 'underage'
  | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'inappropriate_photos', label: 'Inappropriate photos' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'scam_attempt', label: 'Scam attempt' },
  { value: 'fake_profile', label: 'Fake profile' },
  { value: 'underage', label: 'Underage user' },
  { value: 'other', label: 'Other' },
];

export type Report = {
  id: string;
  reportedUserId: string;
  reason: ReportReason;
  status: 'pending' | 'reviewed' | 'actioned' | 'dismissed';
  createdAt: string;
};

// POST /users/:id/report { reason, details? } — `details` max 1000 chars
// (enforced server-side; callers should cap input locally too).
export async function reportUser(
  userId: string,
  reason: ReportReason,
  details?: string,
): Promise<Report> {
  const { data } = await apiClient.post<{ report: Report }>(`/users/${userId}/report`, {
    reason,
    details: details || undefined,
  });
  return data.report;
}

export type Block = {
  id: string;
  blockedUserId: string;
  createdAt: string;
};

// POST /users/:id/block — idempotent: blocking an already-blocked user still
// resolves successfully (200 vs 201, both fine to ignore here).
export async function blockUser(userId: string): Promise<Block> {
  const { data } = await apiClient.post<{ block: Block }>(`/users/${userId}/block`);
  return data.block;
}
