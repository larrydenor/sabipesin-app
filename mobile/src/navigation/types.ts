// Typed route params for the native stack. `OtpEntry` needs the phone the user
// entered on the previous screen so it can call /auth/otp/verify with it.
export type AuthStackParamList = {
  PhoneEntry: undefined;
  OtpEntry: { phone: string };
};

// Onboarding order after sign-in: ProfileSetup → PhotoUpload → Home. The entry
// point is chosen from GET /profile/me — no profile (404) starts on ProfileSetup;
// a profile with no photos starts on PhotoUpload (a photoless profile can't be
// shown in discovery); an existing profile with photos goes straight to Home.
export type AppStackParamList = {
  ProfileSetup: undefined;
  PhotoUpload: undefined;
  Home: undefined;
  // Discovery filters (PUT /profile/discovery-settings), reached from the
  // Discover header's filter icon.
  DiscoverySettings: undefined;
  // The active-matches list (GET /matches); each row opens Chat.
  Matches: undefined;
  // A conversation, reached from the match overlay or the matches list. Keyed by
  // matchId — the chat resolves the conversationId via POST /matches/:id/conversation
  // on open. The optional name/photo let the header render instantly before that
  // round-trip resolves; the screen still refreshes them from the response.
  Chat: { matchId: string; otherUserName?: string; otherUserPhotoUrl?: string | null };
  // Subscription status + Paystack upgrade (Android/web only — iOS shows a
  // coming-soon state), reached from the Discover header.
  Subscription: undefined;
  // Report-a-user flow (POST /users/:id/report), reached from the Discover card's
  // and Chat header's overflow menu. `userName` is cosmetic only (screen title).
  // `onBlockedId`/`onDoneId` are NOT the callbacks themselves — route params must
  // stay serializable (a function here triggers React Navigation's
  // "Non-serializable values were found in the navigation state" warning) — they
  // are ids into `navigation/reportCallbacks`'s registry. `onBlocked` fires after
  // the screen's own "Block this person too" button succeeds — the ORIGIN screen
  // owns what that means (advance the deck, reset the nav stack, etc.), since it
  // differs between Discovery and Chat. `onDone` just closes the screen when the
  // user reports without blocking.
  ReportUser: { userId: string; userName?: string; onBlockedId: string; onDoneId: string };
  // Account deletion (App Store Guideline 5.1.1(v)), reached from a link on
  // SubscriptionScreen. Self-only, no params — mirrors DELETE /account always
  // targeting the caller.
  DeleteAccount: undefined;
};
