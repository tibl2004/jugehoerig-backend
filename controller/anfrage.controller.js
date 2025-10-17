const pool = require("../database/index");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const axios = require("axios");


// ------------------ Mailer Setup ------------------
const MAIL_USER = 'no-reply.jugehoerig@gmx.ch';
const MAIL_PASS = 'jugehoerig!1234'; // GMX-App-Passwort

const transporter = nodemailer.createTransport({
  host: 'mail.gmx.net',
  port: 587,
  secure: false,
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS,
  }
});

transporter.verify((err, success) => {
  if (err) console.error("SMTP Fehler beim GMX Login:", err);
  else console.log("GMX SMTP funktioniert, E-Mails können gesendet werden!");
});

// ------------------ Controller ------------------
const anfrageController = {
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


  createAnfrage: async (req, res) => {
    const { name, email, nachricht } = req.body;
    if (!name || !email || !nachricht) {
      return res.status(400).json({ error: "Name, Email und Nachricht sind Pflichtfelder." });
    }

    try {
      // Anfrage in DB speichern
      const [result] = await pool.query(
        "INSERT INTO anfragen (name, email, nachricht, erstellt_am) VALUES (?, ?, ?, NOW())",
        [name, email, nachricht]
      );
      const anfrageId = result.insertId;

      // Logo Base64 über API abrufen
      let logoBase64 = null;
      try {
        const logoRes = await axios.get("https://jugehoerig-backend.onrender.com/api/logo");
        if (logoRes.data.logoUrl) {
          // Base64 Data-URL für Mail erstellen
          logoBase64 = `data:image/png;base64,${logoRes.data.logoUrl}`;
        }
      } catch (err) {
        console.error("Logo konnte nicht geladen werden:", err.message);
      }

      // Admin-Mail HTML
      const adminMailHTML = `
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; padding:20px; border-radius:8px; background:#f9f9f9; border:1px solid #ddd;">
          ${logoBase64 ? `<div style="text-align:center; margin-bottom:20px;">
            <img src="${logoBase64}" alt="Logo" style="max-width:200px;" />
          </div>` : ''}
          <h2 style="color:#0073e6;">Neue Anfrage eingegangen</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Nachricht:</strong></p>
          <p style="padding:10px; background:#fff; border-radius:5px; border:1px solid #ccc;">${nachricht}</p>
          <p style="font-size:12px; color:#999;">Anfrage-ID: ${anfrageId}</p>
        </div>
      `;

      // Bestätigungsmail HTML
      const userMailHTML = `
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; padding:20px; border-radius:8px; background:#f9f9f9; border:1px solid #ddd;">
          ${logoBase64 ? `<div style="text-align:center; margin-bottom:20px;">
            <img src="${logoBase64}" alt="Logo" style="max-width:150px;" />
          </div>` : ''}
          <h2 style="color:#0073e6;">Vielen Dank für Ihre Anfrage!</h2>
          <p>Hallo ${name},</p>
          <p>Wir haben Ihre Anfrage erfolgreich erhalten und werden uns innerhalb von 24 Stunden bei Ihnen melden.</p>
          <p><strong>Ihre Nachricht:</strong></p>
          <p style="padding:10px; background:#fff; border-radius:5px; border:1px solid #ccc;">${nachricht}</p>
          <p>Bei Fragen kontaktieren Sie uns bitte unter <a href="mailto:info@jugehoerig.ch">info@jugehoerig.ch</a>.</p>
          <p style="margin-top:20px;">Mit freundlichen Grüßen,<br /><strong>Ihr Jugehoerig Team</strong></p>
          <p style="font-size:12px; color:#999;">Anfrage-ID: ${anfrageId}</p>
        </div>
      `;

      // Admin-Mail senden
      await transporter.sendMail({
        from: MAIL_USER,
        to: "info@jugehoerig.ch",
        subject: `Neue Anfrage von ${name}`,
        html: adminMailHTML
      });

      // Bestätigungsmail an Antragsteller
      await transporter.sendMail({
        from: MAIL_USER,
        to: email,
        subject: "Ihre Anfrage bei Jugehoerig wurde empfangen",
        html: userMailHTML
      });

      res.status(201).json({
        message: "Anfrage gespeichert. E-Mail an Info und Bestätigung an Antragsteller gesendet.",
        anfrageId,
      });

    } catch (err) {
      console.error("Fehler beim Erstellen der Anfrage:", err);
      res.status(500).json({ error: "Fehler beim Verarbeiten der Anfrage." });
    }
  },

  getAnfragen: async (req, res) => {
    if (req.user.userType !== "vorstand") return res.status(403).json({ error: "Nur Vorstände dürfen Anfragen ansehen." });
    try {
      const [rows] = await pool.query("SELECT * FROM anfragen ORDER BY erstellt_am DESC");
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Anfragen." });
    }
  },

  getAnfrageById: async (req, res) => {
    if (req.user.userType !== "vorstand") return res.status(403).json({ error: "Nur Vorstände dürfen Anfragen ansehen." });
    const { id } = req.params;
    try {
      const [rows] = await pool.query("SELECT * FROM anfragen WHERE id = ?", [id]);
      if (!rows.length) return res.status(404).json({ error: "Anfrage nicht gefunden." });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Anfrage." });
    }
  },
};

module.exports = anfrageController;
