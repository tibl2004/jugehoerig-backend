const express = require("express");
const router = express.Router();
const eventController = require("../controller/event.controller");

// Events
router.post("/", eventController.authenticateToken, eventController.createEvent);
router.get("/", eventController.getEvents);
router.get("/:id", eventController.getEventById);
router.put("/:id", eventController.authenticateToken, eventController.updateEvent);
router.delete("/:id", eventController.authenticateToken, eventController.deleteEvent);

// Formulare
router.post("/:id/formular", eventController.authenticateToken, eventController.createFormFields);
router.get("/:id/formular", eventController.getFormFields);

// Anmeldung
router.post("/:id/anmelden", eventController.registerForEvent);
router.get("/:id/anmeldungen", eventController.authenticateToken, eventController.getRegistrations);

module.exports = router;
