const express = require('express');
const router = express.Router();
const newsletterController = require('../controller/newsletter.controller');
router.get('/subscribers', newsletterController.authenticateToken, newsletterController.getAllSubscribers);

// Newsletter erstellen (nur vorstand, Token erforderlich)
router.post('/', newsletterController.authenticateToken, newsletterController.create);
router.get('/unsubscribe', newsletterController.unsubscribe);


// Alle Newsletter abrufen (kein Token nötig)
router.get('/', newsletterController.getAll);

router.get('/:id', newsletterController.getById);

// Newsletter abonnieren (kein Token nötig)
router.post('/subscribe', newsletterController.subscribe);

// Newsletter abbestellen (kein Token nötig)
router.get('/newsletter/unsubscribe', newsletterController.unsubscribe);

router.post('/import', newsletterController.importSubscribers);
  

module.exports = router;
