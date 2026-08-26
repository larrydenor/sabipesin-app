# Implementation Log

A running record of what was actually built, the real endpoint/model shapes, and
any deviations from `technical-build-spec.md` (with the reason). One entry per
feature, committed together with that feature's code.

---

## Photo upload — `POST /profile/photos`, `DELETE /profile/photos/:photoId`

**Built:** Cloudinary-backed profile photo upload and delete.

- `POST /profile/photos` — authenticated, `multipart/form-data`, single file field
  **`photo`**. Streams the file to Cloudinary (memory buffer, no temp file) into
  `sabipesin/profiles/<userId>/`, then appends to the profile's `photos` array.
  First photo on a profile is set `isPrimary: true` automatically. Returns `201`
  with the full profile. Upserts the profile if the user has none yet.
  - Limits: images only (`image/*`), max 5 MB, one file per request.
  - `409` if the profile already has the maximum number of photos.
- `DELETE /profile/photos/:photoId` — `:photoId` is the photo subdocument `_id`.
  Deletes the Cloudinary asset first, then removes the array entry. If the deleted
  photo was primary, the first remaining photo is promoted. Returns `200` with the
  updated profile. `404` if profile or photo not found.

**Model shape** (`Profile.photos[]`):
```
{ url: String, publicId: String, isPrimary: Boolean }   // + auto _id
```

**Error mapping** (central handler): Multer rejections → `400`; Cloudinary
failures (`CloudinaryError`) → `502`.

**Deviations from spec:**
- Added **`publicId`** to each photo subdoc (spec lists only `{ url, isPrimary }`).
  Reason: without the Cloudinary `public_id`, DELETE could only drop the DB row and
  would orphan the asset in Cloudinary. Additive — does not change the spec fields.
- Added a **6-photo cap per profile** (not in the spec). Reason: bound abuse and
  Cloudinary storage; easy to adjust via `MAX_PHOTOS` in `ProfileController`.

**Verification:** Smoke-tested end-to-end against the live SabiPesin Cloudinary
account (`cloud_name: ux66sa0p`) and live MongoDB — upload lands the asset,
`url` + `publicId` persist to the profile, and delete removes both the asset and
the row. (This surfaced a Mongoose 5.7 issue: subdoc `.deleteOne()` doesn't exist
on this version; switched to `array.pull(id)`.)

---

## Discovery settings — `PUT /profile/discovery-settings`

**Built:** The one write path allowed to set `showOnlyNinVerified`, enforcing the
NIN reciprocity rule (spec §4.5). `PUT /profile/me` remains blocked from writing
`discoverySettings`, so the rule can't be bypassed.

- `PUT /profile/discovery-settings` — authenticated. Body: any of
  `showOnlyNinVerified` (bool), `maxDistanceKm` (number > 0), `ageRange`
  (`{ min, max }` numbers). Applies only the provided fields via dot-path `$set`,
  so a partial update preserves the others. Upserts the profile if none exists.
  Returns `200` with the updated profile.
- **Reciprocity rule (§4.5):** if `showOnlyNinVerified: true` is requested and the
  requesting user's `ninVerifiedAt` is null, returns **`403`** with
  `{ error, code: "NIN_REQUIRED" }` and persists nothing — the client routes this
  straight into the NIN verification flow. Setting it can only succeed once the
  user is NIN-verified themselves. `showOnlyNinVerified: false` is always allowed.

**Persisted shape** (`Profile.discoverySettings`, unchanged from spec):
```
{ showOnlyNinVerified: Boolean(default false), maxDistanceKm: Number(default 25),
  ageRange: { min: Number, max: Number } }
```

**Deviations from spec:**
- Added an **18+ floor** on `ageRange.min` (rejects `< 18` with `400`). Not in the
  spec, but a safety baseline for a dating product. Other validation (types,
  `min <= max`, positive distance) is coherence-only.

