const Profile = require('../models/Profile');

// Fields a user may set on their own profile via PUT /profile/me. Deliberately
// excludes: userId (identity), photos (managed by the photo-upload endpoint),
// and discoverySettings (managed by PUT /profile/discovery-settings, where the
// showOnlyNinVerified reciprocity rule is enforced — spec §4.5).
const EDITABLE_FIELDS = [
    'name', 'dob', 'gender', 'lookingFor', 'bio',
    'interests', 'tribe', 'religion', 'state', 'lga',
    'location', 'prompts',
];

// GET /profile/me
async function getMe(req, res) {
    const profile = await Profile.findOne({ userId: req.userId });
    if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
    }
    return res.json(profile);
}

// PUT /profile/me
// Upsert: creates the profile on first call, updates it thereafter. Only the
// allowlisted fields are applied; unknown/blocked fields are ignored.
async function updateMe(req, res) {
    const update = {};
    for (const field of EDITABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(req.body, field)) {
            update[field] = req.body[field];
        }
    }

    // Validate/normalize the GeoJSON point before it reaches Mongo so a bad
    // shape returns a clear 400 rather than a cast error or a broken index entry.
    if (update.location !== undefined) {
        const coords = update.location && update.location.coordinates;
        const valid = Array.isArray(coords)
            && coords.length === 2
            && coords.every((n) => typeof n === 'number' && Number.isFinite(n));
        if (!valid) {
            return res.status(400).json({ error: 'location.coordinates must be [longitude, latitude]' });
        }
        const [lng, lat] = coords;
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
            return res.status(400).json({ error: 'location coordinates out of range' });
        }
        update.location = { type: 'Point', coordinates: [lng, lat] };
    }

    // Mongoose ValidationError / CastError (e.g. a bad enum) propagate to the
    // central error handler, which maps them to 400.
    const profile = await Profile.findOneAndUpdate(
        { userId: req.userId },
        { $set: update, $setOnInsert: { userId: req.userId } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    return res.json(profile);
}

module.exports = {
    getMe,
    updateMe,
};
