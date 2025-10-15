const pool = require('../database/index'); // mysql2/promise pool
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const sharp = require('sharp');

// ------------------ Konfiguration ------------------
const MAIL_USER = 'no-reply.jugehoerig@gmx.ch';

const transporter = nodemailer.createTransport({
  host: 'mail.gmx.net',
  port: 587,          // STARTTLS
  secure: false,      // false = STARTTLS, true = SSL/TLS (Port 465)
  auth: {
    user: 'no-reply.jugehoerig@gmx.ch',   // dein GMX-Login
    pass: 'jugehoerig!1234',        // normales Passwort
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Prüfen, ob SMTP funktioniert
transporter.verify((err, success) => {
  if (err) {
    console.error("SMTP Fehler beim GMX Login:", err);
  } else {
    console.log("GMX SMTP funktioniert, E-Mails können gesendet werden!");
  }
});

// ---------------------------------------------------

const newsletterController = {
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) return res.status(401).json({ error: "Kein Token bereitgestellt." });

    jwt.verify(token, process.env.JWT_SECRET || "secretKey", (err, user) => {
      if (err) {
        console.error("Token Überprüfung fehlgeschlagen:", err);
        return res.status(403).json({ error: "Ungültiger Token." });
      }
      req.user = user;
      next();
    });
  },

  // --- Newsletter erstellen ---
  create: async (req, res) => {
    try {
      const { title, sections, send_date } = req.body;

      if (!title || !send_date) return res.status(400).json({ error: 'title und send_date sind erforderlich.' });
      if (!Array.isArray(sections) || sections.length === 0) return res.status(400).json({ error: 'sections muss ein nicht-leeres Array sein.' });

      // Newsletter Grunddaten speichern
      const [insertResult] = await pool.query(
        'INSERT INTO newsletter (title, send_date) VALUES (?, ?)',
        [title, send_date]
      );
      const newsletterId = insertResult.insertId;

      // Sektionen speichern
      for (const sec of sections) {
        const subtitle = sec.subtitle || '';
        const text = sec.text || '';
        const foto = sec.foto || null;
        let base64Foto = '';

        if (foto) {
          try {
            const matches = foto.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
              const buffer = Buffer.from(matches[2], 'base64');
              const convertedBuffer = await sharp(buffer)
                .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
                .png()
                .toBuffer();
              base64Foto = 'data:image/png;base64,' + convertedBuffer.toString('base64');
            }
          } catch (imgErr) {
            console.warn('Fehler bei Bildverarbeitung:', imgErr.message || imgErr);
          }
        }

        await pool.query(
          'INSERT INTO newsletter_sections (newsletter_id, subtitle, image, text) VALUES (?, ?, ?, ?)',
          [newsletterId, subtitle, base64Foto, text]
        );
      }

      return res.status(201).json({ message: 'Newsletter wurde erfolgreich erstellt!', newsletterId });
    } catch (error) {
      console.error('Fehler beim Erstellen des Newsletters:', error);
      return res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },

  // --- Alle Newsletter abrufen ---
  getAll: async (req, res) => {
    try {
      const [newsletters] = await pool.query('SELECT * FROM newsletter ORDER BY created_at DESC');
      res.json(newsletters);
    } catch (error) {
      console.error('Fehler beim Abrufen der Newsletter:', error);
      res.status(500).json({ error: 'Fehler beim Abrufen der Newsletter' });
    }
  },

  // --- Einzelnen Newsletter abrufen ---
  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const [[newsletter]] = await pool.query('SELECT * FROM newsletter WHERE id = ?', [id]);
      if (!newsletter) return res.status(404).json({ error: 'Newsletter nicht gefunden' });

      const [sections] = await pool.query('SELECT subtitle, image, text FROM newsletter_sections WHERE newsletter_id = ? ORDER BY id ASC', [id]);
      res.json({ newsletter, sections });
    } catch (error) {
      console.error('Fehler beim Abrufen des Newsletters:', error);
      res.status(500).json({ error: 'Fehler beim Abrufen des Newsletters' });
    }
  },

  // --- Subscriber anmelden ---
