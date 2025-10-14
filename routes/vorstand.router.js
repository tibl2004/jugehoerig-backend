// routes/vorstandRouter.js
const express = require("express");
const router = express.Router();
const vorstandController = require("../controller/vorstand.controller");
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage });



// Auth Middleware
const authenticate = vorstandController.authenticateToken;

// Nur vorstand darf neuen Vorstand anlegen
router.post("/", authenticate, vorstandController.createVorstand);

// Alle Vorstände anzeigen (z. B. für öffentliche Liste)
router.get("/public", vorstandController.getVorstand);

// Eigene Daten abrufen
router.get("/me", authenticate, vorstandController.getMyProfile);

router.get('/fotos', authenticate, vorstandController.getVorstandFotos);

// Eigene Daten aktualisieren
router.put("/me", authenticate, upload.single("foto"), vorstandController.updateMyProfile);

// Nur vorstand darf Passwort von einem Vorstand ändern
router.put("/change-password", authenticate, vorstandController.changePasswordByvorstand);

router.get('/logins', authenticate, vorstandController.getVorstandLogins);

module.exports = router;
