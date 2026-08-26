const Profile = require('../models/Profile');
const { uploadImage, deleteImage } = require('../services/cloudinary');

// Max photos per profile. Dating apps cap this; keeps a single profile from
// filling the Cloudinary account. Not in the spec — a sensible default.
const MAX_PHOTOS = 6;

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

// POST /profile/photos
// Multipart upload (field name "photo"). Streams the file to Cloudinary, then
// appends { url, publicId, isPrimary } to the profile's photos array. The first
// photo on a profile becomes primary automatically. Creates the profile if the
// user hasn't set one up yet, mirroring PUT /profile/me's upsert behaviour.
async function uploadPhoto(req, res) {
    if (!req.file) {
        return res.status(400).json({ error: 'No photo uploaded (expected multipart field "photo")' });
    }

    let profile = await Profile.findOne({ userId: req.userId });
    if (!profile) {
        profile = new Profile({ userId: req.userId });
    }

    if (profile.photos.length >= MAX_PHOTOS) {
        return res.status(409).json({ error: `A profile can have at most ${MAX_PHOTOS} photos` });
    }

    // Upload before mutating the DB so a Cloudinary failure leaves no dangling
    // row. CloudinaryError propagates to the central handler (mapped to 502).
    const { url, publicId } = await uploadImage(req.file.buffer, `sabipesin/profiles/${req.userId}`);

    profile.photos.push({
        url,
        publicId,
        isPrimary: profile.photos.length === 0,
    });
    await profile.save();

    return res.status(201).json(profile);
}

// DELETE /profile/photos/:photoId
// Removes the photo subdocument (matched by its _id) and deletes the backing
// Cloudinary asset. If the removed photo was primary, the first remaining photo
// is promoted so a profile with photos always has exactly one primary.
async function deletePhoto(req, res) {
    const profile = await Profile.findOne({ userId: req.userId });
    if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
    }

    const photo = profile.photos.id(req.params.photoId);
    if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
    }

    const wasPrimary = photo.isPrimary;

    // Delete the asset first; a Cloudinary failure (502) aborts before we touch
    // the DB, so the row and asset never drift out of sync. A "not found" asset
    // is treated as success by the service, so re-deletes still clean up the row.
    if (photo.publicId) {
        await deleteImage(photo.publicId);
    }

    profile.photos.pull(photo._id);
    if (wasPrimary && profile.photos.length > 0) {
        profile.photos[0].isPrimary = true;
    }
    await profile.save();

    return res.json(profile);
}

module.exports = {
    getMe,
    updateMe,
    uploadPhoto,
    deletePhoto,
};
