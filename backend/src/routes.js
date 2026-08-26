const express = require('express');
const multer = require('multer');

const AuthController = require('./controllers/AuthController');
const ProfileController = require('./controllers/ProfileController');
const authMiddleware = require('./middlewares/auth');
const asyncHandler = require('./utils/asyncHandler');

const routes = express.Router();

// Photo uploads: keep the file in memory (buffer) so the controller can stream
// it straight to Cloudinary without a temp file. Reject non-images up front and
// cap size; multer raises MulterError, mapped to 400 by the central handler.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter(req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            return cb(null, true);
        }
        return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'photo'));
    },
});

// Every async handler/middleware is wrapped with asyncHandler so a throw or
// rejection is routed to the central error handler instead of crashing the
// process (Express 4 does not catch async rejections on its own).
const auth = asyncHandler(authMiddleware);

// Phone OTP auth (spec §6).
routes.post('/auth/otp/request', asyncHandler(AuthController.requestOtp));
routes.post('/auth/otp/verify', asyncHandler(AuthController.verifyOtp));

// Profile CRUD (spec §6). Authenticated; a user only ever reads/writes their
// own profile. Photo upload and discovery-settings are separate endpoints.
routes.get('/profile/me', auth, asyncHandler(ProfileController.getMe));
routes.put('/profile/me', auth, asyncHandler(ProfileController.updateMe));

// Photo upload/delete (spec §6). Multipart field name: "photo".
routes.post('/profile/photos', auth, upload.single('photo'), asyncHandler(ProfileController.uploadPhoto));
routes.delete('/profile/photos/:photoId', auth, asyncHandler(ProfileController.deletePhoto));

// Discovery settings (spec §6). Enforces the NIN reciprocity rule (§4.5) — the
// one write path allowed to set showOnlyNinVerified.
routes.put('/profile/discovery-settings', auth, asyncHandler(ProfileController.updateDiscoverySettings));

module.exports = routes;