**Verification:** Smoke-tested against live MongoDB — unverified user gets
`403 NIN_REQUIRED` with nothing persisted; verified user persists `true`;
partial updates preserve prior fields; defaults apply on insert; and the
validation cases (`min < 18`, `min > max`, negative distance, non-boolean, empty
body) all return `400`.

---

## Swipe & match creation — `Swipe` model, `Match` model, `POST /swipes`

**Built:** The `Swipe` and `Match` Mongoose models (spec §3) and the swipe
endpoint that records a swipe and forms a `Match` on a mutual like/superlike.
`GET /discovery` and `GET /matches` are intentionally **not** built yet — this is
just the swipe-and-match-creation slice.

**Models:**
- `Swipe` — `{ actorId, targetId, action: enum('like','pass','superlike') }`.
  Compound **unique** index on `(actorId, targetId)` — one swipe per pair.
- `Match` — `{ userA, userB, matchedAt, status: enum('active','unmatched') }`.
  The pair is stored **canonically** (`userA` = smaller ObjectId by hex string),
  with a compound **unique** index on `(userA, userB)`, so a match between two
  people is a single document regardless of who liked first. A `pre('validate')`
  hook canonicalizes the pair for direct `.create()`/`.save()` callers; the
  controller sorts the pair itself for its upsert (pre-hooks don't fire on
  `findOneAndUpdate`).

**Endpoint** — `POST /swipes` (authenticated). Body: `{ targetId, action }`.
- Validates `action` against the enum, `targetId` as a real ObjectId, rejects
  self-swipes (`400`), and `404`s if the target user doesn't exist.
- Records the swipe via **upsert** on `(actorId, targetId)`, so re-swiping the
  same person updates the action in place (e.g. a prior `pass` → `like`) instead
  of colliding on the unique index — last action wins.
- If the swipe is a `like`/`superlike` **and** the target has already
  liked/superliked the actor, creates the `Match` (upsert on the sorted pair;
  duplicate-key `11000` from a simultaneous mutual like is caught and the existing
  match re-read). A `pass` never forms a match.
- Returns `201` with `{ swipe, isMatch, match }` (`match` is `null` when no match
  formed).

**Deviations from spec:**
- Both models carry `timestamps: true` (adds `createdAt`/`updatedAt`), matching
  every other model in the codebase. The spec lists only `createdAt` on `Swipe`
  and only `matchedAt` on `Match`; the extra timestamps are additive. `matchedAt`
  is kept as the spec's canonical "when the match formed" field.
- `POST /swipes` **upserts** the swipe rather than rejecting a duplicate. Reason:
  lets a user change their mind (pass → like) and makes retries idempotent instead
  of surfacing a raw duplicate-key error. Not specified either way.
- Match creation leaves an existing `unmatched` match untouched (`$setOnInsert`
  only). Re-activation semantics belong with the unmatch feature, which isn't
  built yet.

**Verification:** Smoke-tested end-to-end against live MongoDB (29 assertions,
all passing) via the real controller with mock req/res, temp users cleaned up
after the run:
- Validation: self-swipe, bad `action`, non-ObjectId `targetId` → `400`;
  non-existent target → `404`.
- One-sided like → `201`, `isMatch: false`, no Match document written.
- Reciprocal like → `isMatch: true`, exactly one Match, pair stored canonically
  (`userA` < `userB`), `status: active`.
- **pass → like on the same target:** the pass leaves one swipe row (no match);
  the later like **upserts that same row in place** (still one row, action flips
  `pass → like`) and forms the match. Confirms upsert-on-repeat-swipe as built.
- **Simultaneous mutual like** (two concurrent `POST /swipes`, both directions):
  no throw, both `201`, exactly one Match. The duplicate-key `11000` recovery
  branch itself was additionally forced with two concurrent raw inserts on one
  pair — the loser raises `11000`, and catch-then-refetch returns the single
  surviving match. (`findOneAndUpdate`+upsert resolves the pair server-side and
  rarely surfaces `11000` on its own, so the invariant and the recovery path were
  verified separately.)

