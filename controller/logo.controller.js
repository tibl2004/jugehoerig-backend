// controllers/logoController.js
const pool = require("../database/index");

const logoController = {

  // GET /api/logo
  getLogo: async (req, res) => {
    try {
      // Logo aus der DB abrufen
      const [logoRows] = await pool.query("SELECT * FROM logos LIMIT 1");
      const logo = logoRows.length > 0 ? logoRows[0].image : null;

      if (!logo) {
        return res.status(404).json({ error: "Kein Logo gefunden." });
      }

      // Logo zurückgeben
      res.json({ logoUrl: logo }); // z.B. { "logoUrl": "https://..." }
    } catch (err) {
      console.error("Fehler beim Abrufen des Logos:", err);
      res.status(500).json({ error: "Fehler beim Abrufen des Logos." });
    }
  },

};

module.exports = logoController;
