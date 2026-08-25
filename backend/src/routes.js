const express = require('express');

const AuthController = require('./controllers/AuthController');
const ProfileController = require('./controllers/ProfileController');
const authMiddleware = require('./middlewares/auth');
const asyncHandler = require('./utils/asyncHandler');

const routes = express.Router();

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

module.exports = routes;
