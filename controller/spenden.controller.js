const pool = require("../database/index");
const jwt = require("jsonwebtoken");

const checkAdminVorstand = (user) =>
  user?.userTypes?.some((role) => ["vorstand", "admin"].includes(role));

const spendenController = {
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Kein Token bereitgestellt." });

    jwt.verify(token, "secretKey", (err, user) => {
      if (err) {
        console.error("Token Überprüfung fehlgeschlagen:", err);
        return res.status(403).json({ error: "Ungültiger Token." });
      }
      req.user = user;
      next();
    });
  },

  create: async (req, res) => {
    try {
      if (!checkAdminVorstand(req.user)) {
        return res.status(403).json({ error: "Nur Vorstände/Admins dürfen erstellen." });
      }

      const [existing] = await pool.query("SELECT * FROM spenden LIMIT 1");
      if (existing.length > 0) {
        return res.status(400).json({ error: "Ein Spenden-Datensatz existiert bereits." });
      }

      const { iban, bank, clearing, swift, postcheck, hinweis } = req.body;
      if (!iban || !bank) return res.status(400).json({ error: "IBAN und Bank sind Pflichtfelder." });

      await pool.query(
        "INSERT INTO spenden (iban, bank, clearing, swift, postcheck, hinweis) VALUES (?, ?, ?, ?, ?, ?)",
        [iban, bank, clearing, swift, postcheck, hinweis]
      );

      res.status(201).json({ message: "Spendeninformationen gespeichert." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Fehler beim Erstellen der Spendeninfos." });
    }
  },

  getAll: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM spenden LIMIT 1");
      if (rows.length === 0) return res.status(404).json({ error: "Keine Spendeninfos vorhanden." });
      res.json(rows[0]);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Fehler beim Abrufen der Spendeninfos." });
    }
  },

  update: async (req, res) => {
    try {
      if (!checkAdminVorstand(req.user)) {
        return res.status(403).json({ error: "Nur Vorstände/Admins dürfen aktualisieren." });
      }

      const [existing] = await pool.query("SELECT * FROM spenden LIMIT 1");
      if (existing.length === 0) return res.status(404).json({ error: "Keine Spendeninfos vorhanden." });

      const current = existing[0];
      const { iban, bank, clearing, swift, postcheck, hinweis } = req.body;

      // Nur Felder aktualisieren, die gesendet wurden
      const updatedValues = [
        iban !== undefined ? iban : current.iban,
        bank !== undefined ? bank : current.bank,
        clearing !== undefined ? clearing : current.clearing,
        swift !== undefined ? swift : current.swift,
        postcheck !== undefined ? postcheck : current.postcheck,
        hinweis !== undefined ? hinweis : current.hinweis,
        current.id,
      ];

      await pool.query(
        "UPDATE spenden SET iban=?, bank=?, clearing=?, swift=?, postcheck=?, hinweis=? WHERE id=?",
        updatedValues
      );

      res.json({ message: "Spendeninfos erfolgreich aktualisiert." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Fehler beim Aktualisieren der Spendeninfos." });
    }
  },

  delete: async (req, res) => {
    try {
      if (!checkAdminVorstand(req.user)) {
        return res.status(403).json({ error: "Nur Vorstände/Admins dürfen löschen." });
      }

      const [existing] = await pool.query("SELECT * FROM spenden LIMIT 1");
      if (existing.length === 0) return res.status(404).json({ error: "Keine Spendeninfos vorhanden." });

      await pool.query("DELETE FROM spenden WHERE id=?", [existing[0].id]);
      res.json({ message: "Spendeninfos gelöscht." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Fehler beim Löschen der Spendeninfos." });
    }
  },
};

module.exports = spendenController;
