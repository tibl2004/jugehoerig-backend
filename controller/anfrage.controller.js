const pool = require("../database/index");
const jwt = require("jsonwebtoken");

const anfrageController = {
  // Middleware zum Prüfen des Tokens und Setzen von req.user
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Kein Token bereitgestellt." });

    jwt.verify(token, "secretKey", (err, user) => {
      if (err) return res.status(403).json({ error: "Ungültiger Token." });
      req.user = user;
      next();
    });
  },

  // Anfrage erstellen – nur für Vorstände
  createAnfrage: async (req, res) => {
    if (req.user.userType !== "vorstand") {
      return res.status(403).json({ error: "Nur Vorstände dürfen Anfragen erstellen." });
    }

    const { name, email, nachricht } = req.body;
    if (!name || !email || !nachricht) {
      return res.status(400).json({ error: "Name, Email und Nachricht sind Pflichtfelder." });
    }

    try {
      const [result] = await pool.query(
        "INSERT INTO anfragen (name, email, nachricht, erstellt_am) VALUES (?, ?, ?, NOW())",
        [name, email, nachricht]
      );
      const anfrageId = result.insertId;

      res.status(201).json({
        message: "Anfrage erfolgreich gespeichert.",
        anfrageId,
      });
    } catch (err) {
      console.error("Fehler beim Erstellen der Anfrage:", err);
      res.status(500).json({ error: "Fehler beim Verarbeiten der Anfrage." });
    }
  },

  // Alle Anfragen abrufen – nur für Vorstände
  getAnfragen: async (req, res) => {
    if (req.user.userType !== "vorstand") {
      return res.status(403).json({ error: "Nur Vorstände dürfen Anfragen ansehen." });
    }

    try {
      const [rows] = await pool.query(
        "SELECT * FROM anfragen ORDER BY erstellt_am DESC"
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Anfragen." });
    }
  },

  // Einzelne Anfrage abrufen – nur für Vorstände
  getAnfrageById: async (req, res) => {
    if (req.user.userType !== "vorstand") {
      return res.status(403).json({ error: "Nur Vorstände dürfen Anfragen ansehen." });
    }

    const { id } = req.params;
    try {
      const [rows] = await pool.query("SELECT * FROM anfragen WHERE id = ?", [id]);
      if (!rows.length) return res.status(404).json({ error: "Anfrage nicht gefunden." });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Anfrage." });
    }
  },
};

module.exports = anfrageController;
