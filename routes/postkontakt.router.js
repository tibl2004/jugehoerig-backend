const express = require("express");
const router = express.Router();
const postKontaktController = require("../controller/postkontakt.controller");

// Alle Einträge abrufen (kein Auth erforderlich)
router.get("/", postKontaktController.getAll);

// Eintrag erstellen (nur Vorstand/Admin)
router.post("/", postKontaktController.authenticateToken, postKontaktController.create);

// Eintrag aktualisieren (nur Vorstand/Admin)
// Hinweis: ID wird in Controller ignoriert, da nur 1 Datensatz existiert
router.put("/:id?", postKontaktController.authenticateToken, postKontaktController.update);

// Eintrag löschen (nur Vorstand/Admin)
router.delete("/:id?", postKontaktController.authenticateToken, postKontaktController.delete);

module.exports = router;
