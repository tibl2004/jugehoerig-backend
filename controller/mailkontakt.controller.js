const pool = require("../config/db");

const mailKontaktController = {

    authenticateToken: (req, res, next) => {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
    
        if (!token) return res.status(401).json({ error: 'Kein Token bereitgestellt.' });
    
        jwt.verify(token, 'secretKey', (err, user) => {
          if (err) {
            console.error('Token Überprüfung Fehlgeschlagen:', err);
            return res.status(403).json({ error: 'Ungültiger Token.' });
          }
          req.user = user;
          next();
        });
      },
      
  getMailKontakt: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM mail_kontakt LIMIT 1");
      if (rows.length === 0) {
        return res.status(404).json({ error: "Keine Mail-Kontaktinfos gefunden." });
      }
      res.json(rows[0]);
    } catch (error) {
      console.error("Fehler beim Abrufen:", error);
      res.status(500).json({ error: "Fehler beim Abrufen der Mail-Kontaktinfos." });
    }
  },

  createMailKontakt: async (req, res) => {
    try {
      const { email, hinweis } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email ist Pflichtfeld." });
      }

      await pool.query(
        `INSERT INTO mail_kontakt (email, hinweis) VALUES (?, ?)`,
        [email, hinweis]
      );

      res.status(201).json({ message: "Mail-Kontakt gespeichert." });
    } catch (error) {
      console.error("Fehler beim Erstellen:", error);
      res.status(500).json({ error: "Fehler beim Erstellen des Mail-Kontakts." });
    }
  },

  updateMailKontakt: async (req, res) => {
    try {
      const { email, hinweis } = req.body;
      const [existing] = await pool.query("SELECT * FROM mail_kontakt LIMIT 1");

      if (existing.length === 0) {
        return res.status(404).json({ error: "Keine Mail-Kontaktinfos vorhanden." });
      }

      await pool.query(
        `UPDATE mail_kontakt SET email=?, hinweis=? WHERE id=?`,
        [
          email || existing[0].email,
          hinweis || existing[0].hinweis,
          existing[0].id
        ]
      );

      res.json({ message: "Mail-Kontaktinfos aktualisiert." });
    } catch (error) {
      console.error("Fehler beim Aktualisieren:", error);
      res.status(500).json({ error: "Fehler beim Aktualisieren." });
    }
  },

  deleteMailKontakt: async (req, res) => {
    try {
      const [existing] = await pool.query("SELECT * FROM mail_kontakt LIMIT 1");
      if (existing.length === 0) {
        return res.status(404).json({ error: "Keine Mail-Kontaktinfos vorhanden." });
      }

      await pool.query("DELETE FROM mail_kontakt WHERE id=?", [existing[0].id]);
      res.json({ message: "Mail-Kontaktinfos gelöscht." });
    } catch (error) {
      console.error("Fehler beim Löschen:", error);
      res.status(500).json({ error: "Fehler beim Löschen." });
    }
  }
};

module.exports = mailKontaktController;