---

## Discovery & match listing — `GET /discovery`, `GET /matches`

**Built:** The two read endpoints that complete Phase 4's discovery slice.
`GET /discovery` returns paginated candidate profiles; `GET /matches` returns the
requester's active matches with each participant's verification tier.

**`GET /discovery`** — authenticated. Query: `page` (1-based, default 1), `limit`
(default 20, max 50). Returns `{ page, limit, hasMore, candidates: [...] }`.
Filters applied, all server-side:
- **Excludes self** and **every already-swiped user** — any `Swipe` row from the
  requester (like, pass, *or* superlike), via `Swipe...distinct('targetId')`.
- **Verification filter (spec §4.6):** if the requester's own
  `discoverySettings.showOnlyNinVerified` is `true`, only candidates with
  `ninVerifiedAt` set; otherwise anyone with at least `phoneVerifiedAt` set.
  Incomplete signups (neither timestamp) never appear. Suspended/banned users are
  excluded (`user.status: 'active'`).
- **Geo-distance (spec §4.6):** only when *both* sides have a location. If the
  requester has a location, candidates must be within their `maxDistanceKm`
  (default 25) **or** have no location of their own; candidates with a location
  beyond the radius are dropped. If the requester has no location, no distance
  filter is applied. Implemented with `$geoWithin`/`$centerSphere` (radius =
  `km / 6378.1` radians) inside an `$or` — `$near` can't be used in `$or` and would
  wrongly drop locationless candidates.
- Each candidate is returned with a small `user` summary
  (`{ id, verificationTier, phoneVerifiedAt, ninVerifiedAt }`) for the badge, and
  the candidate's own private `discoverySettings` are **stripped**.
- Implemented as a single `Profile.aggregate` (`$match` → `$lookup` users →
  `$unwind` → `$match` verification/status → `$sort` → `$skip`/`$limit`) so the
  cross-collection verification filter paginates correctly in one query.
  `hasMore` is computed by fetching `limit + 1` rows (no second count query).

**`GET /matches`** — authenticated. Returns
`{ viewerVerificationTier, matches: [...] }`, newest first, `status: 'active'`
only. Each match: `{ id, matchedAt, status, otherUser: { id, verificationTier,
profile } }`. Per **spec §4.7**, the derived `verificationTier` is always present
(even when `null`) for both the other participant *and* the viewer — never hidden.
The other user's profile is included (with their `discoverySettings` stripped).
Users are loaded hydrated so the model's `verificationTier` virtual runs; users
and profiles are batch-loaded (`$in`) and indexed by id for assembly.

**`GET /matches/:id`** — authenticated. Returns `{ viewerVerificationTier, match }`
where `match` is the same shape as one entry of `GET /matches` (other
participant's `verificationTier` included, §4.7, plus the viewer's own tier). The
lookup is **scoped to the requester** (`_id: id` AND `userA/userB` is the
requester), so a match that doesn't exist *or* isn't one of the requester's both
return **`404`** — deliberately indistinguishable, so the endpoint can't be used
to probe whether an arbitrary match id exists. A malformed (non-ObjectId) `:id`
also `404`s rather than surfacing a cast error. Unlike the list, the detail route
is **not** restricted to `status: 'active'` — a participant can still read a match
that was later `unmatched` (its `status` is in the payload). The list-shaping
logic is shared with `GET /matches` via an internal `shapeMatch` helper.

**New files:**
- `src/controllers/DiscoveryController.js`, `src/controllers/MatchController.js`
- `src/utils/verificationTier.js` — derives the tier from a plain object (the
  aggregation results aren't hydrated docs, so the model virtual can't run there).
  Mirrors the `User.verificationTier` virtual; both cite spec §3/§4.7.

**Deviations from spec:**
- Pagination shape (`page`/`limit`/`hasMore`) and the `limit` cap of 50 are not
  specified — sensible defaults.
