const pool = require("../database/index");
const jwt = require("jsonwebtoken");
const sharp = require("sharp");

const SECRET = process.env.JWT_SECRET || "secretKey";

function isVorstand(req) {
  // Unterstütze sowohl single userType als auch Array userTypes
  const u = req.user || {};
  if (!u) return false;
  if (typeof u.userType === "string") return u.userType === "vorstand" || u.userType === "admin";
  if (Array.isArray(u.userTypes)) return u.userTypes.includes("vorstand") || u.userTypes.includes("admin");
  if (u.role) return u.role === "vorstand" || u.role === "admin";
  return false;
}

const eventController = {
  authenticateToken: (req, res, next) => {
    try {
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1];
      if (!token) return res.status(401).json({ error: "Kein Token bereitgestellt." });

      jwt.verify(token, SECRET, (err, user) => {
        if (err) {
          console.error("JWT Verify Error:", err);
          return res.status(403).json({ error: "Ungültiger Token." });
        }
        req.user = user;
        next();
      });
    } catch (err) {
      console.error("authenticateToken Fehler:", err);
      res.status(500).json({ error: "Fehler bei der Token-Überprüfung." });
    }
  },

  // =================== Events ===================
  createEvent: async (req, res) => {
    let connection;
    try {
      if (!isVorstand(req)) {
        return res.status(403).json({ error: "Nur Vorstand darf ein Event erstellen." });
      }

      const { titel, beschreibung, ort, von, bis, alle, supporter, bildtitel, preise, bild } = req.body;

      if (!titel || !beschreibung || !ort || !von || !bis) {
        return res.status(400).json({ error: "Titel, Beschreibung, Ort, Von und Bis müssen angegeben werden." });
      }

      let base64Bild = null;
      if (bild) {
        // akzeptiere: data:image/png;base64,.... oder other image/* types
        const matches = String(bild).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return res.status(400).json({ error: "Ungültiges Bildformat. Erwartet Base64 mit Prefix (data:...). " });
        }
        const mimeType = matches[1].toLowerCase();
        const allowed = ["image/png","image/jpeg","image/jpg","image/webp"];
        if (!allowed.includes(mimeType)) {
          return res.status(400).json({ error: "Nur PNG, JPEG, JPG oder WEBP erlaubt." });
        }
        const buffer = Buffer.from(matches[2], "base64");
        // Konvertiere zu PNG, speichere als Base64 (ohne data: prefix)
        const pngBuffer = await sharp(buffer).png().toBuffer();
        base64Bild = pngBuffer.toString("base64");
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [eventResult] = await connection.query(
        `INSERT INTO events (titel, beschreibung, ort, von, bis, bild, bildtitel, supporter, alle, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktiv')`,
        [titel, beschreibung, ort, von, bis, base64Bild, bildtitel || null, supporter ? 1 : 0, alle ? 1 : 0]
      );

      const eventId = eventResult.insertId;

      if (Array.isArray(preise) && preise.length > 0) {
        const preisWerte = preise
          .filter(p => p && (p.preisbeschreibung || p.kosten !== undefined) )
          .map(p => [eventId, p.preisbeschreibung || null, p.kosten != null ? p.kosten : 0]);
        if (preisWerte.length > 0) {
          await connection.query(`INSERT INTO event_preise (event_id, preisbeschreibung, kosten) VALUES ?`, [preisWerte]);
        }
      }

      await connection.commit();
      res.status(201).json({ message: "Event erfolgreich erstellt.", eventId });
    } catch (error) {
      console.error("Fehler beim Erstellen des Events:", error);
      if (connection) {
        try { await connection.rollback(); } catch (e) { console.error("Rollback error:", e); }
      }
      res.status(500).json({ error: "Fehler beim Erstellen des Events." });
    } finally {
      if (connection) {
        try { connection.release(); } catch (e) { /* ignore */ }
      }
    }
  },

  getEvents: async (req, res) => {
    try {
      // markiere abgelaufene Events als beendet
      await pool.query(`UPDATE events SET status='beendet' WHERE bis < NOW() AND status='aktiv'`);

      const [rows] = await pool.query(`
        SELECT e.id, e.titel, e.beschreibung, e.ort, e.von, e.bis, e.status, e.bild, e.alle, e.supporter,
               p.id AS preis_id, p.preisbeschreibung, p.kosten
        FROM events e
        LEFT JOIN event_preise p ON e.id = p.event_id
        ORDER BY e.von DESC
      `);

      const grouped = {};
      for (const row of rows) {
        if (!grouped[row.id]) {
          grouped[row.id] = {
            id: row.id,
            titel: row.titel,
            beschreibung: row.beschreibung,
            ort: row.ort,
            von: row.von,
            bis: row.bis,
            status: row.status,
            bild: row.bild ? `data:image/png;base64,${row.bild}` : null,
            alle: !!row.alle,
            supporter: !!row.supporter,
            preise: [],
          };
        }
        if (row.preis_id) {
          grouped[row.id].preise.push({
            id: row.preis_id,
            preisbeschreibung: row.preisbeschreibung,
            kosten: row.kosten,
          });
        }
      }

      res.status(200).json(Object.values(grouped));
    } catch (error) {
      console.error("Fehler beim Abrufen der Events:", error);
      res.status(500).json({ error: "Fehler beim Abrufen der Events." });
    }
  },

  getEventById: async (req, res) => {
    try {
      const eventId = req.params.id;
      await pool.query(`UPDATE events SET status='beendet' WHERE bis < NOW() AND id = ? AND status = 'aktiv'`, [eventId]);

      const [rows] = await pool.query(`
        SELECT e.id, e.titel, e.beschreibung, e.ort, e.von, e.bis, e.status, e.bild, e.alle, e.supporter,
               p.id AS preis_id, p.preisbeschreibung, p.kosten
        FROM events e
        LEFT JOIN event_preise p ON e.id = p.event_id
        WHERE e.id = ?
      `, [eventId]);

      if (!rows.length) return res.status(404).json({ error: "Event nicht gefunden." });

      const first = rows[0];
      const event = {
        id: first.id,
        titel: first.titel,
        beschreibung: first.beschreibung,
        ort: first.ort,
        von: first.von,
        bis: first.bis,
        status: first.status,
        bild: first.bild ? `data:image/png;base64,${first.bild}` : null,
        alle: !!first.alle,
        supporter: !!first.supporter,
        preise: [],
      };

      rows.forEach(r => {
        if (r.preis_id) {
          event.preise.push({
            id: r.preis_id,
            preisbeschreibung: r.preisbeschreibung,
            kosten: r.kosten
          });
        }
      });

      res.status(200).json(event);
    } catch (error) {
      console.error("Fehler beim Abrufen des Events:", error);
      res.status(500).json({ error: "Fehler beim Abrufen des Events." });
    }
  },

  updateEvent: async (req, res) => {
    let connection;
    try {
      if (!isVorstand(req)) {
        return res.status(403).json({ error: "Nur Vorstand darf Events bearbeiten." });
      }

      const eventId = req.params.id;
      const { titel, beschreibung, ort, von, bis, alle, supporter, status, bild, bildtitel } = req.body;

      // Baue dynamisches Update
      const fields = [];
      const params = [];

      if (titel !== undefined) { fields.push("titel = ?"); params.push(titel); }
      if (beschreibung !== undefined) { fields.push("beschreibung = ?"); params.push(beschreibung); }
      if (ort !== undefined) { fields.push("ort = ?"); params.push(ort); }
      if (von !== undefined) { fields.push("von = ?"); params.push(von); }
      if (bis !== undefined) { fields.push("bis = ?"); params.push(bis); }
      if (alle !== undefined) { fields.push("alle = ?"); params.push(alle ? 1 : 0); }
      if (supporter !== undefined) { fields.push("supporter = ?"); params.push(supporter ? 1 : 0); }
      if (status !== undefined) { fields.push("status = ?"); params.push(status); }
      if (bildtitel !== undefined) { fields.push("bildtitel = ?"); params.push(bildtitel); }

      if (bild) {
        const matches = String(bild).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return res.status(400).json({ error: "Ungültiges Bildformat. Erwartet Base64 mit Prefix." });
        }
        const mimeType = matches[1].toLowerCase();
        const allowed = ["image/png","image/jpeg","image/jpg","image/webp"];
        if (!allowed.includes(mimeType)) {
          return res.status(400).json({ error: "Nur PNG, JPEG, JPG oder WEBP erlaubt." });
        }
        const buffer = Buffer.from(matches[2], "base64");
        const pngBuffer = await sharp(buffer).png().toBuffer();
        const base64Img = pngBuffer.toString("base64");
        fields.push("bild = ?");
        params.push(base64Img);
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: "Keine zu aktualisierenden Felder gesendet." });
      }

      params.push(eventId);
      const sql = `UPDATE events SET ${fields.join(", ")} WHERE id = ?`;
      await pool.query(sql, params);

      res.status(200).json({ message: "Event erfolgreich aktualisiert." });
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Events:", error);
      res.status(500).json({ error: "Fehler beim Aktualisieren des Events." });
    } finally {
      if (connection) {
        try { connection.release(); } catch (e) {}
      }
    }
  },

  deleteEvent: async (req, res) => {
    try {
      if (!isVorstand(req)) {
        return res.status(403).json({ error: "Nur Vorstand darf Events löschen." });
      }
      const eventId = req.params.id;
      const [result] = await pool.query(`DELETE FROM events WHERE id = ?`, [eventId]);
      if (result.affectedRows === 0) return res.status(404).json({ error: "Event nicht gefunden." });
      res.status(200).json({ message: "Event erfolgreich gelöscht." });
    } catch (error) {
      console.error("Fehler beim Löschen des Events:", error);
      res.status(500).json({ error: "Fehler beim Löschen des Events." });
    }
  },

  createFormFields: async (req, res) => {
    try {
      if (!isVorstand(req)) {
        return res.status(403).json({ error: "Nur Vorstand darf Formulare erstellen." });
      }

      const { eventId, felder } = req.body;
      if (!eventId || !Array.isArray(felder)) {
        return res.status(400).json({ error: "Event-ID und Felder müssen angegeben werden." });
      }

      // Lösche vorherige Felder (ein Formular pro Event)
      await pool.query(`DELETE FROM event_formulare WHERE event_id = ?`, [eventId]);

      if (felder.length > 0) {
        const werte = felder.map(f => {
          let optionen = null;
          if (f.typ === "select" && Array.isArray(f.optionen)) {
            optionen = JSON.stringify(f.optionen);
          }
          return [
            eventId,
            f.feldname,
            f.typ || "text",
            f.pflicht ? 1 : 0,
            optionen
          ];
        });

        await pool.query(
          `INSERT INTO event_formulare (event_id, feldname, typ, pflicht, optionen) VALUES ?`,
          [werte]
        );
      }

      res.status(201).json({ message: "Formular erfolgreich erstellt. Nur ein Formular pro Event ist erlaubt." });
    } catch (error) {
      console.error("Fehler beim Erstellen des Formulars:", error);
      res.status(500).json({ error: "Fehler beim Erstellen des Formulars." });
    }
  },

  getFormFields: async (req, res) => {
    try {
      const eventId = req.params.id;
      const [felder] = await pool.query(
        `SELECT id, feldname, typ, pflicht, optionen FROM event_formulare WHERE event_id=?`,
        [eventId]
      );

      const result = felder.map(f => ({
        id: f.id,
        feldname: f.feldname,
        typ: f.typ,
        pflicht: !!f.pflicht,
        optionen: f.optionen ? JSON.parse(f.optionen) : []
      }));

      res.status(200).json(result);
    } catch (error) {
      console.error("Fehler beim Laden des Formulars:", error);
      res.status(500).json({ error: "Fehler beim Laden des Formulars." });
    }
  },

  registerForEvent: async (req, res) => {
    try {
      const eventId = req.params.id;
      const { daten } = req.body;

      if (!daten || typeof daten !== "object") {
        return res.status(400).json({ error: "Formulardaten müssen gesendet werden." });
      }

      // Alle Felder des Events laden
      const [felder] = await pool.query(
        `SELECT feldname, pflicht FROM event_formulare WHERE event_id = ?`,
        [eventId]
      );

      // Pflichtfelder prüfen
      for (const feld of felder) {
        if (feld.pflicht && (daten[feld.feldname] === undefined || daten[feld.feldname] === "")) {
          return res.status(400).json({ error: `Pflichtfeld fehlt: ${feld.feldname}` });
        }
      }

      // Anmeldung speichern (daten als JSON)
      await pool.query(
        `INSERT INTO event_anmeldungen (event_id, daten) VALUES (?, ?)`,
        [eventId, JSON.stringify(daten)]
      );

      res.status(201).json({ message: "Anmeldung erfolgreich gespeichert." });
    } catch (error) {
      console.error("Fehler bei der Anmeldung:", error);
      res.status(500).json({ error: "Fehler bei der Anmeldung." });
    }
  },

  getRegistrations: async (req, res) => {
    try {
      if (!isVorstand(req)) {
        return res.status(403).json({ error: "Nur Vorstand darf Anmeldungen sehen." });
      }

      const eventId = req.params.id;
      const [rows] = await pool.query(
        `SELECT id, daten, created_at FROM event_anmeldungen WHERE event_id = ? ORDER BY created_at DESC`,
        [eventId]
      );

      const result = rows.map(r => {
        let datenObj = {};
        try { datenObj = r.daten ? JSON.parse(r.daten) : {}; } catch (e) { datenObj = {}; }
        return {
          id: r.id,
          vorname: datenObj.vorname || null,
          nachname: datenObj.nachname || null,
          daten: datenObj,
          created_at: r.created_at
        };
      });

      res.status(200).json(result);
    } catch (error) {
      console.error("Fehler beim Abrufen der Anmeldungen:", error);
      res.status(500).json({ error: "Fehler beim Abrufen der Anmeldungen." });
    }
  },

  // =================== Nächste Event-ID ===================
  getNextEventId: async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT AUTO_INCREMENT AS nextId
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events'`
      );
      const nextId = rows && rows[0] && rows[0].nextId ? rows[0].nextId : null;
      res.status(200).json({ nextId });
    } catch (error) {
      console.error("Fehler beim Holen der nächsten Event-ID:", error);
      res.status(500).json({ error: "Fehler beim Holen der nächsten Event-ID." });
    }
  }
};

module.exports = eventController;
