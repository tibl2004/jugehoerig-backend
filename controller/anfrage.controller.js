const pool = require("../database/index");
const nodemailer = require("nodemailer");

// ✅ Gmail Transporter mit App-Passwort
const transporter = nodemailer.createTransport({
  service: "gmail", // Gmail Shortcut, kein host/port nötig
  auth: {
    user: "info@jugehoerig.ch",
    pass: "DEIN_APP_PASSWORT", // das 16-stellige App-Passwort von Google
  },
  logger: true,   // zeigt Infos in der Konsole
  debug: true,    // zeigt SMTP-Kommunikation in der Konsole
});
const anfrageController = {

    createAnfrage: async (req, res) => {
        const { name, email, nachricht } = req.body;
    
        if (!name || !email || !nachricht) {
          return res.status(400).json({ error: "Name, Email und Nachricht sind Pflichtfelder." });
        }
    
        try {
          // 1️⃣ Anfrage in DB speichern
          const [result] = await pool.query(
            "INSERT INTO anfragen (name, email, nachricht, erstellt_am) VALUES (?, ?, ?, NOW())",
            [name, email, nachricht]
          );      
          const anfrageId = result.insertId;
    
          // 2️⃣ Logo per API abfragen
          const logoRes = await axios.get("https://jugehoerig-backend.onrender.com/api/logo"); // API-Endpunkt anpassen
          const logoUrl = logoRes.data.logoUrl; // z.B. { "logoUrl": "https://..." }
    
          // 3️⃣ Mail an Admin
          const mailAnInfo = {
            from: '"Jugehörig Website" <info@jugehoerig.ch>',
            to: "info@jugehoerig.ch",
            subject: `Neue Anfrage von ${name}`,
            html: `
            <div style="font-family: Arial, sans-serif; background-color:#f9f9f9; padding:20px;">
              <div style="max-width:600px; margin:0 auto; background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 0 10px rgba(0,0,0,0.1);">
                
                <!-- Header mit Logo -->
                <div style="background-color:#F59422; padding:20px; text-align:center;">
                  <img src="${logoUrl}" alt="Jugehörig Logo" style="height:50px;">
                </div>
                
                <!-- Content -->
                <div style="padding:30px; color:#333;">
                  <h2 style="color:#F59422;">Neue Anfrage erhalten</h2>
                  <p>Es wurde eine neue Anfrage eingereicht:</p>
                  <ul>
                    <li><strong>Name:</strong> ${name}</li>
                    <li><strong>Email:</strong> ${email}</li>
                    <li><strong>Nachricht:</strong> ${nachricht}</li>
                  </ul>
    
                  <!-- Button zum Admin-Panel -->
                  <div style="margin-top:20px; text-align:center;">
                    <a href="https://deine-domain.ch/admin/anfragen/${anfrageId}" 
                       style="background-color:#F59422; color:#ffffff; text-decoration:none; padding:12px 25px; border-radius:5px; display:inline-block;">
                       Anfrage ansehen
                    </a>
                  </div>
                </div>
    
                <!-- Footer -->
                <div style="background-color:#f1f1f1; padding:20px; text-align:center; font-size:12px; color:#666;">
                  &copy; ${new Date().getFullYear()} Jugehörig. Alle Rechte vorbehalten.
                </div>
    
              </div>
            </div>
            `,
          };
    
          // 4️⃣ Mail an Kunde
          const mailAnKunde = {
            from: '"Jugehörig Website" <info@jugehoerig.ch>',
            to: email,
            subject: "Ihre Anfrage wurde erfolgreich eingereicht",
            html: `
            <div style="font-family: Arial, sans-serif; background-color:#f9f9f9; padding:20px;">
              <div style="max-width:600px; margin:0 auto; background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 0 10px rgba(0,0,0,0.1);">
                
                <!-- Header mit Logo -->
                <div style="background-color:#F59422; padding:20px; text-align:center;">
                  <img src="${logoUrl}" alt="Jugehörig Logo" style="height:50px;">
                </div>
                
                <!-- Content -->
                <div style="padding:30px; color:#333;">
                  <h2 style="color:#F59422;">Hallo ${name},</h2>
                  <p>vielen Dank für Ihre Anfrage! Wir werden uns so schnell wie möglich bei Ihnen melden.</p>
                  <p><strong>Ihre Nachricht:</strong></p>
                  <blockquote style="border-left:4px solid #F59422; padding-left:15px; color:#555;">${nachricht}</blockquote>
                  <p>Freundliche Grüße,<br>Ihr Jugehörig-Team</p>
                </div>
    
                <!-- Footer -->
                <div style="background-color:#f1f1f1; padding:20px; text-align:center; font-size:12px; color:#666;">
                  &copy; ${new Date().getFullYear()} Jugehörig. Alle Rechte vorbehalten.
                </div>
    
              </div>
            </div>
            `,
          };
    
          // 5️⃣ Mails verschicken
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