- Candidate/other-user `discoverySettings` are stripped from responses (a privacy
  choice, not spec-mandated).
- `GET /matches/:id` returns a match in any `status` (including `unmatched`) as
  long as it belongs to the requester; the spec doesn't state a status filter for
  the detail route, and hiding an unmatched match behind a `404` would be
  surprising for a direct fetch.

**Verification:** Smoke-tested end-to-end against live MongoDB (25 assertions, all
passing) via the real controllers with mock req/res, temp data cleaned up after:
- Default discovery includes phone- and NIN-verified near candidates and a
  no-location candidate; excludes the far candidate (>25km), the unverified user,
  the suspended user, the already-swiped user, and self; strips `discoverySettings`
  and carries each candidate's `verificationTier`.
- `showOnlyNinVerified: true` narrows results to NIN-verified candidates only.
- A requester with **no location** sees the far candidate (distance filter skipped).
- `limit=2` returns 2 with `hasMore: true` and echoes `page`/`limit`.
- `GET /matches` lists one active match with `otherUser.verificationTier: 'nin'`,
  the other user's profile (discoverySettings stripped), and
  `viewerVerificationTier: 'phone'`; an `unmatched` match is not listed.

Separately smoke-tested `GET /matches/:id` (12 assertions, all passing, temp data
cleaned up):
- Own match → `200` with the requested match, the other participant as `otherUser`,
  their `verificationTier: 'nin'`, profile included (discoverySettings stripped),
  and `viewerVerificationTier: 'phone'`.
- Symmetry: the other participant fetching the same match sees the first user as
  `otherUser`, and `viewerVerificationTier` reflects whoever is fetching (`'nin'`).
- Foreign match (requester not a participant) → `404`; non-existent id → `404`;
  malformed (non-ObjectId) id → `404` (not a `500` cast error).

---

## Messaging data layer — `GET /conversations`, `GET /conversations/:id/messages`

**Built:** Phase 5's data layer and its two read endpoints (spec §3, §6). The
`Conversation` and `Message` models, plus listing a user's conversations and
paginating one conversation's messages. **Socket.IO and the anti-scam keyword
flagging are deliberately NOT in this slice** — only the models and the two read
endpoints. The `flagged` field exists now so the schema is stable before that
filter lands (spec §8.5).

**Models:**
- `Conversation` — `matchId` (ref `Match`, **unique** — one conversation per
  match), `participants: [ObjectId ref User]`, `lastMessageAt` (defaults to
  creation time; bumped per message later), plus `timestamps`. Index on
  `participants` for the "my conversations" membership query. `participants` is
  denormalised from the match so listing is one indexed query, no join back
  through `Match`.
- `Message` — `conversationId` (ref `Conversation`, indexed), `senderId`
  (ref `User`), `text: String`, `flagged: Boolean` (**default `false`** — the
  anti-scam filter will set `true` later), `readAt: Date` (**default `null`** —
  set by the future `read` event; nothing writes it yet), plus `timestamps`.
  Compound index `(conversationId, createdAt: -1)` serves the filter + newest-first
  sort in one.

**`GET /conversations`** — authenticated. Returns
`{ viewerVerificationTier, conversations: [...] }`, sorted by `lastMessageAt`
newest-first. Each entry: `{ id, matchId, lastMessageAt, otherUser: { id,
verificationTier, profile } }`. Mirrors `GET /matches`: the other participant is
resolved with their derived `verificationTier` (spec §4.7 — the chat screen shows
the badge, always present even when `null`) and public profile
(`discoverySettings` stripped); users and profiles are batch-loaded (`$in`) and
indexed by id for O(1) assembly.

