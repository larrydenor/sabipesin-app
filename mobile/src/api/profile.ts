import { apiClient } from './client';
import { ApiError } from './errors';

// Typed wrappers around the profile endpoints the setup screen needs (spec §6).
// Photos, discoverySettings and location are managed by their own endpoints and
// are intentionally NOT written here — see EDITABLE_FIELDS in ProfileController.

export type LookingFor = 'casual' | 'serious' | 'marriage' | 'friendship';

// Opposite-sex matching by product decision — gender is a closed male/female set
// and discovery derives the match target from it (no separate preference field).
export type Gender = 'male' | 'female';

// The subset of the Profile model this screen reads/writes. The backend returns
// the full document; we only type what we use.
export type Profile = {
  _id: string;
  userId: string;
  name?: string;
  dob?: string; // ISO date string
  gender?: Gender;
  lookingFor?: LookingFor;
  bio?: string;
  interests?: string[];
  state?: string;
  lga?: string;
};

// PUT /profile/me accepts any subset of the writable fields (it upserts). We only
// send fields the user actually filled in, so empty optionals aren't stored as "".
export type UpdateProfileInput = {
  name?: string;
  dob?: string;
  gender?: Gender;
  lookingFor?: LookingFor;
  bio?: string;
  interests?: string[];
  state?: string;
  lga?: string;
};

// GET /profile/me — 200 with the profile, or 404 when the user has none yet. The
// 404 is not an error condition for the caller (it drives routing to setup), so
// callers should inspect `err.status === 404` rather than treating it as failure.
export async function getMyProfile(): Promise<Profile> {
  const { data } = await apiClient.get<Profile>('/profile/me');
  return data;
}

// PUT /profile/me — upsert. Creates the profile on first call, updates thereafter.
export async function updateMyProfile(input: UpdateProfileInput): Promise<Profile> {
  const { data } = await apiClient.put<Profile>('/profile/me', input);
  return data;
}

// The writable fields this screen owns — used to decide which parsed backend
// error paths belong to a form field vs. the form-level banner.
const FORM_FIELDS = ['name', 'dob', 'gender', 'lookingFor', 'bio', 'interests', 'state', 'lga'];

// Turn a backend 400 into a per-field error map so the screen can show messages
// inline instead of one generic banner. The central handler returns the raw
// Mongoose message as `{ error }`, in one of two shapes:
//   ValidationError: "Profile validation failed: lookingFor: `x` is not a valid
//                     enum value for path `lookingFor`., dob: Cast to Date failed…"
//   CastError:       'Cast to date failed for value "…" at path "dob"'
// Anything we can't attribute to a known field is returned under the `_form` key.
export function parseFieldErrors(err: ApiError): Record<string, string> {
  if (err.kind !== 'validation') return { _form: err.message };

  const msg = err.message;
  const result: Record<string, string> = {};

  const marker = 'validation failed: ';
  const idx = msg.indexOf(marker);
  if (idx !== -1) {
    // Mongoose joins multiple field errors with ", ". Each part is "path: detail".
    const body = msg.slice(idx + marker.length);
    for (const part of body.split(', ')) {
      const sep = part.indexOf(': ');
      if (sep === -1) continue;
      const field = part.slice(0, sep).trim();
      const detail = part.slice(sep + 2).trim().replace(/\.$/, '');
      if (FORM_FIELDS.includes(field)) result[field] = detail;
    }
  } else {
    // CastError style — pull the field out of `at path "dob"`.
    const m = /at path "(\w+)"/.exec(msg);
    if (m && FORM_FIELDS.includes(m[1])) {
      result[m[1]] = `That value isn't valid for ${m[1]}.`;
    }
  }

  // Couldn't attribute it to any field — show the raw message at form level.
  if (Object.keys(result).length === 0) result._form = msg;
  return result;
}