// --- Subscriber anmelden mit Bestätigungs-E-Mail ---
subscribe: async (req, res) => {
  try {
    const { vorname, nachname, email, newsletter_optin } = req.body;
    if (!vorname || !nachname || !email) return res.status(400).json({ error: 'Vorname, Nachname und E-Mail sind erforderlich' });
    if (newsletter_optin !== true) return res.status(400).json({ error: 'Newsletter-Opt-in muss bestätigt sein' });

    const [[existing]] = await pool.query('SELECT * FROM newsletter_subscribers WHERE email = ?', [email]);
    const unsubscribeToken = crypto.randomBytes(20).toString('hex');

    if (existing) {
      // Reaktivierung
      await pool.query(
        'UPDATE newsletter_subscribers SET unsubscribed_at = NULL, subscribed_at = NOW(), unsubscribe_token = ?, vorname = ?, nachname = ?, newsletter_optin = 1 WHERE email = ?',
        [unsubscribeToken, vorname, nachname, email]
      );
    } else {
      // Neue Anmeldung
      await pool.query(
        'INSERT INTO newsletter_subscribers (vorname, nachname, email, unsubscribe_token, newsletter_optin, subscribed_at) VALUES (?, ?, ?, ?, 1, NOW())',
        [vorname, nachname, email, unsubscribeToken]
      );
    }

    // --- HTML Bestätigungs-Mail ---
    const html = `
      <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <table align="center" width="600" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
          <tr>
            <td align="center" style="background-color: #F59422; padding: 20px;">
              <h1 style="color: #fff; margin: 0;">Jugendverein e.V.</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px;">
              <h2 style="color:#F59422;">Willkommen im Newsletter!</h2>
              <p>Hallo ${vorname} ${nachname},</p>
              <p>vielen Dank für deine Anmeldung zu unserem Newsletter. Wir freuen uns, dich an Bord zu haben!</p>
              <p>Falls du den Newsletter irgendwann nicht mehr erhalten möchtest, kannst du dich jederzeit abmelden:</p>
              <div style="text-align: center; margin: 20px 0;">
                <a href="https://meinverein.de/api/newsletter/unsubscribe?token=${unsubscribeToken}" 
                   style="background: #F59422; color: #fff; text-decoration: none; padding: 12px 18px; border-radius: 5px; display: inline-block;">Jetzt abmelden</a>
              </div>
              <p style="font-size: 12px; color: #999; text-align: center;">© ${new Date().getFullYear()} Jugendverein e.V.</p>
            </td>
          </tr>
        </table>
      </div>
    `;

    // Mail senden
    await transporter.sendMail({
      from: `"Jugendverein" <${MAIL_USER}>`,
      to: email,
      subject: 'Willkommen zu unserem Newsletter!',
      html,
    });

    res.json({ message: 'Newsletter-Anmeldung erfolgreich. Eine Bestätigungs-Mail wurde gesendet.' });
  } catch (error) {
    console.error('Fehler beim Newsletter-Anmelden:', error);
    res.status(500).json({ error: 'Serverfehler bei der Anmeldung' });
  }
},


  // --- Abmelden ---
  unsubscribe: async (req, res) => {
    try {
      const { token } = req.query;
  
      if (!token || typeof token !== 'string') {
        return res.status(400).send('<h3>Fehler: Kein gültiger Abmelde-Token übergeben.</h3>');
      }
  
      const [subscribers] = await pool.query(
        'SELECT * FROM newsletter_subscribers WHERE unsubscribe_token = ? AND unsubscribed_at IS NULL',
        [token]
      );
  
      if (!subscribers || subscribers.length === 0) {
        return res.status(404).send('<h3>Dieser Abmelde-Link ist ungültig oder wurde bereits verwendet.</h3>');
      }
  
      await pool.query(
        'UPDATE newsletter_subscribers SET unsubscribed_at = NOW() WHERE unsubscribe_token = ?',
        [token]
      );
  
      return res.send(`
        <div style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
          <h2>Du wurdest erfolgreich vom Newsletter abgemeldet.</h2>
          <p style="color: gray;">Es tut uns leid, dich gehen zu sehen. Du kannst dich jederzeit wieder anmelden.</p>
          <a href="https://jugehoerig.ch" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#0066cc;color:white;text-decoration:none;border-radius:4px;">Zurück zur Startseite</a>
        </div>
      `);
    } catch (error) {
      console.error('Fehler beim Abmelden vom Newsletter:', error);
      return res.status(500).send('<h3>Serverfehler bei der Newsletter-Abmeldung.</h3>');
    }
  },
  

  // --- Alle Abonnenten abrufen ---
getAllSubscribers: async (req, res) => {
  try {
    // keine JWT-Auth mehr
    const [subscribers] = await pool.query(`
      SELECT 
        id, vorname, nachname, email, subscribed_at, unsubscribed_at,
        CASE WHEN unsubscribed_at IS NULL THEN 'aktiv' ELSE 'inaktiv' END AS status
      FROM newsletter_subscribers
      ORDER BY subscribed_at DESC
    `);
    res.json(subscribers);
  } catch (error) {
    console.error('Fehler beim Abrufen der Abonnenten:', error);
    res.status(500).json({ error: 'Serverfehler beim Abrufen der Abonnenten' });
  }
},

// --- CSV/Array Import von Abonnenten ---
importSubscribers: async (req, res) => {
  try {
    const { subscribers } = req.body;
    if (!Array.isArray(subscribers) || subscribers.length === 0) {
      return res.status(400).json({ error: 'Keine Abonnenten zum Importieren übergeben.' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let importedCount = 0;
      const newSubs = [];

      for (const sub of subscribers) {
        const vorname = (sub.vorname || '').trim();
        const nachname = (sub.nachname || '').trim();
        const email = (sub.email || '').trim().toLowerCase();
        if (!vorname || !nachname || !email) continue;

        const [[existing]] = await connection.query('SELECT * FROM newsletter_subscribers WHERE email = ?', [email]);
        if (existing) {
          if (existing.unsubscribed_at !== null) {
            // reaktivieren
            await connection.query(
              'UPDATE newsletter_subscribers SET unsubscribed_at = NULL, subscribed_at = NOW(), vorname = ?, nachname = ?, newsletter_optin = 1 WHERE email = ?',
              [vorname, nachname, email]
            );
            importedCount++;
          }
        } else {
          const unsubscribeToken = crypto.randomBytes(20).toString('hex');
          newSubs.push([vorname, nachname, email, unsubscribeToken, 1, new Date()]);
          importedCount++;
        }
      }

      if (newSubs.length > 0) {
        await connection.query(
          'INSERT INTO newsletter_subscribers (vorname, nachname, email, unsubscribe_token, newsletter_optin, subscribed_at) VALUES ?',
          [newSubs]
        );
      }

      await connection.commit();
      res.json({ message: `${importedCount} Abonnenten erfolgreich importiert.` });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Fehler beim Importieren der Abonnenten:', error);
    res.status(500).json({ error: 'Serverfehler beim Importieren' });
  }
},

};

module.exports = newsletterController;
