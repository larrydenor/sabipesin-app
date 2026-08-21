const express = require('express');

const routes = express.Router();

// Auth and Dev routes were removed with the old fake-auth teardown
// (GitHub-API signup, spoofable user-header identity, dead LoginController).
// Real JWT/OTP auth and the rebuilt endpoints will be added here.

module.exports = routes;
