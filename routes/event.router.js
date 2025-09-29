const express = require("express");
const router = express.Router();
const eventController = require("../controller/event.controller");

// =================== Events ===================
// Alle Events abrufen
router.get("/", eventController.getEvents);

// Einzelnes Event abrufen
router.get("/:id", eventController.getEventById);

// Neue Event erstellen (nur Vorstand)
router.post("/", eventController.authenticateToken, eventController.createEvent);

// Event aktualisieren (nur Vorstand)
router.put("/:id", eventController.authenticateToken, eventController.updateEvent);

// Event löschen (nur Vorstand)
router.delete("/:id", eventController.authenticateToken, eventController.deleteEvent);

// =================== Formulare ===================
// Formularfelder für ein Event abrufen
router.get("/:id/formular", eventController.getFormFields);

// Formularfelder erstellen/aktualisieren (nur Vorstand)
router.post("/:id/formular", eventController.authenticateToken, eventController.createFormFields);

// =================== Anmeldungen ===================
// Anmeldung für ein Event
router.post("/:id/anmeldung", eventController.registerForEvent);

// Anmeldungen eines Events abrufen (nur Vorstand)
router.get("/:id/anmeldungen", eventController.authenticateToken, eventController.getRegistrations);

// =================== Nächste Event-ID ===================
router.get("/next-id", eventController.getNextEventId);

module.exports = router;
