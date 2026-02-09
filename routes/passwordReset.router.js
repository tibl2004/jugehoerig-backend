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
router.put(
  "/reset",
  passwordResetController.resetPassword
);

module.exports = router;
