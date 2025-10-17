const pool = require("../database/index");
const jwt = require("jsonwebtoken");

const linksController = {
  // 🔐 Token prüfen
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Kein Token bereitgestellt." });

    jwt.verify(token, process.env.JWT_SECRET || "secretKey", (err, user) => {
      if (err) {
        console.error("Token Überprüfung fehlgeschlagen:", err);
        return res.status(403).json({ error: "Ungültiger Token." });
      }
      req.user = user;
      next();
    });
  },

// 🆕 Neue Section + Links erstellen
createSectionWithLinks: async (req, res) => {
  try {
           // 🔒 Nur Vorstand/Admin darf Anmeldungen sehen
           if (
            !req.user.userTypes ||
            !Array.isArray(req.user.userTypes) ||
            !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))
          ) {
            return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen Anmeldungen sehen." });
          }

    const { subtitle, links } = req.body;

    if (!subtitle) {
      return res.status(400).json({ error: "Untertitel muss angegeben werden." });
    }

    const [sectionResult] = await pool.query(
      "INSERT INTO content_sections (subtitle) VALUES (?)",
      [subtitle]
    );
    const sectionId = sectionResult.insertId;

    if (Array.isArray(links) && links.length > 0) {
      const linkValues = links.map((link) => [sectionId, link.text, link.url]);
      await pool.query(
        "INSERT INTO content_links (section_id, link_text, link_url) VALUES ?",
        [linkValues]
      );
    }

    res.status(201).json({ message: "Section erfolgreich erstellt.", sectionId });
  } catch (error) {
    console.error("Fehler beim Erstellen der Section:", error);
    res.status(500).json({ error: "Fehler beim Erstellen der Section." });
  }
},


  // 📋 Alle Sections + Links abrufen
  getAllSectionsWithLinks: async (req, res) => {
    try {
      const [sections] = await pool.query("SELECT * FROM content_sections ORDER BY id ASC");
      const [links] = await pool.query("SELECT * FROM content_links ORDER BY id ASC");

      const result = sections.map((section) => ({
        id: section.id,
        subtitle: section.subtitle,
        links: links
          .filter((l) => l.section_id === section.id)
          .map((l) => ({ id: l.id, text: l.link_text, url: l.link_url, position: l.position })),
      }));

      res.json(result);
    } catch (error) {
      console.error("Fehler beim Abrufen:", error);
      res.status(500).json({ error: "Fehler beim Abrufen der Inhalte." });
    }
  },

  // ✏️ Nur Section bearbeiten (Untertitel ändern)
  updateSectionTitle: async (req, res) => {
    try {
    // 🔒 Nur Vorstand/Admin darf Anmeldungen sehen
    if (
      !req.user.userTypes ||
      !Array.isArray(req.user.userTypes) ||
      !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))
    ) {
      return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen Anmeldungen sehen." });
    }


      const { id } = req.params;
      const { subtitle } = req.body;

      if (!subtitle) {
        return res.status(400).json({ error: "Neuer Untertitel fehlt." });
      }

      const [result] = await pool.query("UPDATE content_sections SET subtitle = ? WHERE id = ?", [subtitle, id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: "Section nicht gefunden." });

      res.json({ message: "Untertitel erfolgreich aktualisiert." });
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Untertitels:", error);
      res.status(500).json({ error: "Fehler beim Aktualisieren des Untertitels." });
    }
  },

  // ➕ Link zu bestehender Section hinzufügen
  addLinkToSection: async (req, res) => {
    try {
   // 🔒 Nur Vorstand/Admin darf Anmeldungen sehen
   if (
    !req.user.userTypes ||
    !Array.isArray(req.user.userTypes) ||
    !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))
  ) {
    return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen Anmeldungen sehen." });
  }

      const { sectionId } = req.params;
      const { text, url } = req.body;

      if (!text || !url) {
        return res.status(400).json({ error: "Text und URL müssen angegeben werden." });
      }

      // Check, ob Section existiert
      const [sectionExists] = await pool.query("SELECT id FROM content_sections WHERE id = ?", [sectionId]);
      if (sectionExists.length === 0) {
        return res.status(404).json({ error: "Section nicht gefunden." });
      }

      await pool.query("INSERT INTO content_links (section_id, link_text, link_url) VALUES (?, ?, ?)", [
        sectionId,
        text,
        url,
      ]);

      res.status(201).json({ message: "Link erfolgreich hinzugefügt." });
    } catch (error) {
      console.error("Fehler beim Hinzufügen des Links:", error);
      res.status(500).json({ error: "Fehler beim Hinzufügen des Links." });
    }
  },

  // ✏️ Einzelnen Link bearbeiten
  updateSingleLink: async (req, res) => {
    try {
    // 🔒 Nur Vorstand/Admin darf Anmeldungen sehen
    if (
      !req.user.userTypes ||
      !Array.isArray(req.user.userTypes) ||
      !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))
    ) {
      return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen Anmeldungen sehen." });
    }


      const { id } = req.params;
      const { text, url } = req.body;

      if (!text || !url) {
        return res.status(400).json({ error: "Text und URL müssen angegeben werden." });
      }

      const [result] = await pool.query(
        "UPDATE content_links SET link_text = ?, link_url = ? WHERE id = ?",
        [text, url, id]
      );

      if (result.affectedRows === 0) return res.status(404).json({ error: "Link nicht gefunden." });

      res.json({ message: "Link erfolgreich aktualisiert." });
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Links:", error);
      res.status(500).json({ error: "Fehler beim Aktualisieren des Links." });
    }
  },
 // 🧩 Section bearbeiten (Titel + Links hinzufügen/ändern/löschen)
 editSectionWithLinks: async (req, res) => {
  try {
// 🔒 Nur Vorstand/Admin darf Anmeldungen sehen
if (
  !req.user.userTypes ||
  !Array.isArray(req.user.userTypes) ||
  !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))
) {
  return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen Anmeldungen sehen." });
}


    const { id } = req.params;
    const { subtitle, links } = req.body;

    // Check Section existiert
    const [sectionExists] = await pool.query("SELECT id FROM content_sections WHERE id = ?", [id]);
    if (sectionExists.length === 0) {
      return res.status(404).json({ error: "Section nicht gefunden." });
    }

    // 🔤 Titel aktualisieren
    if (subtitle) {
      await pool.query("UPDATE content_sections SET subtitle = ? WHERE id = ?", [subtitle, id]);
    }

    // 🔗 Links bearbeiten
    if (Array.isArray(links)) {
      const [existingLinks] = await pool.query("SELECT id FROM content_links WHERE section_id = ?", [id]);
      const existingLinkIds = existingLinks.map((l) => l.id);
      const sentLinkIds = links.filter((l) => l.id).map((l) => l.id);

      // 🗑️ Links löschen, die nicht mehr gesendet wurden
      const toDeleteIds = existingLinkIds.filter((id_) => !sentLinkIds.includes(id_));
      if (toDeleteIds.length > 0) {
        const deleteSql = `DELETE FROM content_links WHERE id IN (${toDeleteIds.map(() => "?").join(",")})`;
        await pool.query(deleteSql, toDeleteIds);
      }

      // 🔁 Vorhandene Links aktualisieren oder neue einfügen
      for (const link of links) {
        if (link.id) {
          await pool.query(
            "UPDATE content_links SET link_text = ?, link_url = ? WHERE id = ?",
            [link.text, link.url, link.id]
          );
        } else if (link.text && link.url) {
          await pool.query(
            "INSERT INTO content_links (section_id, link_text, link_url) VALUES (?, ?, ?)",
            [id, link.text, link.url]
          );
        }
      }
    }

    res.json({ message: "Section und Links erfolgreich aktualisiert." });
  } catch (error) {
    console.error("Fehler beim Bearbeiten der Section:", error);
    res.status(500).json({ error: "Fehler beim Bearbeiten der Section." });
  }
},

