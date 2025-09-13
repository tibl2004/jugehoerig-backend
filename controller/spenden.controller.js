const pool = require("../database/index");
const jwt = require("jsonwebtoken");

const spendenController = {
  // Middleware: Token überprüfen
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Kein Token bereitgestellt." });

    jwt.verify(token, "secretKey", (err, user) => {
      if (err) {
        console.error("Token Überprüfung Fehlgeschlagen:", err);
        return res.status(403).json({ error: "Ungültiger Token." });
      }
      req.user = user;
      next();
    });
  },

  // EINMALIG Spendeninformationen erstellen
  create: async (req, res) => {
    try {
      if (req.user.userType !== "vorstand") {
        return res.status(403).json({ error: "Nur Vorstände dürfen Spendeninfos erstellen." });
      }

      // Prüfen, ob schon ein Eintrag existiert
      const [existing] = await pool.query("SELECT * FROM spenden LIMIT 1");
      if (existing.length > 0) {
        return res.status(400).json({ error: "Es existiert bereits ein Spenden-Datensatz. Bitte aktualisieren statt neu erstellen." });
      }

      const { iban, bank, clearing, swift, postcheck, hinweis } = req.body;

      if (!iban || !bank) {
        return res.status(400).json({ error: "IBAN und Bank sind Pflichtfelder." });
      }

      const insertSql = `
        INSERT INTO spenden (iban, bank, clearing, swift, postcheck, hinweis) 
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      await pool.query(insertSql, [iban, bank, clearing, swift, postcheck, hinweis]);

      res.status(201).json({ message: "Spendeninformationen gespeichert." });
    } catch (error) {
      console.error("Fehler beim Erstellen der Spendeninfos:", error);
      res.status(500).json({ error: "Fehler beim Erstellen der Spendeninfos." });
    }
  },

  // Den EINEN Datensatz abrufen
  getAll: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM spenden LIMIT 1");

      if (rows.length === 0) {
        return res.status(404).json({ error: "Keine Spendeninfos gefunden." });
      }

      res.json(rows[0]);
    } catch (error) {
      console.error("Fehler beim Abrufen der Spendeninfos:", error);
      res.status(500).json({ error: "Fehler beim Abrufen der Spendeninfos." });
    }
  },

  // Den EINEN Datensatz aktualisieren
  update: async (req, res) => {
    try {
      if (req.user.userType !== "vorstand") {
        return res.status(403).json({ error: "Nur Vorstände dürfen Spendeninfos aktualisieren." });
      }

      const { iban, bank, clearing, swift, postcheck, hinweis } = req.body;
      const [existing] = await pool.query("SELECT * FROM spenden LIMIT 1");

      if (existing.length === 0) {
        return res.status(404).json({ error: "Keine Spendeninfos vorhanden. Bitte zuerst erstellen." });
      }

      const updateSql = `
        UPDATE spenden 
        SET iban=?, bank=?, clearing=?, swift=?, postcheck=?, hinweis=? 
        WHERE id=?
      `;
      await pool.query(updateSql, [
        iban || existing[0].iban,
        bank || existing[0].bank,
        clearing || existing[0].clearing,
        swift || existing[0].swift,
        postcheck || existing[0].postcheck,
        hinweis || existing[0].hinweis,
        existing[0].id,
      ]);

      res.json({ message: "Spendeninfos aktualisiert." });
    } catch (error) {
      console.error("Fehler beim Aktualisieren:", error);
      res.status(500).json({ error: "Fehler beim Aktualisieren der Spendeninfos." });
    }
  },

  // Den EINEN Datensatz löschen
  delete: async (req, res) => {
    try {
      if (req.user.userType !== "vorstand") {
        return res.status(403).json({ error: "Nur Vorstände dürfen Spendeninfos löschen." });
      }

      const [existing] = await pool.query("SELECT * FROM spenden LIMIT 1");
      if (existing.length === 0) {
        return res.status(404).json({ error: "Keine Spendeninfos vorhanden." });
      }

      await pool.query("DELETE FROM spenden WHERE id=?", [existing[0].id]);
      res.json({ message: "Spendeninfos gelöscht." });
    } catch (error) {
      console.error("Fehler beim Löschen:", error);
      res.status(500).json({ error: "Fehler beim Löschen der Spendeninfos." });
    }
  },
};

module.exports = spendenController;
