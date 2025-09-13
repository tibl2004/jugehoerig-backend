const pool = require("../database/index");
const nodemailer = require("nodemailer");

// Nodemailer Transporter konfigurieren (z.B. mit Gmail, SMTP-Server etc.)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", // z.B. smtp.gmail.com
  port: 465, // 465 für SSL oder 587 für TLS
  secure: true, 
  auth: {
    user: "info@jugehoerig.ch",
    pass: 'juge!1234',      // Dein Gmail-App-Passwort, nicht dein normales Passwort
  },
});

const anfrageController = {

  // Neue Anfrage erstellen
  createAnfrage: async (req, res) => {
    const { name, email, nachricht } = req.body;

    if (!name || !email || !nachricht) {
      return res.status(400).json({ error: "Name, Email und Nachricht sind Pflichtfelder." });
    }

    try {
      // 1️⃣ Anfrage in DB speichern
      const [result] = await pool.query(
        "INSERT INTO anfragen (name, email, nachricht, erstellt_am) VALUES (?, ?, ?, ?, NOW())",
        [name, email, nachricht]
      );
      const anfrageId = result.insertId;

      // 2️⃣ Mail an info@jugehoerig.ch
      const mailAnInfo = {
        from: '"Jugehörig Website" <dein-email@example.com>',
        to: "info@jugehoerig.ch",
        subject: `Neue Anfrage von ${name}`,
        html: `
          <p>Es wurde eine neue Anfrage eingereicht:</p>
          <ul>
            <li><strong>Name:</strong> ${name}</li>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Nachricht:</strong> ${nachricht}</li>
          </ul>
        `,
      };

      // 3️⃣ Bestätigungsmail an den Anfragesteller
      const mailAnKunde = {
        from: '"Jugehörig Website" <dein-email@example.com>',
        to: email,
        subject: "Ihre Anfrage wurde erfolgreich eingereicht",
        html: `
          <p>Hallo ${name},</p>
          <p>vielen Dank für Ihre Anfrage! Wir werden uns so schnell wie möglich bei Ihnen melden.</p>
          <p>Ihre Nachricht:</p>
          <blockquote>${nachricht}</blockquote>
          <p>Freundliche Grüße,<br>Ihr Jugehörig-Team</p>
        `,
      };

      // 4️⃣ Mails verschicken
      await transporter.sendMail(mailAnInfo);
      await transporter.sendMail(mailAnKunde);

      return res.status(201).json({ 
        message: "Anfrage erfolgreich gespeichert und E-Mails verschickt.",
        anfrageId
      });

    } catch (err) {
      console.error("Fehler beim Erstellen der Anfrage:", err);
      return res.status(500).json({ error: "Fehler beim Verarbeiten der Anfrage." });
    }
  },

  // Alle Anfragen abrufen
  getAnfragen: async (req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM anfragen ORDER BY erstellt_am DESC");
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Anfragen." });
    }
  },

  // Einzelne Anfrage abrufen
  getAnfrageById: async (req, res) => {
    const { id } = req.params;
    try {
      const [rows] = await pool.query("SELECT * FROM anfragen WHERE id=?", [id]);
      if (rows.length === 0) return res.status(404).json({ error: "Anfrage nicht gefunden." });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Fehler beim Abrufen der Anfrage." });
    }
  },
};

module.exports = anfrageController;
