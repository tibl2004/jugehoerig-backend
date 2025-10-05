const express = require("express");
const router = express.Router();
const linksController = require("../controller/links.controller");


// 🔹 Alle Sections + Links abrufen (öffentlich erlaubt)
router.get("/", linksController.getAllSectionsWithLinks);

// 🔐 Auth prüfen für alle geschützten Routen
router.use(linksController.authenticateToken);

// 🔹 Neue Section + Links erstellen
router.post("/", linksController.createSectionWithLinks);


// 🔹 Nur Section-Titel ändern
router.put("/section/title/:id", linksController.updateSectionTitle);

// 🔹 Link zu bestehender Section hinzufügen
router.post("/section/:sectionId/link", linksController.addLinkToSection);

// 🔹 Einzelnen Link bearbeiten
router.put("/:id", linksController.updateSingleLink);

// 🔹 Ganze Section (inkl. Links) bearbeiten
router.put("/section/:id", linksController.editSectionWithLinks);

// 🔹 Reihenfolge aktualisieren
router.put("/reorder", linksController.reorderLinks);

// 🔹 Einzelnen Link löschen
router.delete("/:id", linksController.deleteLink);

// 🔹 Ganze Section löschen (inkl. Links)
router.delete("/section/:id", linksController.deleteSection);

module.exports = router;
