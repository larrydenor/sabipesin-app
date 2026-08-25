const express = require('express');

const AuthController = require('./controllers/AuthController');

const routes = express.Router();

// Phone OTP auth (spec §6). Full JWT/refresh issuance on verify is still TODO —
// these two endpoints currently establish and confirm the phone via Termii.
routes.post('/auth/otp/request', AuthController.requestOtp);
routes.post('/auth/otp/verify', AuthController.verifyOtp);

module.exports = routes;
