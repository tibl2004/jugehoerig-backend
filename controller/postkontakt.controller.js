const pool = require("../config/db");

const postKontaktController = {
  getPostKontakt: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM post_kontakt LIMIT 1");
      if (rows.length === 0) {
        return res.status(404).json({ error: "Keine Post-Kontaktinfos gefunden." });
      }
      res.json(rows[0]);
    } catch (error) {
      console.error("Fehler beim Abrufen:", error);
      res.status(500).json({ error: "Fehler beim Abrufen der Post-Kontaktinfos." });
    }
  },

  createPostKontakt: async (req, res) => {
    try {
      const { firma, name, strasse, plz, ort } = req.body;

      if (!firma || !strasse || !plz || !ort) {
        return res.status(400).json({ error: "Pflichtfelder fehlen." });
      }

      await pool.query(
        `INSERT INTO post_kontakt (firma, name, strasse, plz, ort) VALUES (?, ?, ?, ?, ?)`,
        [firma, name, strasse, plz, ort]
      );

      res.status(201).json({ message: "Post-Kontakt gespeichert." });
    } catch (error) {
      console.error("Fehler beim Erstellen:", error);
      res.status(500).json({ error: "Fehler beim Erstellen des Post-Kontakts." });
    }
  },

  updatePostKontakt: async (req, res) => {
    try {
      const { firma, name, strasse, plz, ort } = req.body;
      const [existing] = await pool.query("SELECT * FROM post_kontakt LIMIT 1");

      if (existing.length === 0) {
        return res.status(404).json({ error: "Keine Post-Kontaktinfos vorhanden." });
      }

      await pool.query(
        `UPDATE post_kontakt SET firma=?, name=?, strasse=?, plz=?, ort=? WHERE id=?`,
        [
          firma || existing[0].firma,
          name || existing[0].name,
          strasse || existing[0].strasse,
          plz || existing[0].plz,
          ort || existing[0].ort,
          existing[0].id
        ]
      );

      res.json({ message: "Post-Kontaktinfos aktualisiert." });
    } catch (error) {
      console.error("Fehler beim Aktualisieren:", error);
      res.status(500).json({ error: "Fehler beim Aktualisieren." });
    }
  },

  deletePostKontakt: async (req, res) => {
    try {
      const [existing] = await pool.query("SELECT * FROM post_kontakt LIMIT 1");
      if (existing.length === 0) {
        return res.status(404).json({ error: "Keine Post-Kontaktinfos vorhanden." });
      }

      await pool.query("DELETE FROM post_kontakt WHERE id=?", [existing[0].id]);
      res.json({ message: "Post-Kontaktinfos gelöscht." });
    } catch (error) {
      console.error("Fehler beim Löschen:", error);
      res.status(500).json({ error: "Fehler beim Löschen." });
    }
  }
};

module.exports = postKontaktController;
