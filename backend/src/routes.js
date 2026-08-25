const express = require('express');

const AuthController = require('./controllers/AuthController');
const ProfileController = require('./controllers/ProfileController');
const authMiddleware = require('./middlewares/auth');

const routes = express.Router();

// Phone OTP auth (spec §6). Full JWT/refresh issuance on verify is still TODO —
// these two endpoints currently establish and confirm the phone via Termii.
routes.post('/auth/otp/request', AuthController.requestOtp);
routes.post('/auth/otp/verify', AuthController.verifyOtp);

// Profile CRUD (spec §6). Authenticated; a user only ever reads/writes their
// own profile. Photo upload and discovery-settings are separate endpoints.
routes.get('/profile/me', authMiddleware, ProfileController.getMe);
routes.put('/profile/me', authMiddleware, ProfileController.updateMe);

module.exports = routes;