// 🧹 Einzelnen Link löschen
deleteLink: async (req, res) => {
  try {
  // 🔒 Nur Vorstand/Admin darf Anmeldungen sehen
  if (
    !req.user.userTypes ||
    !Array.isArray(req.user.userTypes) ||
    !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))
  ) {
    return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen Anmeldungen sehen." });
  }


    const { id } = req.params;
    const [result] = await pool.query("DELETE FROM content_links WHERE id = ?", [id]);

    if (result.affectedRows === 0) return res.status(404).json({ error: "Link nicht gefunden." });

    res.json({ message: "Link erfolgreich gelöscht." });
  } catch (error) {
    console.error("Fehler beim Löschen des Links:", error);
    res.status(500).json({ error: "Fehler beim Löschen des Links." });
  }
},
  // 🔢 Reihenfolge aktualisieren
  reorderLinks: async (req, res) => {
    try {
      const { linkOrder } = req.body;

      if (!Array.isArray(linkOrder) || linkOrder.length === 0) {
        return res.status(400).json({ error: "linkOrder muss ein Array sein." });
      }

      const updates = linkOrder.map((linkId, index) =>
        pool.query("UPDATE content_links SET position = ? WHERE id = ?", [index + 1, linkId])
      );
      await Promise.all(updates);

      res.json({ message: "Reihenfolge erfolgreich aktualisiert." });
    } catch (error) {
      console.error("Fehler beim Aktualisieren der Reihenfolge:", error);
      res.status(500).json({ error: "Fehler beim Aktualisieren der Reihenfolge." });
    }
  },

  // 🗑️ Section löschen (mit Links)
  deleteSection: async (req, res) => {
    try {
// 🔒 Nur Vorstand/Admin darf Anmeldungen sehen
if (
  !req.user.userTypes ||
  !Array.isArray(req.user.userTypes) ||
  !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))
) {
  return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen Anmeldungen sehen." });
}

      const { id } = req.params;
      await pool.query("DELETE FROM content_links WHERE section_id = ?", [id]);
      const [result] = await pool.query("DELETE FROM content_sections WHERE id = ?", [id]);

      if (result.affectedRows === 0) return res.status(404).json({ error: "Section nicht gefunden." });

      res.json({ message: "Section und zugehörige Links gelöscht." });
    } catch (error) {
      console.error("Fehler beim Löschen der Section:", error);
      res.status(500).json({ error: "Fehler beim Löschen der Section." });
    }
  },

  // 🧹 Einzelnen Link löschen
  deleteLink: async (req, res) => {
    try {
// 🔒 Nur Vorstand/Admin darf Anmeldungen sehen
if (
  !req.user.userTypes ||
  !Array.isArray(req.user.userTypes) ||
  !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))
) {
  return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen Anmeldungen sehen." });
}


      const { id } = req.params;
      const [result] = await pool.query("DELETE FROM content_links WHERE id = ?", [id]);

      if (result.affectedRows === 0) return res.status(404).json({ error: "Link nicht gefunden." });

      res.json({ message: "Link gelöscht." });
    } catch (error) {
      console.error("Fehler beim Löschen des Links:", error);
      res.status(500).json({ error: "Fehler beim Löschen des Links." });
    }
  },
};

module.exports = linksController;
