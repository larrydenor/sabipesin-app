import { apiClient } from './client';

// Typed wrappers around the account-level email endpoints (receipt delivery —
// see SubscriptionScreen). This is account-level, not profile-level, data:
// it's never shown on the dating profile, never verified, and never used for
// login/OTP/recovery — see backend/src/models/User.js.

// GET /account/email
export async function getMyEmail(): Promise<string | null> {
  const { data } = await apiClient.get<{ email: string | null }>('/account/email');
  return data.email;
}

// PUT /account/email — null or an empty string clears it back to null. The
// backend trims/lowercases and validates format/length, returning a 400 with
// `code: 'INVALID_EMAIL' | 'EMAIL_TOO_LONG'` on a bad value (see
// AccountController.updateEmail) — callers validate locally first so this
// mainly guards against drift between the two.
export async function updateMyEmail(email: string | null): Promise<string | null> {
  const { data } = await apiClient.put<{ email: string | null }>('/account/email', { email });
  return data.email;
}

// DELETE /account response (App Store Guideline 5.1.1(v)) — see
// AccountController.deleteAccount. `deleted` counts are informational only;
// no caller currently reads them, they just mirror what the backend reports.
export type DeleteAccountResult = {
  message: string;
  deleted: { profile: boolean; photos: number; swipes: number };
};

// Self-only, no body — the backend always targets req.userId. Hard-deletes the
// caller's own Profile/Swipe/User docs and Cloudinary photos; Match/Conversation
// /Message are kept so the other side of a match retains their chat history
// (see DeleteAccountScreen for the user-facing copy of that distinction).
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const { data } = await apiClient.delete<DeleteAccountResult>('/account');
  return data;
}
