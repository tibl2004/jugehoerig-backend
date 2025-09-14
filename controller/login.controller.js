const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../database/index');

const loginController = {
  // Token prüfen
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Kein Token bereitgestellt.' });
    }

    jwt.verify(token, 'secretKey', (err, user) => {
      if (err) {
        console.error('Token Überprüfung fehlgeschlagen:', err);
        return res.status(403).json({ error: 'Ungültiger Token.' });
      }
      req.user = user;
      next();
    });
  },

  // Login
  login: async (req, res) => {
    try {
      const { benutzername, passwort } = req.body;

      if (!benutzername || !passwort) {
        return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich.' });
      }

      // Nur vorstand prüfen
      const [vorstandResult] = await pool.query(
        "SELECT * FROM vorstand WHERE benutzername = ?",
        [benutzername]
      );

      if (vorstandResult.length === 0) {
        return res.status(400).json({ error: 'Benutzername oder Passwort falsch.' });
      }

      const user = vorstandResult[0];
      const valid = await bcrypt.compare(passwort, user.passwort);

      if (!valid) {
        return res.status(400).json({ error: 'Benutzername oder Passwort falsch.' });
      }

      const userTypes = ["vorstand"];
      const rolle = user.rolle;

      // JWT Payload
      const tokenPayload = {
        id: user.id,
        benutzername: user.benutzername,
        userTypes,
        rolle
      };

      const token = jwt.sign(tokenPayload, 'secretKey', { expiresIn: '240h' });

      res.json({
        token,
        id: user.id,
        benutzername: user.benutzername,
        userTypes,
        rolle,
        passwort_geaendert: user.passwort_geaendert // 0 = muss ändern, 1 = schon geändert
      });

    } catch (error) {
      console.error('Fehler beim Login:', error);
      res.status(500).json({ error: 'Fehler beim Login.' });
    }
  },

  // Erst-Login Passwort ändern
  changePasswordErstLogin: async (req, res) => {
    try {
      const userId = req.user?.id;
      const { neuesPasswort } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Nicht autorisiert.' });
      }

      if (!neuesPasswort || neuesPasswort.trim().length < 6) {
        return res.status(400).json({ error: 'Neues Passwort ist erforderlich und muss mindestens 6 Zeichen lang sein.' });
      }

      const hashedPassword = await bcrypt.hash(neuesPasswort, 10);

      const [result] = await pool.query(
        "UPDATE vorstand SET passwort = ?, passwort_geaendert = 1 WHERE id = ?",
        [hashedPassword, userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
      }

      res.status(200).json({ 
        message: 'Passwort erfolgreich geändert. Bitte jetzt normal einloggen.' 
      });
    } catch (error) {
      console.error('Fehler beim Passwort ändern:', error);
      res.status(500).json({ error: 'Passwort konnte nicht geändert werden.' });
    }
  }
};

module.exports = loginController;
