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

  createVorstand: async (req, res) => {
    try {
      // Nur Admin darf Vorstand erstellen
      if (req.user.userType !== 'admin') {
        return res.status(403).json({ error: 'Nur Admins dürfen einen Vorstand erstellen.' });
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
        foto, // Erwartet als vollständiger Base64-String mit Präfix
        beschreibung,
        rolle
      } = req.body;

      if (
        !geschlecht || !vorname || !nachname || !adresse || !plz || !ort ||
        !benutzername || !passwort || !telefon || !email || !rolle
      ) {
        return res.status(400).json({ error: "Alle Pflichtfelder inklusive Rolle müssen ausgefüllt sein." });
      }


      // Falls Foto mitgeliefert wird, prüfe das Format
      let base64Foto = null;
      if (foto) {
        if (!foto.startsWith('data:image/png;base64,')) {
          return res.status(400).json({ error: 'Foto muss als PNG im Base64-Format mit Prefix gesendet werden.' });
        }
        // Optional: Header entfernen, nur wenn du es so wie bei "unterschrift" machen willst
        base64Foto = foto.replace(/^data:image\/png;base64,/, '');
      }

      // Benutzername darf nicht doppelt vorkommen
      const [existingUser] = await pool.query(
        'SELECT id FROM vorstand WHERE benutzername = ?',
        [benutzername]
      );
      if (existingUser.length > 0) {
        return res.status(409).json({ error: 'Benutzername bereits vergeben.' });
      }

      // Passwort verschlüsseln
      const hashedPassword = await bcrypt.hash(passwort, 10);

      // In DB speichern
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
          base64Foto,
          beschreibung || null,
          rolle
        ]
      );

      res.status(201).json({ message: 'Vorstand erfolgreich erstellt.' });
    } catch (error) {
      console.error('Fehler beim Erstellen des Vorstands:', error);
      res.status(500).json({ error: 'Fehler beim Erstellen des Vorstands.' });
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
      const { id, userTypes, benutzername } = req.user;
  
      if (userTypes.includes('admin')) {
        // Prüfe, ob dieser Admin auch im Vorstand ist – per BENUTZERNAME
        const [rows] = await pool.query(
          `SELECT id, vorname, nachname, adresse, plz, ort, telefon, email, beschreibung, benutzername, foto 
           FROM vorstand WHERE benutzername = ?`,
          [benutzername]
        );
  
        // Wenn nicht im Vorstand, gib einfache Admin-Daten oder eine Meldung zurück
        if (rows.length === 0) {
          return res.status(200).json({
            id,
            benutzername,
            istImVorstand: false,
            message: "Admin ist nicht im Vorstand eingetragen."
          });
        }
  
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
  
      if (userTypes.includes('vorstand')) {
        const [rows] = await pool.query(
          `SELECT id, vorname, nachname, adresse, plz, ort, telefon, email, beschreibung, benutzername, foto 
           FROM vorstand WHERE id = ?`,
          [id]
        );
  
        if (rows.length === 0) {
          return res.status(404).json({ error: "Vorstand nicht gefunden." });
        }
  
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
          foto: v.foto || null
        });
      }
  
      return res.status(403).json({ error: "Unbekannter Benutzertyp." });
    } catch (error) {
      console.error("Fehler beim Abrufen des Profils:", error);
      res.status(500).json({ error: "Fehler beim Abrufen des Profils." });
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
  
  changePasswordByAdmin: async (req, res) => {
    try {
      const userType = req.user.userType;
      if (userType !== 'admin') {
        return res.status(403).json({ error: "Nur Admins dürfen Passwörter ändern." });
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
  }
};

module.exports = vorstandController;
