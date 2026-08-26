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
