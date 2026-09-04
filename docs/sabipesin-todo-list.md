# SabiPesin — Todo List

A running list of things flagged along the way that aren't blocking right now, but shouldn't be forgotten. Update this as new things come up — check items off as they're resolved rather than deleting them, so there's a record of what's been handled.

---

## Blocking on CAC documents

**Status: CAC documents in hand. Bank account number pending — the one remaining piece before every item below can be actioned.** An admin contact on the investor side is now handling this paperwork directly, rather than it sitting on Larry's plate.

- [ ] **Termii — SabiPesin's own account.** Currently borrowing CraftRanked's Termii API key/Sender ID to prove the OTP flow works. Once CAC docs are in hand:
  - Complete SabiPesin's own Termii KYC (Business Details already filled in, documents not yet uploaded)
  - Activate Nigeria as a destination country on the account
  - Request and get SabiPesin's own Sender ID approved — **budget real time for this.** CraftRanked's own Sender ID took from an early-year application to an August 4th approval (weeks, not the advertised "1–3 business days")
  - Swap `TERMII_API_KEY` in `.env` from CraftRanked's borrowed key to SabiPesin's own
  - Do one final live-SMS test end to end with the real account before calling the OTP piece truly done (not just code-complete)
- [ ] **QoreID — production account.** Blocked pending CAC documents (sandbox already available for testing)
- [ ] **Paystack — business (KYB) verification.** Required before any live payment processing
- [ ] **CAC name registration itself** — confirm "SabiPesin Ltd" is filed and approved
- [ ] **Hand the admin contact a clear list of what needs the CAC document + bank details once ready:** QoreID production account activation, Paystack KYB submission, Termii Sender ID application (budget real time here — CraftRanked's own took from an early-year application to an August 4th approval, weeks not days), and — new, worth adding to their scope — drafting Terms of Service, Privacy Policy, and NDPR-compliant data-processing language with the investor's law firm.

---

## Vendor / account follow-ups

- [ ] **QoreID sandbox not subscribed to NIN + selfie face-match product.** Live-tested against the real sandbox API (credentials confirmed valid — token mint succeeds) but every session-creation attempt for the NIN+selfie flow returns 403 "Not subscribed to this product" or 400 "Unknown productCode." The `30417` collection ID we were given doesn't map to any field QoreID's `/v1/sessions` endpoint accepts. Needs a support ticket to QoreID: (1) get the sandbox account subscribed to the NIN + selfie face-match product, (2) clarify how the `30417` collection ID is meant to be used — likely a dashboard-side product subscription rather than a request field. Code side is done and correct (confirmed against QoreID's own SDK docs) — this is purely an account-provisioning gap on QoreID's end.

- [ ] **Close PR #30** on `gstvds/Tindev` — a pull request opened against the upstream repo by mistake instead of your own fork. Not urgent, just tidy it up.
- [x] **Instagram, TikTok, and Facebook Page** — "SabiPesin" secured on all three (Facebook wasn't even on the original checklist — good catch going beyond it)
- [ ] **Nigeria Trademarks Registry search** for "SabiPesin" — domain, CAC name, app store availability, and social handles are all confirmed clear; trademark is the one check still outstanding
- [ ] **Confirm Instagram/TikTok handles** for "SabiPesin" are free and reserve them

---

- [ ] **Push notifications — not started, needs its own dedicated slice.** Zero push notification code exists yet. Real constraints worth planning around: Expo Go (used for all mobile testing so far) doesn't support remote push at all — testing requires building a proper EAS "development build" and a physical device, not the simulator. iOS needs the Apple Developer account (already planned) to generate push credentials; Android needs a Firebase project (similar to CraftRanked's existing setup). Best sequenced after the remaining core screens (verification, subscriptions, discovery settings) and alongside Phase 10 production readiness, not squeezed into regular feature work.

- [ ] **Mobile: no token refresh mid-session.** The 15-minute access token has no refresh flow on mobile yet — when it expires, the chat socket drops and shows an honest "offline" notice rather than silently failing, but a real user's chat going offline every 15 minutes is a genuinely bad experience. Needs a proper refresh-on-401 (or proactive refresh before expiry) path before launch — this is a real launch blocker, not cosmetic polish.

- [x] **Gender/matching model resolved.** Product is opposite-sex matching only, by deliberate design — not a legal-review blocker, since the discovery filter never offers same-sex matching as a feature in the first place. `gender` uses a simple male/female enum; discovery filtering derives directly from it (no separate `interestedIn` field needed). Confirmed live: Atlas had zero profiles at the time of this change, so no migration was needed. **Residual watch item:** the discovery filter's "silent exclusion for non-enum/missing gender" behavior only becomes a real risk if a profile is ever created outside the mobile form's enum-constrained screen (a seed script, admin tool, or bulk import). If such a path is built later, re-run `{ gender: { $nin: ['male','female', null] } }` against production before trusting the filter.

- [ ] **Tighten CORS before production.** Both the REST API and the new Socket.io layer currently allow `origin: '*'` (Socket.io was deliberately set to match the existing permissive REST config while building, not because it's safe long-term). This is a real security gap for Socket.io specifically — open CORS on an authenticated real-time connection means any website could attempt to open a socket to your server. Fix both together before any public launch: restrict to the actual frontend/app origins.

- [ ] **Orphaned shell Users cleanup.** The OTP flow creates a `User` record on *request*, not on successful *verify* (a schema requirement — `Verification.userId` needs an existing user to reference). This means an abandoned or failed OTP attempt leaves a `phoneVerifiedAt: null` shell user in the database. Harmless today; worth a periodic cleanup job once there's an admin surface or enough real traffic for it to matter.
- [ ] **QoreID dev-mode toggle.** CraftRanked's codebase has a `QOREID_ENABLED=false` env flag that mocks a successful verification locally, avoiding real API calls (and cost) during everyday development. Worth adding the same pattern to SabiPesin's spec before building the QoreID integration (Phase 5) — genuinely useful, not yet added.
- [ ] **StoreKit product IDs / iOS subscription pricing tier.** Apple sells subscriptions in fixed price tiers, not arbitrary naira amounts — needs mapping once the final subscription price is locked in.

---

## Product / brand follow-ups

- [ ] **Logo mark.** The name (SabiPesin) is locked; the visual logo itself is still undesigned. Flagged as open in the brand mockup.
- [ ] **Revenue projections in the investor mockup** are currently shown gross. Once you're closer to launch, worth running a version net of the iOS 15% commission (Small Business Program rate) so the investor sees real take-home, not just gross MRR. Not urgent — a five-minute update whenever it's relevant again.

---

## Remaining build phases (per technical-build-spec.md)

Roughly in order, per the spec's recommended sequence:

- [ ] **Finish Phase 2 — Profiles:** photo upload via Cloudinary (fresh SabiPesin account opened, not yet wired in), and the `PUT /profile/discovery-settings` endpoint that actually enforces the reciprocity rule (`showOnlyNinVerified`) at the API layer
- [ ] **Phase 3 — Discovery & Matching:** geo query, swipe, match creation
- [ ] **Phase 4 — Messaging:** Socket.io, conversation/message models, anti-scam keyword flagging
- [ ] **Phase 5 — Trust & Verification:** QoreID NIN/selfie integration, reciprocity rule end to end
- [ ] **Phase 6 — Payments:** Subscription + Transaction models, Paystack (Android/web) + StoreKit (iOS), verified webhooks both platforms
- [ ] **Phase 7 — AI features:** compatibility scoring, conversation starters
- [ ] **Phase 8 — Admin & moderation**
- [ ] **Phase 9 — Testing:** broader end-to-end pass once more phases exist (note: less debt here than usual, since every PR so far has been tested before merge, not deferred)
- [ ] **Phase 10 — Production deployment:** App Store Connect setup, 17+ age rating, reviewer demo account (bypasses OTP/NIN in a controlled way), StoreKit product configuration

---

## Already resolved (kept for the record)

- [x] Hardcoded MongoDB credentials rotated out, fresh SabiPesin cluster live and verified
- [x] Fake Tindev auth (GitHub-signup, spoofable header, dead LoginController) fully stripped
- [x] JWT foundation built — separate access/refresh secrets, type-claim cross-validation
- [x] Phone OTP flow built self-managed (Termii's Token API turned out to be "Country Inactive" on both accounts) — hashed codes, 10-min expiry, 5-attempt cap, rate limiting
- [x] JWT issuance wired into OTP verify success path
- [x] App-wide async error handling — no single bad request can crash the server anymore
- [x] Profile model + `GET/PUT /profile/me` built, with `discoverySettings` and `photos` deliberately excluded from the general update endpoint to protect the reciprocity rule
