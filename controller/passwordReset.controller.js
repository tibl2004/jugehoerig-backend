const pool = require("../database"); // mysql2/promise
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");

// ================== KONFIG ==================
const JWT_SECRET = "secretKey"; // MUSS identisch zu authenticateToken sein
const FRONTEND_URL = "https://www.jugehoerig.ch";

const MAIL_USER = "no-reply.jugehoerig@gmx.ch";
const MAIL_PASS = "jugehoerig!1234"; // ⚠️ GMX APP-PASSWORT

// ================== NODEMAILER ==================
const transporter = nodemailer.createTransport({
  host: "mail.gmx.net",
  port: 587,
  secure: false,
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Test beim Start
transporter.verify((err) => {
  if (err) {
    console.error("❌ GMX SMTP Fehler:", err);
  } else {
    console.log("✅ GMX SMTP bereit");
  }
});

// ================== CONTROLLER ==================
const passwordResetController = {

  // 🔹 Passwort vergessen → Reset-Mail
  requestReset: async (req, res) => {
    try {
      const { benutzername } = req.body;

      if (!benutzername) {
        return res.status(400).json({ error: "Benutzername fehlt." });
      }

      // Benutzer suchen
      const [users] = await pool.query(
        "SELECT id, email FROM vorstand WHERE benutzername = ?",
        [benutzername]
      );

      if (users.length === 0) {
        return res.status(404).json({ error: "Benutzer nicht gefunden." });
      }

      const user = users[0];

      // Alte Reset-Tokens löschen
      await pool.query(
        "DELETE FROM password_resets WHERE user_id = ?",
        [user.id]
      );

      // Reset-Token (JWT, gleicher Secret!)
      const resetToken = jwt.sign(
        {
          userId: user.id,
          type: "password_reset",
        },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // Token speichern
      await pool.query(
        `INSERT INTO password_resets (user_id, token, expires_at)
         VALUES (?, ?, ?)`,
        [user.id, resetToken, expiresAt]
      );

      const resetLink = `${FRONTEND_URL}/reset-passwort/${resetToken}`;

      // 📧 Mail senden
      await transporter.sendMail({
        from: `"Vereins Support" <${MAIL_USER}>`,
        to: user.email,
        subject: "🔐 Passwort zurücksetzen",
        html: `
          <h2>Passwort zurücksetzen</h2>
          <p>Hallo,</p>
          <p>du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt.</p>
          <p>
            👉 <a href="${resetLink}">Passwort jetzt zurücksetzen</a>
          </p>
          <p>⏰ Der Link ist 1 Stunde gültig.</p>
          <p>Falls du das nicht warst, ignoriere diese E-Mail.</p>
          <br>
          <p>Grüße<br><strong>Vereinsportal</strong></p>
        `,
      });

      res.json({ message: "Reset-Mail wurde versendet." });

    } catch (err) {
      console.error("❌ requestReset Fehler:", err);
      res.status(500).json({ error: "Reset fehlgeschlagen." });
    }
  },

  // 🔹 Neues Passwort setzen
  resetPassword: async (req, res) => {
    try {
      const { token, neuesPasswort } = req.body;

      if (!token || !neuesPasswort) {
        return res.status(400).json({ error: "Token oder Passwort fehlt." });
      }

      // JWT prüfen (GLEICHER SECRET!)
      const decoded = jwt.verify(token, JWT_SECRET);

      if (decoded.type !== "password_reset") {
        return res.status(403).json({ error: "Falscher Token-Typ." });
      }

      // Token in DB prüfen
      const [rows] = await pool.query(
        `SELECT id, user_id FROM password_resets
         WHERE token = ?
           AND expires_at > NOW()
           AND used = 0`,
        [token]
      );

      if (rows.length === 0) {
        return res.status(400).json({ error: "Token ungültig oder abgelaufen." });
      }

      const reset = rows[0];

      // Passwort hashen
      const hashed = await bcrypt.hash(neuesPasswort, 10);

      // Passwort speichern
      await pool.query(
        `UPDATE vorstand
         SET passwort = ?, passwort_geaendert = 1
         WHERE id = ?`,
        [hashed, reset.user_id]
      );

      // Token entwerten
      await pool.query(
        `UPDATE password_resets SET used = 1 WHERE id = ?`,
        [reset.id]
      );

      res.json({ message: "Passwort erfolgreich geändert." });

    } catch (err) {
      console.error("❌ resetPassword Fehler:", err);
      res.status(500).json({ error: "Passwort-Reset fehlgeschlagen." });
    }
  },
};

module.exports = passwordResetController;
