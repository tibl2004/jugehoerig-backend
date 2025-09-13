const express = require("express");
const router = express.Router();
const anfrageController = require("../controller/anfrage.controller");

router.post("/", anfrageController.createAnfrage);
router.get("/", anfrageController.getAnfragen);
router.get("/:id", anfrageController.getAnfrageById);

module.exports = router;