**`GET /conversations/:id/messages`** — authenticated, **paginated**
(`?page`/`?limit`, `page` 1-based; `limit` defaults to 30, capped at 100).
Returns `{ page, limit, hasMore, messages: [...] }` with messages **newest-first**
(`createdAt: -1, _id: -1` tiebreak), each shaped as `{ id, conversationId,
senderId, text, flagged, readAt, createdAt }`. `hasMore` is computed by fetching
`limit + 1` rows (no second count query), same trick as discovery. The lookup is
**scoped to the requester** (`_id: id` AND `participants: me`), so a conversation
that doesn't exist *or* isn't one the requester participates in both return
**`404`** — deliberately indistinguishable, so the endpoint can't probe whether an
arbitrary conversation id exists (same posture as `GET /matches/:id`). A malformed
(non-ObjectId) `:id` also `404`s rather than surfacing a cast error. Pure read —
nothing sets `readAt` here.

**New files:**
- `src/models/Conversation.js`, `src/models/Message.js`
- `src/controllers/ConversationController.js`

**Deviations from spec:**
- Pagination shape (`page`/`limit`/`hasMore`) and the message `limit` default of 30
  / cap of 100 are not specified — sensible defaults, consistent with discovery.
- `GET /conversations` enriches each row with the other participant's
  `verificationTier` + public profile (a privacy-stripped, §4.7-consistent
  convenience for rendering the chat list) rather than returning the raw
  `participants` id array; not spec-mandated.
- Added an index on `Conversation.participants` (not in the spec) to back the
  membership query.

**Verification:** Smoke-tested end-to-end against live MongoDB (25 assertions, all
passing) via the real controllers with mock req/res, temp data cleaned up after.
Seed: 4 users (A phone-verified, B NIN-verified, C an outsider, D), two of A's
conversations (A-B and A-D) off real matches, and 5 messages in A-B with distinct
`createdAt`s (one `flagged`).
- `GET /conversations` (as A): returns both conversations sorted by
  `lastMessageAt` desc; the other participant is resolved (B, not self) with
  `verificationTier: 'nin'` and profile included, `discoverySettings` **stripped**;
  `viewerVerificationTier: 'phone'`. Outsider C sees an empty list.
- `GET /conversations/:id/messages` **404 scoping** — non-participant C → `404`
  (the key test), valid-but-non-existent id → `404`, malformed (non-ObjectId)
  id → `404` (not a `500` cast error).
- `GET /conversations/:id/messages` **pagination** — with `limit=2`: page 1 =
  `msg-4,msg-3` (newest-first) `hasMore: true`, page 2 = `msg-2,msg-1`
  `hasMore: true`, page 3 = `msg-0` `hasMore: false` (no overflow row); no overlap
  across pages. `flagged: true` round-trips on `msg-2`; message shape carries
  `flagged`/`readAt`/`createdAt`/`senderId`. Participant B reads all 5 at the
  default limit; the empty conversation A-D → `200` with 0 messages,
  `hasMore: false`.

Schema shapes were also asserted directly: `Message.flagged` defaults to `false`,
`Message.readAt` to `null`, `Conversation.matchId` is `unique`.

---

## Messaging real-time layer — Socket.IO + anti-scam flagging

**Built:** The rest of Phase 5 (spec §6, §8.5): Socket.IO wired onto the same HTTP
port as the REST API, the four messaging events, and the anti-scam keyword filter
that flags (never blocks) money-request messages.

**Server wiring** (`src/server.js`): Express is now wrapped in a raw
`http.createServer(app)` so Socket.IO can share the port; `server.listen` is
unchanged. A `Server` is attached with `cors: { origin: '*' }` (matches the
existing permissive REST CORS — tighten both before production) and handed to
`initSocket`.

**Connection auth** (`src/socket/index.js`): an `io.use` handshake middleware
mirrors the HTTP `auth` middleware — it reads the access token from
`handshake.auth.token` **or** a `Bearer` Authorization header, verifies it,
loads the user, and rejects missing/invalid tokens and non-`active` accounts. An
authenticated socket joins a room named after its `userId`, so delivering to a
user is `io.to(userId).emit(...)`: it fans out to all their open devices and is a
no-op when they're offline.

