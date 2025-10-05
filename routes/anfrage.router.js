// routes/anfrageRoutes.js
const express = require("express");
const router = express.Router();
const anfrageController = require("../controller/anfrage.controller");

// Anfrage erstellen
router.post("/", anfrageController.createAnfrage);

// Alle Anfragen abrufen
router.get("/", anfrageController.getAnfragen);

// Einzelne Anfrage nach ID abrufen
router.get("/:id", anfrageController.getAnfrageById);



module.exports = router;
