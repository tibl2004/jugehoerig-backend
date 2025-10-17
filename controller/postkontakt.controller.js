const pool = require("../database/index");
const jwt = require("jsonwebtoken");

const checkAdminVorstand = (user) =>
  user?.userTypes?.some((role) => ["vorstand", "admin"].includes(role));

const postKontaktController = {
  // Middleware: Token prüfen
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

  // Eintrag erstellen (nur Vorstand/Admin)
  create: async (req, res) => {
    try {
      if (!checkAdminVorstand(req.user)) return res.status(403).json({ error: "Nur Vorstände/Admins dürfen erstellen." });

      const [existing] = await pool.query("SELECT * FROM post_kontakt LIMIT 1");
      if (existing.length > 0) return res.status(400).json({ error: "Ein Post-Kontakt-Datensatz existiert bereits." });

      const { firma, name, strasse, plz, ort } = req.body;
      if (!firma || !name) return res.status(400).json({ error: "Firma und Name sind Pflichtfelder." });

      await pool.query(
        "INSERT INTO post_kontakt (firma, name, strasse, plz, ort) VALUES (?, ?, ?, ?, ?)",
        [firma, name, strasse, plz, ort]
      );

      res.status(201).json({ message: "Post-Kontakt gespeichert." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Erstellen des Post-Kontakts." });
    }
  },

  // Eintrag abrufen
  getAll: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM post_kontakt LIMIT 1");
      if (rows.length === 0) return res.status(404).json({ error: "Keine Post-Kontaktinfos vorhanden." });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Post-Kontaktinfos." });
    }
  },

  // Eintrag aktualisieren (nur gesendete Felder)
  update: async (req, res) => {
    try {
      if (!checkAdminVorstand(req.user)) return res.status(403).json({ error: "Nur Vorstände/Admins dürfen aktualisieren." });

      const [existing] = await pool.query("SELECT * FROM post_kontakt LIMIT 1");
      if (existing.length === 0) return res.status(404).json({ error: "Keine Post-Kontaktinfos vorhanden." });

      const current = existing[0];
      const { firma, name, strasse, plz, ort } = req.body;

      const updatedValues = [
        firma !== undefined ? firma : current.firma,
        name !== undefined ? name : current.name,
        strasse !== undefined ? strasse : current.strasse,
        plz !== undefined ? plz : current.plz,
        ort !== undefined ? ort : current.ort,
        current.id
      ];

      await pool.query(
        "UPDATE post_kontakt SET firma=?, name=?, strasse=?, plz=?, ort=? WHERE id=?",
        updatedValues
      );

      res.json({ message: "Post-Kontakt erfolgreich aktualisiert." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Aktualisieren des Post-Kontakts." });
    }
  },

  // Eintrag löschen
  delete: async (req, res) => {
    try {
      if (!checkAdminVorstand(req.user)) return res.status(403).json({ error: "Nur Vorstände/Admins dürfen löschen." });

      const [existing] = await pool.query("SELECT * FROM post_kontakt LIMIT 1");
      if (existing.length === 0) return res.status(404).json({ error: "Keine Post-Kontaktinfos vorhanden." });

      await pool.query("DELETE FROM post_kontakt WHERE id=?", [existing[0].id]);
      res.json({ message: "Post-Kontakt gelöscht." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Löschen des Post-Kontakts." });
    }
  }
};

module.exports = postKontaktController;