**Events** (`src/socket/messageHandlers.js`) — every handler re-authorizes against
conversation membership on each call (an authenticated socket ≠ access to a
thread), reusing the same 404-scoping posture as the REST endpoints (missing,
malformed, and foreign conversation ids are indistinguishable):
- `message:send` `{ conversationId, text }` → trims text (rejects empty), scans it
  for scam keywords, creates the `Message` (with `flagged`), bumps the
  conversation's `lastMessageAt` to the new message's `createdAt`, and emits
  `message:receive` to the **other** participant's room. The optional ack echoes
  the stored message (id, server timestamp, `flagged` verdict) back to the sender;
  the message is **not** echoed to the sender via `message:receive`.
- `typing` `{ conversationId, isTyping }` → fire-and-forget relay to the other
  participant; not persisted, no ack.
- `read` `{ conversationId }` → sets `readAt = now` on the **peer's** unread
  messages to me (`senderId ≠ me, readAt: null`) via `updateMany`, emits `read`
  `{ conversationId, readerId, readAt }` to the peer, and acks the updated count.
  This is the first writer of `Message.readAt` (the REST endpoints left it null).

**Anti-scam filter** (`src/utils/antiScam.js`, spec §8.5): `isScammy(text)` — a
case-insensitive, whitespace-tolerant set of money-request keyword patterns (send
money, gift card, wire transfer, bank/account details, western union / moneygram,
BVN / NUBAN, crypto) plus a heuristic that flags any run of 10+ digits (a
Nigerian NUBAN account number). A trip only sets `flagged: true`; it never blocks
or edits the message. Because flagging is non-destructive, the heuristics
deliberately favour recall over precision.

**New files:**
- `src/socket/index.js`, `src/socket/messageHandlers.js`
- `src/utils/antiScam.js`

**Dependencies:** added `socket.io` (^4.8.3).

**Deviations from spec:**
- The socket contract (payload shapes, ack callbacks, room-per-user delivery) is
  not specified beyond the four event names — these are sensible, REST-consistent
  choices. `message:send`'s ack echoes the stored message so the sender gets the
  server id/timestamp/`flagged` verdict without a refetch.
- The 10+-digit account-number heuristic can also trip on a pasted phone number.
  Accepted: flagging never blocks, so a false positive only shows the standing
  safety banner.
- `read` marks the whole thread read (not per-message ids) — matches the mockup's
  "opened the chat" semantics; per-message receipts can be added later if needed.

**Verification:** Smoke-tested end-to-end against live MongoDB (24 assertions, all
passing) by driving the real handlers and the real `initSocket` auth middleware
with a mock `io`/`socket` (same approach as the data-layer entry), temp data
cleaned up after. Seed: users A (phone-verified), B (NIN-verified), C (outsider),
a suspended user, a real A-B match and conversation.
- `message:send` (as A): clean text → ack ok, `flagged: false`, message persisted
  with sender+text, `message:receive` delivered to **B only** (not echoed to A),
  `lastMessageAt` bumped to the new message's `createdAt`. Scam text
  (`"send me money via gift card 0123456789"`) → `flagged: true`, still delivered
  (not blocked). Empty/whitespace text → negative ack, no message created.
  Non-participant C and a malformed conversation id → negative ack, no message,
  no cast crash.
- `typing` → relayed to B with `userId` + `isTyping`; non-participant emits nothing.
- `read` (as B) → A's two messages get `readAt` set, ack `updated: 2`, `read`
  receipt emitted to A with `readerId: B`.
- Handshake auth: valid token (via `auth.token` and via `Bearer` header) accepted;
  missing token, garbage token, and a suspended user all rejected.
- The 14-case `isScammy` unit table (send money / gift card / wire transfer /
  bank account digits / BVN / bitcoin / western union, and clean-message
  negatives) also passes.
