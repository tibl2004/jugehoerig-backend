const pool = require("../database/index");
const jwt = require("jsonwebtoken");

const youtubelinkController = {
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Kein Token bereitgestellt.' });

    jwt.verify(token, 'secretKey', (err, user) => {
      if (err) return res.status(403).json({ error: 'Ungültiger Token.' });
      req.user = user;
      next();
    });
  },

  createYoutubeLink: async (req, res) => {
    const { youtubelink } = req.body;
    if (!req.user.userTypes?.some(role => ["vorstand","admin"].includes(role)))
      return res.status(403).json({ error: "Nur Vorstand/Admin." });

    if (!youtubelink) return res.status(400).json({ error: "Link angeben." });

    try {
      const [rows] = await pool.query('SELECT * FROM youtube_links LIMIT 1');
      if (rows.length > 0) return res.status(400).json({ error: "Link existiert bereits." });

      await pool.query('INSERT INTO youtube_links (link) VALUES (?)', [youtubelink]);
      res.status(201).json({ message: "Link gespeichert." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Speichern." });
    }
  },

  getYoutubeLink: async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM youtube_links LIMIT 1');
      if (rows.length === 0) return res.status(404).json({ error: "Kein Link vorhanden." });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen." });
    }
  },

  updateYoutubeLink: async (req, res) => {
    const { newLink } = req.body;
    if (!req.user.userTypes?.some(role => ["vorstand","admin"].includes(role)))
      return res.status(403).json({ error: "Nur Vorstand/Admin." });

    if (!newLink) return res.status(400).json({ error: "Neuen Link angeben." });

    try {
      const [rows] = await pool.query('SELECT * FROM youtube_links LIMIT 1');
      if (rows.length === 0) return res.status(400).json({ error: "Kein Link vorhanden." });

      await pool.query('UPDATE youtube_links SET link=? WHERE id=?', [newLink, rows[0].id]);
      res.json({ message: "Link erfolgreich aktualisiert." });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Aktualisieren." });
    }
  }
};

module.exports = youtubelinkController;
