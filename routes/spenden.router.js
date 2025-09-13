const express = require('express');
const router = express.Router();
const spendenController = require('../controller/spenden.controller');

// Alle Inhalte abrufen (kein Auth erforderlich)
router.get('/', spendenController.getAll);

// Neue Section mit Links erstellen (vorstand only)
router.post('/', spendenController.authenticateToken, spendenController.create);

// Bestehende Section mit Links aktualisieren (vorstand only)
router.put('/:id', spendenController.authenticateToken, spendenController.update);

// Einzelnen Link löschen (vorstand only)
router.delete('/:id', spendenController.authenticateToken, spendenController.delete);

module.exports = router;
