const pool = require("../database/index");
const nodemailer = require("nodemailer");
const axios = require("axios");

// Mail-Transporter vorbereiten (GMX)
const transporter = nodemailer.createTransport({
  host: "mail.gmx.net",
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: "no.reply-jugehoerig@gmx.net",   // MUSS @gmx.net sein
    pass: "jugehoerig!1234",               // Dein normales GMX Passwort
  },
});

// Verbindung testen
transporter.verify((err, success) => {
  if (err) console.error("SMTP Fehler:", err);
  else console.log("SMTP Verbindung erfolgreich!");
});

const anfrageController = {
  createAnfrage: async (req, res) => {
    const { name, email, nachricht } = req.body;

    if (!name || !email || !nachricht) {
      return res
        .status(400)
        .json({ error: "Name, Email und Nachricht sind Pflichtfelder." });
    }

    try {
      // 1️⃣ Anfrage in DB speichern
      const [result] = await pool.query(
        "INSERT INTO anfragen (name, email, nachricht, erstellt_am) VALUES (?, ?, ?, NOW())",
        [name, email, nachricht]
      );
      const anfrageId = result.insertId;

      // 2️⃣ Logo abrufen
      const logoRes = await axios.get(
        "https://jugehoerig-backend.onrender.com/api/logo"
      );
      const logoUrl = logoRes.data.logoUrl;

      // 3️⃣ Mail an Admin
      const mailAnInfo = {
        from: '"Jugehörig System" <no.reply-jugehoerig@gmx.net>', // Muss identisch mit auth.user sein
        to: "info@jugehoerig.ch",
        subject: `Neue Anfrage von ${name}`,
        replyTo: "info@jugehoerig.ch", // Antworten gehen an deine Hauptadresse
        html: `
          <div style="font-family:Arial,sans-serif; padding:20px; background:#f9f9f9;">
            <div style="max-width:600px; margin:0 auto; background:#fff; border-radius:10px; overflow:hidden;">
              <div style="background:#F59422; padding:20px; text-align:center;">
                <img src="${logoUrl}" alt="Logo" style="height:50px;">
              </div>
              <div style="padding:30px; color:#333;">
                <h2 style="color:#F59422;">Neue Anfrage erhalten</h2>
                <ul>
                  <li><strong>Name:</strong> ${name}</li>
                  <li><strong>Email:</strong> ${email}</li>
                  <li><strong>Nachricht:</strong> ${nachricht}</li>
                </ul>
                <div style="margin-top:20px; text-align:center;">
                  <a href="https://deine-domain.ch/admin/anfragen/${anfrageId}" 
                     style="background:#F59422; color:#fff; padding:12px 25px; border-radius:5px; text-decoration:none;">Anfrage ansehen</a>
                </div>
              </div>
              <div style="background:#f1f1f1; padding:20px; text-align:center; font-size:12px; color:#666;">
                &copy; ${new Date().getFullYear()} Jugehörig
              </div>
            </div>
          </div>
        `,
      };

      // 4️⃣ Mail an Kunde
      const mailAnKunde = {
        from: '"Jugehörig Website" <no.reply-jugehoerig@gmx.net>', // Muss identisch mit auth.user sein
        to: email,
        subject: "Ihre Anfrage wurde erfolgreich eingereicht",
        replyTo: "info@jugehoerig.ch",
        html: `
          <div style="font-family:Arial,sans-serif; padding:20px; background:#f9f9f9;">
            <div style="max-width:600px; margin:0 auto; background:#fff; border-radius:10px; overflow:hidden;">
              <div style="background:#F59422; padding:20px; text-align:center;">
                <img src="${logoUrl}" alt="Logo" style="height:50px;">
              </div>
              <div style="padding:30px; color:#333;">
                <h2 style="color:#F59422;">Hallo ${name},</h2>
                <p>Vielen Dank für Ihre Anfrage! Wir melden uns so schnell wie möglich bei Ihnen.</p>
                <p><strong>Ihre Nachricht:</strong></p>
                <blockquote style="border-left:4px solid #F59422; padding-left:15px; color:#555;">${nachricht}</blockquote>
              </div>
              <div style="background:#f1f1f1; padding:15px; text-align:center; font-size:12px; color:#666;">
                Bitte antworten Sie <strong>nicht</strong> auf diese E-Mail. Für Anliegen schreiben Sie bitte an: <strong>info@jugehoerig.ch</strong>.
              </div>
              <div style="background:#f1f1f1; padding:20px; text-align:center; font-size:12px; color:#666;">
                &copy; ${new Date().getFullYear()} Jugehörig
              </div>
            </div>
          </div>
        `,
      };

      // 5️⃣ E-Mails senden
      await transporter.sendMail(mailAnInfo);
      await transporter.sendMail(mailAnKunde);

      return res.status(201).json({
        message: "Anfrage erfolgreich gespeichert und E-Mails verschickt.",
        anfrageId,
      });
    } catch (err) {
      console.error("Fehler beim Erstellen der Anfrage:", err);
      return res
        .status(500)
        .json({ error: "Fehler beim Verarbeiten der Anfrage." });
    }
  },

  getAnfragen: async (req, res) => {
    try {
      const [rows] = await pool.query(
        "SELECT * FROM anfragen ORDER BY erstellt_am DESC"
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Anfragen." });
    }
  },

  getAnfrageById: async (req, res) => {
    const { id } = req.params;
    try {
      const [rows] = await pool.query("SELECT * FROM anfragen WHERE id=?", [
        id,
      ]);
      if (!rows.length)
        return res.status(404).json({ error: "Anfrage nicht gefunden." });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Anfrage." });
    }
  },
};

module.exports = anfrageController;
