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
