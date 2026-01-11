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

  createEvent: async (req, res) => {
    let connection;
    try {
       // 🔒 Nur Vorstand/Admin darf Anmeldungen sehen
       if (
        !req.user.userTypes ||
        !Array.isArray(req.user.userTypes) ||
        !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))
      ) {
        return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen Anmeldungen sehen." });
      }

      const { titel, beschreibung, ort, von, bis, alle, bildtitel, preise, bild, felder } = req.body;

      if (!titel || !beschreibung || !ort || !von || !bis) {
        return res.status(400).json({ error: "Titel, Beschreibung, Ort, Von und Bis müssen angegeben werden." });
      }

      let base64Bild = null;
      if (bild) {
        const matches = String(bild).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return res.status(400).json({ error: "Ungültiges Bildformat. Erwartet Base64 mit Prefix." });

        const mimeType = matches[1].toLowerCase();
        const allowed = ["image/png","image/jpeg","image/jpg","image/webp"];
        if (!allowed.includes(mimeType)) return res.status(400).json({ error: "Nur PNG, JPEG, JPG oder WEBP erlaubt." });

        const buffer = Buffer.from(matches[2], "base64");
        const pngBuffer = await sharp(buffer).png().toBuffer();
        base64Bild = pngBuffer.toString("base64");
      }

      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Event erstellen ohne supporter
      const [eventResult] = await connection.query(
        `INSERT INTO events (titel, beschreibung, ort, von, bis, bild, bildtitel, alle, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aktiv')`,
        [titel, beschreibung, ort, von, bis, base64Bild, bildtitel || null, alle ? 1 : 0]
      );
      const eventId = eventResult.insertId;

      // Preise speichern
      if (Array.isArray(preise) && preise.length > 0) {
        const preisWerte = preise
          .filter(p => p && (p.preisbeschreibung || p.kosten !== undefined))
          .map(p => [eventId, p.preisbeschreibung || null, p.kosten != null ? p.kosten : 0]);
        if (preisWerte.length > 0) {
          await connection.query(
            `INSERT INTO event_preise (event_id, preisbeschreibung, kosten) VALUES ?`,
            [preisWerte]
          );
        }
      }

      // Formularfelder speichern
      if (Array.isArray(felder) && felder.length > 0) {
        await connection.query(`DELETE FROM event_formulare WHERE event_id = ?`, [eventId]);
        const validFelder = felder.filter(f => f && f.feldname);
        const werte = validFelder.map(f => {
          let optionen = null;
          if (f.typ === "select" && Array.isArray(f.optionen)) optionen = JSON.stringify(f.optionen);
          return [eventId, f.feldname, f.typ || "text", f.pflicht ? 1 : 0, optionen];
        });
        if (werte.length > 0) {
          await connection.query(
            `INSERT INTO event_formulare (event_id, feldname, typ, pflicht, optionen) VALUES ?`,
            [werte]
          );
        }
      }

      await connection.commit();
      res.status(201).json({ message: "Event + Formular erfolgreich erstellt.", eventId });

    } catch (error) {
      console.error("Fehler beim Erstellen des Events:", error);
      if (connection) try { await connection.rollback(); } catch (e) { console.error("Rollback error:", e); }
      res.status(500).json({ error: "Fehler beim Erstellen des Events." });
    } finally {
      if (connection) try { connection.release(); } catch (e) {}
    }
  },

  getEvents: async (req, res) => {
    try {
      await pool.query(`UPDATE events SET status='beendet' WHERE bis < NOW() AND status='aktiv'`);

      const [rows] = await pool.query(`
        SELECT e.id, e.titel, e.beschreibung, e.ort, e.von, e.bis, e.status, e.bild, e.alle,
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

      const [eventRows] = await pool.query(`
        SELECT e.id, e.titel, e.beschreibung, e.ort, e.von, e.bis, e.status,
               e.bild, e.alle,
               p.id AS preis_id, p.preisbeschreibung, p.kosten
        FROM events e
        LEFT JOIN event_preise p ON e.id = p.event_id
        WHERE e.id = ?
      `, [eventId]);

      if (!eventRows.length) return res.status(404).json({ error: "Event nicht gefunden." });

      const first = eventRows[0];
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
        preise: [],
        formular: []
      };

      eventRows.forEach(r => {
        if (r.preis_id) event.preise.push({ id: r.preis_id, preisbeschreibung: r.preisbeschreibung, kosten: r.kosten });
      });

      const [formRows] = await pool.query(
        `SELECT id, feldname, typ, pflicht, optionen FROM event_formulare WHERE event_id = ?`,
        [eventId]
      );

      if (formRows.length > 0) {
        event.formular = formRows.map(f => ({
          id: f.id,
          feldname: f.feldname,
          typ: f.typ,
          pflicht: !!f.pflicht,
          optionen: f.optionen ? JSON.parse(f.optionen) : null
        }));
      }

      res.status(200).json(event);
    } catch (error) {
      console.error("Fehler beim Abrufen des Events:", error);
      res.status(500).json({ error: "Fehler beim Abrufen des Events." });
    }
  },

  updateEvent: async (req, res) => {
    let connection;
    try {
      if (!req.user.userTypes || !Array.isArray(req.user.userTypes) || 
          !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))) {
        return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen Anmeldungen sehen." });
      }

      const eventId = req.params.id;
      const { titel, beschreibung, ort, von, bis, alle, status, bild, bildtitel, preise, felder } = req.body;

      connection = await pool.getConnection();
      await connection.beginTransaction();

      const fields = [];
      const params = [];

      if (titel !== undefined) { fields.push("titel = ?"); params.push(titel); }
      if (beschreibung !== undefined) { fields.push("beschreibung = ?"); params.push(beschreibung); }
      if (ort !== undefined) { fields.push("ort = ?"); params.push(ort); }
      if (von !== undefined) { fields.push("von = ?"); params.push(von); }
      if (bis !== undefined) { fields.push("bis = ?"); params.push(bis); }
      if (alle !== undefined) { fields.push("alle = ?"); params.push(alle ? 1 : 0); }
      if (status !== undefined) { fields.push("status = ?"); params.push(status); }
      if (bildtitel !== undefined) { fields.push("bildtitel = ?"); params.push(bildtitel); }

      if (bild) {
        const matches = String(bild).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return res.status(400).json({ error: "Ungültiges Bildformat. Erwartet Base64 mit Prefix." });

        const mimeType = matches[1].toLowerCase();
        const allowed = ["image/png","image/jpeg","image/jpg","image/webp"];
        if (!allowed.includes(mimeType)) return res.status(400).json({ error: "Nur PNG, JPEG, JPG oder WEBP erlaubt." });

        const buffer = Buffer.from(matches[2], "base64");
        const pngBuffer = await sharp(buffer).png().toBuffer();
        const base64Img = pngBuffer.toString("base64");
        fields.push("bild = ?");
        params.push(base64Img);
      }

      if (fields.length > 0) {
        params.push(eventId);
        const sql = `UPDATE events SET ${fields.join(", ")} WHERE id = ?`;
        await connection.query(sql, params);
      }

      if (Array.isArray(preise)) {
        await connection.query(`DELETE FROM event_preise WHERE event_id = ?`, [eventId]);
        const validPreise = preise.filter(p => p && (p.preisbeschreibung || p.kosten != null));
        if (validPreise.length > 0) {
          const preisWerte = validPreise.map(p => [eventId, p.preisbeschreibung || null, p.kosten != null ? p.kosten : 0]);
          await connection.query(`INSERT INTO event_preise (event_id, preisbeschreibung, kosten) VALUES ?`, [preisWerte]);
        }
      }

      if (Array.isArray(felder)) {
        await connection.query(`DELETE FROM event_formulare WHERE event_id = ?`, [eventId]);
        const validFelder = felder.filter(f => f && f.feldname);
        const werte = validFelder.map(f => {
          let optionen = null;
          if (f.typ === "select" && Array.isArray(f.optionen)) optionen = JSON.stringify(f.optionen);
          return [eventId, f.feldname, f.typ || "text", f.pflicht ? 1 : 0, optionen];
        });
        if (werte.length > 0) {
          await connection.query(`INSERT INTO event_formulare (event_id, feldname, typ, pflicht, optionen) VALUES ?`, [werte]);
        }
      }

      await connection.commit();
      res.status(200).json({ message: "Event erfolgreich aktualisiert." });

    } catch (error) {
      console.error("Fehler beim Aktualisieren des Events:", error);
      if (connection) try { await connection.rollback(); } catch(e) { console.error("Rollback error:", e); }
      res.status(500).json({ error: "Fehler beim Aktualisieren des Events." });
    } finally {
      if (connection) try { connection.release(); } catch (e) {}
    }
  },

  // 🔹 Event löschen (nur Vorstand/Admin)
  deleteEvent: async (req, res) => {
    try {
      if (!req.user.userTypes || !Array.isArray(req.user.userTypes) || !req.user.userTypes.includes("vorstand")) {
        return res.status(403).json({ error: "Nur Vorstände dürfen Events löschen." });
      }

      const eventId = req.params.id;
      await pool.query(`DELETE FROM event_anmeldungen WHERE event_id = ?`, [eventId]);
      await pool.query(`DELETE FROM event_formulare WHERE event_id = ?`, [eventId]);
      await pool.query(`DELETE FROM events WHERE id = ?`, [eventId]);

      res.status(200).json({ message: "Event erfolgreich gelöscht." });
    } catch (error) {
      console.error("Fehler beim Löschen des Events:", error);
      res.status(500).json({ error: "Fehler beim Löschen des Events." });
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

      const [felder] = await pool.query(
        `SELECT feldname, pflicht FROM event_formulare WHERE event_id = ?`,
        [eventId]
      );

      for (const feld of felder) {
        if (feld.pflicht && (daten[feld.feldname] === undefined || daten[feld.feldname] === "")) {
          return res.status(400).json({ error: `Pflichtfeld fehlt: ${feld.feldname}` });
        }
      }

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
    let connection;
    try {
      // 🔒 Nur Vorstand / Admin
      if (
        !req.user?.userTypes ||
        !req.user.userTypes.some(r => ["vorstand", "admin"].includes(r))
      ) {
        return res.status(403).json({ error: "Keine Berechtigung." });
      }
  
      const eventId = req.params.id;
      connection = await pool.getConnection();
  
      // 🔹 Formularfelder laden
      const [felder] = await connection.query(
        `SELECT feldname 
         FROM event_formulare 
         WHERE event_id = ? 
         ORDER BY id ASC`,
        [eventId]
      );
  
      const feldnamen = felder.map(f => f.feldname);
  
      // 🔹 Anmeldungen laden
      const [rows] = await connection.query(
        `SELECT id, daten, created_at 
         FROM event_anmeldungen 
         WHERE event_id = ? 
         ORDER BY created_at DESC`,
        [eventId]
      );
  
      const registrations = rows.map(row => {
        let parsed = {};
        try {
          parsed = row.daten ? JSON.parse(row.daten) : {};
        } catch {}
  
        // ✅ NUR Formularfelder extrahieren
        const gefilterteDaten = {};
        feldnamen.forEach(name => {
          if (parsed[name] !== undefined) {
            gefilterteDaten[name] = parsed[name];
          }
        });
  
        return {
          id: row.id,
          daten: gefilterteDaten,
          created_at: row.created_at
        };
      });
  
      res.status(200).json({
        felder: feldnamen,
        registrations
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Laden der Anmeldungen." });
    } finally {
      if (connection) connection.release();
    }
  },
  
  
  
  
  

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
  },

  addManualRegistration: async (req, res) => {
    try {
      if (!req.user.userTypes || !Array.isArray(req.user.userTypes) || 
          !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))) {
        return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen manuelle Anmeldungen erstellen." });
      }

      const eventId = req.params.id;
      const { daten } = req.body;

      if (!eventId) return res.status(400).json({ error: "Event-ID fehlt." });
      if (!daten || typeof daten !== "object") return res.status(400).json({ error: "Formulardaten müssen gesendet werden." });

      const [felder] = await pool.query(
        `SELECT feldname, pflicht FROM event_formulare WHERE event_id = ? ORDER BY id ASC`,
        [eventId]
      );

      if (felder.length === 0) return res.status(400).json({ error: "Dieses Event hat keine definierten Formularfelder." });

      for (const feld of felder) {
        if (feld.pflicht && (!daten[feld.feldname] || daten[feld.feldname].toString().trim() === "")) {
          return res.status(400).json({ error: `Pflichtfeld fehlt oder leer: ${feld.feldname}` });
        }
      }

      await pool.query(`INSERT INTO event_anmeldungen (event_id, daten) VALUES (?, ?)`, [eventId, JSON.stringify(daten)]);
      res.status(201).json({ message: "Manuelle Anmeldung erfolgreich hinzugefügt." });
    } catch (error) {
      console.error("Fehler beim Hinzufügen einer manuellen Anmeldung:", error);
      res.status(500).json({ error: "Fehler beim Hinzufügen einer manuellen Anmeldung." });
    }
  },

};

module.exports = eventController;
