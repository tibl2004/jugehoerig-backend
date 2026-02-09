const express = require("express");
const router = express.Router();

const passwordResetController = require("../controller/passwordReset.controller");

// 🔹 Passwort vergessen → Reset-Mail anfordern
// POST /api/password-reset/request
router.post(
  "/request",
  passwordResetController.requestReset
);

// 🔹 Neues Passwort setzen
// POST /api/password-reset/reset
router.post(
  "/reset",
  passwordResetController.resetPassword
);

module.exports = router;
