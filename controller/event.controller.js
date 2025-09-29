const pool = require("../database/index");
const jwt = require("jsonwebtoken");
const sharp = require("sharp");

const eventController = {
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

  // =================== Events ===================
  createEvent: async (req, res) => {
    let connection;
    try {
      if (!req.user.userTypes?.includes("vorstand")) {
        return res.status(403).json({ error: "Nur Vorstand darf ein Event erstellen." });
      }

      const { titel, beschreibung, ort, von, bis, alle, supporter, bildtitel, preise, bild } = req.body;

      if (!titel || !beschreibung || !ort || !von || !bis) {
        return res.status(400).json({ error: "Titel, Beschreibung, Ort, Von und Bis müssen angegeben werden." });
      }

      let base64Bild = null;
      if (bild) {
        const matches = bild.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return res.status(400).json({ error: "Ungültiges Bildformat. Erwartet Base64 mit Prefix." });
        }
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], "base64");
        if (!["image/png","image/jpeg","image/jpg","image/webp"].includes(mimeType)) {
          return res.status(400).json({ error: "Nur PNG, JPEG, JPG oder WEBP erlaubt." });
        }
        base64Bild = (await sharp(buffer).png().toBuffer()).toString("base64");
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [eventResult] = await connection.query(
        `INSERT INTO events (titel, beschreibung, ort, von, bis, bild, bildtitel, supporter, alle, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktiv')`,
        [titel, beschreibung, ort, von, bis, base64Bild, bildtitel || null, supporter || 0, alle ? 1 : 0]
      );

      const eventId = eventResult.insertId;

      if (Array.isArray(preise) && preise.length > 0) {
        const preisWerte = preise
          .filter(p => p.preisbeschreibung && p.kosten != null)
          .map(p => [eventId, p.preisbeschreibung, p.kosten]);
        if (preisWerte.length > 0) {
          await connection.query(`INSERT INTO event_preise (event_id, preisbeschreibung, kosten) VALUES ?`, [preisWerte]);
        }
      }

      await connection.commit();
      res.status(201).json({ message: "Event erfolgreich erstellt." });
    } catch (error) {
      if (connection) {
        try { await connection.rollback(); } catch {}
        connection.release();
      }
      console.error("Fehler beim Erstellen des Events:", error);
      res.status(500).json({ error: "Fehler beim Erstellen des Events." });
    } finally {
      if (connection) connection.release();
    }
  },

  getEvents: async (req, res) => {
    try {
      await pool.query(`UPDATE events SET status='beendet' WHERE bis<NOW() AND status='aktiv'`);

      const [events] = await pool.query(`
        SELECT e.id, e.titel, e.beschreibung, e.ort, e.von, e.bis, e.status, e.bild, e.alle, e.supporter,
               p.id AS preis_id, p.preisbeschreibung, p.kosten
        FROM events e
        LEFT JOIN event_preise p ON e.id=p.event_id
        ORDER BY e.von DESC
      `);

      const grouped = {};
      for (const row of events) {
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
      await pool.query(`UPDATE events SET status='beendet' WHERE bis<NOW() AND id=? AND status='aktiv'`, [eventId]);

      const [rows] = await pool.query(`
        SELECT e.id, e.titel, e.beschreibung, e.ort, e.von, e.bis, e.status, e.bild, e.alle, e.supporter,
               p.id AS preis_id, p.preisbeschreibung, p.kosten
        FROM events e
        LEFT JOIN event_preise p ON e.id=p.event_id
        WHERE e.id=?
      `, [eventId]);

      if (!rows.length) return res.status(404).json({ error: "Event nicht gefunden." });

      const event = {
        id: rows[0].id,
        titel: rows[0].titel,
        beschreibung: rows[0].beschreibung,
        ort: rows[0].ort,
        von: rows[0].von,
        bis: rows[0].bis,
        status: rows[0].status,
        bild: rows[0].bild ? `data:image/png;base64,${rows[0].bild}` : null,
        alle: !!rows[0].alle,
        supporter: !!rows[0].supporter,
        preise: [],
      };

      rows.forEach(r => {
        if (r.preis_id) event.preise.push({
          id: r.preis_id,
          preisbeschreibung: r.preisbeschreibung,
          kosten: r.kosten
        });
      });

      res.status(200).json(event);
    } catch (error) {
      console.error("Fehler beim Abrufen des Events:", error);
      res.status(500).json({ error: "Fehler beim Abrufen des Events." });
    }
  },

  updateEvent: async (req, res) => {
    try {
      if (!req.user.userTypes?.includes("vorstand")) {
        return res.status(403).json({ error: "Nur Vorstand darf Events bearbeiten." });
      }

      const eventId = req.params.id;
      const { titel, beschreibung, ort, von, bis, alle, supporter, status, bild } = req.body;

      let params = [titel, beschreibung, ort, von, bis, alle ? 1 : 0, supporter ? 1 : 0];
      let sql = `UPDATE events SET titel=?, beschreibung=?, ort=?, von=?, bis=?, alle=?, supporter=?`;

      if (bild) {
        if (!bild.startsWith("data:image/png;base64,")) {
          return res.status(400).json({ error: "Bild muss als PNG im Base64-Format gesendet werden." });
        }
        sql += `, bild=?`;
        params.push(bild.replace(/^data:image\/png;base64,/, ""));
      }

      if (status) {
        sql += `, status=?`;
        params.push(status);
      }

      sql += ` WHERE id=?`;
      params.push(eventId);

      await pool.query(sql, params);
      res.status(200).json({ message: "Event erfolgreich aktualisiert." });
    } catch (error) {
      console.error("Fehler beim Aktualisieren des Events:", error);
      res.status(500).json({ error: "Fehler beim Aktualisieren des Events." });
    }
  },

  deleteEvent: async (req, res) => {
    try {
      if (!req.user.userTypes?.includes("vorstand")) {
        return res.status(403).json({ error: "Nur Vorstand darf Events löschen." });
      }
      const eventId = req.params.id;
      await pool.query(`DELETE FROM events WHERE id=?`, [eventId]);
      res.status(200).json({ message: "Event erfolgreich gelöscht." });
    } catch (error) {
      console.error("Fehler beim Löschen des Events:", error);
      res.status(500).json({ error: "Fehler beim Löschen des Events." });
    }
  },

createFormFields: async (req, res) => {
  try {
    if (!req.user.userTypes?.includes("vorstand")) {
      return res.status(403).json({ error: "Nur Vorstand darf Formulare erstellen." });
    }

    const { eventId, felder } = req.body;
    if (!eventId || !Array.isArray(felder)) {
      return res.status(400).json({ error: "Event-ID und Felder müssen angegeben werden." });
    }

    // ALLE bisherigen Felder für das Event löschen → garantiert 1 Formular pro Event
    await pool.query(`DELETE FROM event_formulare WHERE event_id=?`, [eventId]);

    if (felder.length > 0) {
      const werte = felder.map(f => {
        let optionen = null;
        if (f.typ === "select" && Array.isArray(f.optionen)) {
          optionen = JSON.stringify(f.optionen); // Optionen für Select-Feld speichern
        }

        return [
          eventId,
          f.feldname,
          f.typ || "text",      // z.B. text, number, select, checkbox
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
        `SELECT feldname, pflicht FROM event_formulare WHERE event_id=?`,
        [eventId]
      );
  
      // Pflichtfelder prüfen
      for (const feld of felder) {
        if (feld.pflicht && (daten[feld.feldname] === undefined || daten[feld.feldname] === "")) {
          return res.status(400).json({ error: `Pflichtfeld fehlt: ${feld.feldname}` });
        }
      }
  
      // Anmeldung speichern
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
      if (!req.user.userTypes?.includes("vorstand")) {
        return res.status(403).json({ error: "Nur Vorstand darf Anmeldungen sehen." });
      }

      const eventId = req.params.id;
      const [rows] = await pool.query(
        `SELECT id, vorname, nachname, daten, created_at 
         FROM event_anmeldungen 
         WHERE event_id=? 
         ORDER BY created_at DESC`,
        [eventId]
      );

      const result = rows.map(r => ({
        id: r.id,
        vorname: r.vorname,
        nachname: r.nachname,
        daten: JSON.parse(r.daten || "{}"),
        created_at: r.created_at
      }));

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
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='events'`
      );
      res.status(200).json({ nextId: rows[0].nextId });
    } catch (error) {
      console.error("Fehler beim Holen der nächsten Event-ID:", error);
      res.status(500).json({ error: "Fehler beim Holen der nächsten Event-ID." });
    }
  }
};

module.exports = eventController;
