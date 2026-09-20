const User = require('../models/User');
const Profile = require('../models/Profile');
const Swipe = require('../models/Swipe');
const { deleteImage } = require('../services/cloudinary');

// DELETE /account
// Permanently deletes the CALLING user's own account (App Store Guideline
// 5.1.1(v)). Auth-required; there is no admin/other-user deletion path — a user can
// only ever delete themselves (the target is always req.userId).
//
// What is HARD-deleted (the user's own data):
//   - their Cloudinary photo assets (real destroy() calls, verified per photo)
//   - their Profile document
//   - every Swipe where they are either the actor or the target
//   - their User document
//
// What is deliberately KEPT: Match / Conversation / Message documents. Those are
// shared with the other party, who keeps an intact audit trail — the deleted user
// is instead soft-excluded from the other side's view by utils/accounts.js
// (Chunk 1), exactly the way Report/Block keeps the docs and soft-excludes.
//
// Session invalidation: there is no token blacklist — access tokens are stateless
// JWTs. Deleting the User document IS the invalidation: the auth middleware does a
// live `User.findById` on every request (and the socket handshake does the same),
// so once the User is gone every existing token for it fails with 401 "User no
// longer exists" on its next use. No new mechanism is invented.
//
// Ordering is chosen for safe partial-failure behaviour, mirroring
// ProfileController.deletePhoto: delete the irreversible Cloudinary assets FIRST so
// a storage failure (CloudinaryError → 502) aborts before any DB document is
// touched, and delete the User LAST so that if an earlier DB step fails, the
// account still exists and the request can simply be retried (each Cloudinary
// asset is then already "not found", which deleteImage treats as success). This is
// intentionally NOT wrapped in a Mongo transaction: the rest of the codebase
// doesn't use them (they require a replica set and aren't available on a standalone
// mongod), and the ordering above gives graceful degradation without one.
async function deleteAccount(req, res) {
    const me = req.userId;

    // Load the profile first, only for its photo public_ids.
    const profile = await Profile.findOne({ userId: me });

    // 1) Delete every Cloudinary photo asset, verifying each. deleteImage throws a
    //    CloudinaryError (→ 502) on a real failure and treats an already-missing
    //    asset as success, so we either remove them all or abort before any DB
    //    mutation. Done serially so the first failure stops us immediately.
    let photosDeleted = 0;
    if (profile && Array.isArray(profile.photos)) {
        for (const photo of profile.photos) {
            if (photo.publicId) {
                await deleteImage(photo.publicId);
                photosDeleted += 1;
            }
        }
    }

    // 2) Delete the Profile document.
    if (profile) {
        await profile.deleteOne();
    }

    // 3) Delete every Swipe where this user is either party (actor or target), so
    //    no dangling swipe references a user that no longer exists.
    const swipeResult = await Swipe.deleteMany({
        $or: [{ actorId: me }, { targetId: me }],
    });
    const swipesDeleted = swipeResult.deletedCount || 0;

    // 4) Delete the User document LAST — this is what invalidates the caller's
    //    tokens (see the header note). Match/Conversation/Message are untouched.
    await User.deleteOne({ _id: me });

    // 5) Force-disconnect any socket the caller had already open. The auth
    //    middleware and the socket handshake both re-check the User on every
    //    request/connection, so REST and any RECONNECT are already rejected the
    //    moment the User is gone — but a socket established BEFORE deletion isn't
    //    re-checked per event, so it would otherwise keep working for the life of
    //    that connection. Each authenticated socket joins a room named after its
    //    userId (see socket/index.js), so disconnecting that room evicts all of
    //    the user's live connections immediately. `true` closes the underlying
    //    transport so the client sees a real disconnect, not just a namespace
    //    leave. Best-effort: a missing io (e.g. non-socket test harness) is a
    //    no-op and never blocks the deletion response.
    const io = req.app.get('io');
    if (io) {
        io.in(me).disconnectSockets(true);
    }

    // 200 with a body, consistent with the DELETE /users/:id/block precedent.
    return res.json({
        message: 'Account deleted',
        deleted: {
            profile: Boolean(profile),
            photos: photosDeleted,
            swipes: swipesDeleted,
        },
    });
}

module.exports = { deleteAccount };
