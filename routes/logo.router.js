// routes/logoRoutes.js
const express = require("express");
const router = express.Router();
const logoController = require("../controller/logo.controller");

// GET /api/logo
router.get("/", logoController.getLogo);

module.exports = router;
