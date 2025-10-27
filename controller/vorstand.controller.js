const pool = require("../database/index");
const jwt = require("jsonwebtoken");
const bcrypt = require('bcrypt'); // Falls noch nicht oben importiert
const sharp = require("sharp");



const vorstandController = {
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Kein Token bereitgestellt.' });

    jwt.verify(token, 'secretKey', (err, user) => {
      if (err) {
        console.error('Token Überprüfung fehlgeschlagen:', err);
        return res.status(403).json({ error: 'Ungültiger Token.' });
      }
      req.user = user;
      next();
    });
  },

  // 🔹 Vorstand erstellen
  createVorstand: async (req, res) => {
    try {
      // 🔒 Nur Vorstand/Admin darf erstellen
      if (
        !req.user?.userTypes ||
        !Array.isArray(req.user.userTypes) ||
        !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))
      ) {
        return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen neue Vorstände erstellen." });
      }

      const {
        geschlecht,
        vorname,
        nachname,
        adresse,
        plz,
        ort,
        benutzername,
        passwort,
        telefon,
        email,
        foto, // Erwartet Base64 mit Prefix
        beschreibung,
        rolle
      } = req.body;

      // 🔸 Pflichtfelder prüfen
      if (
        !geschlecht || !vorname || !nachname || !adresse || !plz || !ort ||
        !benutzername || !passwort || !telefon || !email || !rolle
      ) {
        return res.status(400).json({ error: "Alle Pflichtfelder inklusive Rolle müssen ausgefüllt sein." });
      }

      // 🔸 Benutzername darf nicht doppelt vorkommen
      const [existing] = await pool.query(
        "SELECT id FROM vorstand WHERE benutzername = ?",
        [benutzername]
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: "Benutzername bereits vergeben." });
      }

      // 🔸 Passwort hashen
      const hashedPassword = await bcrypt.hash(passwort, 10);

      // 🔸 Foto prüfen und konvertieren (optional)
      let fotoBase64 = null;
      if (foto) {
        const matches = foto.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return res.status(400).json({ error: "Ungültiges Bildformat. Erwarte Base64 mit data:image/... Prefix." });
        }

        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");

        if (!["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(mimeType)) {
          return res.status(400).json({ error: "Nur PNG, JPEG, JPG oder WEBP erlaubt." });
        }

        const resized = await sharp(buffer).resize(400).png().toBuffer();
        fotoBase64 = resized.toString("base64");
      }

      // 🔸 Eintrag in DB
      await pool.query(
        `INSERT INTO vorstand 
          (geschlecht, vorname, nachname, adresse, plz, ort, benutzername, passwort, telefon, email, foto, beschreibung, rolle)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          geschlecht,
          vorname,
          nachname,
          adresse,
          plz,
          ort,
          benutzername,
          hashedPassword,
          telefon,
          email,
          fotoBase64,
          beschreibung || null,
          rolle
        ]
      );

      res.status(201).json({ message: "Vorstand erfolgreich erstellt." });
    } catch (error) {
      console.error("❌ Fehler beim Erstellen des Vorstands:", error);
      res.status(500).json({ error: "Fehler beim Erstellen des Vorstands." });
    }
  },



  getVorstand: async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT vorname, nachname, foto, rolle, beschreibung FROM vorstand`
      );

      const result = rows.map(v => ({
        vorname: v.vorname,
        nachname: v.nachname,
        rolle: v.rolle,
        beschreibung: v.beschreibung,
        foto: v.foto || null // Foto ist vollständiger Base64-String
      }));

      res.status(200).json(result);
    } catch (error) {
      console.error("Fehler beim Abrufen des Vorstands:", error);
      res.status(500).json({ error: "Fehler beim Abrufen des Vorstands." });
    }
  },

  getVorstandLogins: async (req, res) => {
    try {
      // Optional: Zugriff nur für bestimmte Benutzer prüfen
      if (!req.user.userTypes?.includes("vorstand")) {
        return res.status(403).json({ error: "Zugriff verweigert." });
      }
  
      // Vorstands-Logins abrufen
      const [rows] = await pool.query(
        `SELECT benutzername, vorname, nachname FROM vorstand`
      );
  
      const result = rows.map(v => ({
        benutzername: v.benutzername,
        vorname: v.vorname,
        nachname: v.nachname
      }));
  
      res.status(200).json(result);
    } catch (error) {
      console.error("Fehler beim Abrufen der Vorstands-Logins:", error);
      res.status(500).json({ error: "Fehler beim Abrufen der Vorstands-Logins." });
    }
  },

  
  

  getVorstandFotos: async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT vorname, nachname, foto FROM vorstand`
      );

      const result = rows.map(v => ({
        vorname: v.vorname,
        nachname: v.nachname,
        foto: v.foto || null // Base64-String oder null
      }));

      res.status(200).json(result);
    } catch (error) {
      console.error("Fehler beim Abrufen der Vorstand-Fotos:", error);
      res.status(500).json({ error: "Fehler beim Abrufen der Vorstand-Fotos." });
    }
  },



  getMyProfile: async (req, res) => {
    try {
      const { id, benutzername, userType } = req.user;
  
      // 1. Prüfen, ob der User im Vorstand ist (egal ob vorstand oder nicht)
      const [rows] = await pool.query(
        `SELECT id, vorname, nachname, adresse, plz, ort, telefon, email, beschreibung, benutzername, foto 
         FROM vorstand WHERE id = ? OR benutzername = ?`,
        [id, benutzername]
      );
  
      if (rows.length > 0) {
        const v = rows[0];
        return res.status(200).json({
          id: v.id,
          vorname: v.vorname,
          nachname: v.nachname,
          adresse: v.adresse,
          plz: v.plz,
          ort: v.ort,
          telefon: v.telefon,
          email: v.email,
          beschreibung: v.beschreibung,
          benutzername: v.benutzername,
          foto: v.foto || null,
          istImVorstand: true
        });
      }
  
      // 2. Kein Vorstandseintrag — trotzdem Profil des Users zurückgeben
      // Hier ggf. weitere Daten aus anderer Tabelle (z.B. vorstands, mitarbeiter) holen
      // Beispiel: Tabelle 'vorstands' abfragen
      if (userType === 'vorstand') {
        const [vorstandRows] = await pool.query(
          `SELECT id, benutzername, email, foto FROM vorstands WHERE id = ? OR benutzername = ?`,
          [id, benutzername]
        );
        if (vorstandRows.length > 0) {
          const a = vorstandRows[0];
          return res.status(200).json({
            id: a.id,
            benutzername: a.benutzername,
            email: a.email,
            foto: a.foto || null,
            istImVorstand: false
          });
        }
      }
  
      // Wenn kein Eintrag in Vorstand oder vorstands, dann nur Basisdaten zurückgeben
      return res.status(200).json({
        id,
        benutzername,
        istImVorstand: false,
        message: "Benutzerprofil (Basisdaten)."
      });
  
    } catch (error) {
      console.error('Fehler beim Abrufen des Profils:', error);
      res.status(500).json({ error: 'Fehler beim Abrufen des Profils.' });
    }
  },
  

  updateMyProfile: async (req, res) => {
    try {
      const id = req.user.id;
      const {
        vorname,
        nachname,
        adresse,
        plz,
        ort,
        telefon,
        email,
        beschreibung,
        benutzername,
      } = req.body;

      let fotoBase64 = null;

      // Wenn ein Bild über FormData hochgeladen wird (req.file)
      if (req.file && req.file.buffer) {
        const pngBuffer = await sharp(req.file.buffer).resize(400).png().toBuffer();
        fotoBase64 = pngBuffer.toString("base64"); // Nur der reine Base64-String
      }

      let sql = `
        UPDATE vorstand SET 
          vorname = ?, nachname = ?, adresse = ?, plz = ?, ort = ?, 
          telefon = ?, email = ?, beschreibung = ?, benutzername = ?`;

      const params = [
        vorname,
        nachname,
        adresse,
        plz,
        ort,
        telefon,
        email,
        beschreibung,
        benutzername
      ];

      if (fotoBase64) {
        sql += `, foto = ?`;
        params.push(fotoBase64); // Nur der Base64-Inhalt ohne Präfix
      }

      sql += ` WHERE id = ?`;
      params.push(id);

      await pool.query(sql, params);
      res.status(200).json({ message: "Profil erfolgreich aktualisiert (nur Bildinhalt gespeichert)." });
    } catch (error) {
      console.error("Fehler beim Aktualisieren:", error.message);
      res.status(500).json({ error: "Profil konnte nicht aktualisiert werden." });
    }
  },

  changePasswordByvorstand: async (req, res) => {
    try {
      const userType = req.user.userType;
      if (userType !== 'vorstand') {
        return res.status(403).json({ error: "Nur vorstands dürfen Passwörter ändern." });
      }

      const { id, neuesPasswort } = req.body;

      if (!id || !neuesPasswort) {
        return res.status(400).json({ error: "ID und neues Passwort sind erforderlich." });
      }

      const hashedPassword = await bcrypt.hash(neuesPasswort, 10);
      await pool.query(`UPDATE vorstand SET passwort = ? WHERE id = ?`, [hashedPassword, id]);

      res.status(200).json({ message: "Passwort erfolgreich geändert." });
    } catch (error) {
      console.error("Fehler beim Passwort-Ändern:", error);
      res.status(500).json({ error: "Fehler beim Passwort-Ändern." });
    }
  },

  changeMultiplePasswords: async (req, res) => {
    try {
     
      const { updates } = req.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: "Erwarte ein Array von Updates (id + neuesPasswort)." });
      }

      // Überprüfen, ob alle Felder korrekt sind
      for (const update of updates) {
        if (!update.id || !update.neuesPasswort) {
          return res.status(400).json({ error: "Jeder Eintrag muss eine id und ein neuesPasswort enthalten." });
        }
      }

      // Passwörter parallel verschlüsseln und speichern
      const updatePromises = updates.map(async ({ id, neuesPasswort }) => {
        const hashed = await bcrypt.hash(neuesPasswort, 10);
        await pool.query(`UPDATE vorstand SET passwort = ? WHERE id = ?`, [hashed, id]);
      });

      await Promise.all(updatePromises);

      res.status(200).json({ message: "Alle Passwörter wurden erfolgreich geändert." });
    } catch (error) {
      console.error("Fehler beim gleichzeitigen Passwort-Ändern:", error);
      res.status(500).json({ error: "Fehler beim gleichzeitigen Passwort-Ändern." });
    }
  },

};

module.exports = vorstandController;