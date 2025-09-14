const express = require('express');
const router = express.Router();
const loginController = require('../controller/login.controller');

// Login-Routen
router.post('/', loginController.login); // Login-Anmeldung

router.put(
  '/vorstand/change-password-erstlogin',
  loginController.authenticateToken,
  loginController.changePasswordErstLogin
);

module.exports = router;
