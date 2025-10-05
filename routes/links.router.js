const express = require("express");
const router = express.Router();
const linksController = require("../controller/links.controller");

// 📋 Alle Sections + Links abrufen
router.get("/", linksController.getAllSectionsWithLinks);
// 🔐 Middleware für Token-Authentifizierung
router.use(linksController.authenticateToken);

// 🆕 Neue Section mit Links erstellen
router.post("/", linksController.createSectionWithLinks);



// ✏️ Nur Section-Titel ändern
router.put("/title/:id", linksController.updateSectionTitle);

// ➕ Link zu bestehender Section hinzufügen
router.post("/:sectionId/link", linksController.addLinkToSection);

// ✏️ Einzelnen Link bearbeiten
router.put("/link/:id", linksController.updateSingleLink);

// 🧩 Section bearbeiten (Titel + Links hinzufügen/ändern/löschen)
router.put("/:id", linksController.editSectionWithLinks);

// 🔢 Reihenfolge der Links aktualisieren
router.put("/reorder", linksController.reorderLinks);

// 🧹 Einzelnen Link löschen
router.delete("/:id", linksController.deleteLink);

// 🗑️ Ganze Section löschen (mit Links)
router.delete("/:id", linksController.deleteSection);

module.exports = router;
