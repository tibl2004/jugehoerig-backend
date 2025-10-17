const express = require('express');
const router = express.Router();
const spendenController = require('../controller/spenden.controller');

// Abrufen (kein Auth)
router.get('/', spendenController.getAll);

// Erstellen (vorstand/admin only)
router.post('/', spendenController.authenticateToken, spendenController.create);

// Aktualisieren (vorstand/admin only)
router.put('/', spendenController.authenticateToken, spendenController.update);

// Löschen (vorstand/admin only)
router.delete('/', spendenController.authenticateToken, spendenController.delete);

module.exports = router;
