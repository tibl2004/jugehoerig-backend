const pool = require('../database/index'); // mysql2/promise pool
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const sharp = require('sharp');

// ------------------ Konfiguration ------------------
const MAIL_USER = 'no-reply.jugehoerig@gmx.ch';

const checkAdminVorstand = (user) =>
  user?.userTypes?.some((role) => ["vorstand", "admin"].includes(role));


const transporter = nodemailer.createTransport({
  host: 'mail.gmx.net',
  port: 587,
  secure: false,
  auth: {
    user: 'no-reply.jugehoerig@gmx.ch',
    pass: 'jugehoerig!1234', // Muss ein GMX-App-Passwort sein
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
  create: async (req, res) => {
    try {

      const { title, sections, send_date } = req.body;

      if (!title || !send_date) return res.status(400).json({ error: 'Titel und Versanddatum sind erforderlich.' });
      if (!Array.isArray(sections) || sections.length === 0) return res.status(400).json({ error: 'Mindestens eine Sektion ist erforderlich.' });

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
        const link = sec.link || '';
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
          'INSERT INTO newsletter_sections (newsletter_id, subtitle, image, text, link) VALUES (?, ?, ?, ?, ?)',
          [newsletterId, subtitle, base64Foto, text, link]
        );
      }

      return res.status(201).json({ message: 'Newsletter erfolgreich erstellt!', newsletterId });
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
            ${logoBase64 ? `<div style="text-align:center; margin-bottom:20px;">
            <img src="${logoBase64}" alt="Logo" style="max-width:200px;" />
          </div>` : ''}            </td>
          </tr>
          <tr>
            <td style="padding: 20px;">
              <h2 style="color:#F59422;">Willkommen im Newsletter!</h2>
              <p>Hallo ${vorname} ${nachname},</p>
              <p>vielen Dank für deine Anmeldung zu unserem Newsletter. Wir freuen uns, dich an Bord zu haben!</p>
              <p>Falls du den Newsletter irgendwann nicht mehr erhalten möchtest, kannst du dich jederzeit abmelden:</p>
              <div style="text-align: center; margin: 20px 0;">
                <a href="https://jugehoerig-backend.onrender.com/api/newsletter/unsubscribe?token=${unsubscribeToken}" 
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


unsubscribe: async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).send(`
        <div style="font-family: Arial, sans-serif; background-color: #f0f4f8; min-height: 100vh; display:flex; justify-content:center; align-items:center; padding:20px;">
          <div style="background:#fff; padding:40px; border-radius:12px; box-shadow:0 12px 25px rgba(0,0,0,0.1); max-width:500px; text-align:center;">
            <h2 style="color:#F59422; margin-bottom:20px;">Fehler bei der Abmeldung</h2>
            <p style="color:#555; line-height:1.6;">Der Abmelde-Link ist ungültig oder fehlt. Bitte überprüfe den Link in deiner E-Mail.</p>
            <a href="https://jugehoerig.ch" style="display:inline-block; margin-top:30px; padding:12px 25px; background:#F59422; color:white; text-decoration:none; border-radius:8px; font-weight:bold;">Zur Startseite</a>
          </div>
        </div>
      `);
    }

    const [subscribers] = await pool.query(
      'SELECT * FROM newsletter_subscribers WHERE unsubscribe_token = ? AND unsubscribed_at IS NULL',
      [token]
    );

    if (!subscribers || subscribers.length === 0) {
      return res.status(404).send(`
        <div style="font-family: Arial, sans-serif; background-color: #f0f4f8; min-height: 100vh; display:flex; justify-content:center; align-items:center; padding:20px;">
          <div style="background:#fff; padding:40px; border-radius:12px; box-shadow:0 12px 25px rgba(0,0,0,0.1); max-width:500px; text-align:center;">
            <h2 style="color:#F59422; margin-bottom:20px;">Abmeldung nicht möglich</h2>
            <p style="color:#555; line-height:1.6;">Dieser Abmelde-Link wurde bereits verwendet oder ist ungültig.</p>
            <a href="https://jugehoerig.ch" style="display:inline-block; margin-top:30px; padding:12px 25px; background:#F59422; color:white; text-decoration:none; border-radius:8px; font-weight:bold;">Zur Startseite</a>
          </div>
        </div>
      `);
    }

    await pool.query(
      'UPDATE newsletter_subscribers SET unsubscribed_at = NOW() WHERE unsubscribe_token = ?',
      [token]
    );

    return res.send(`
      <div style="font-family: Arial, sans-serif; background-color: #f0f4f8; min-height: 100vh; display:flex; justify-content:center; align-items:center; padding:20px;">
        <div style="max-width:550px; width:100%; background:#fff; border-radius:14px; box-shadow:0 12px 25px rgba(0,0,0,0.15); overflow:hidden;">
          <!-- Orangener Header mit Logo -->
          <div style="background:#F59422; padding:30px; text-align:center;">
            ${logoBase64 ? `<img src="${logoBase64}" alt="Jugehörig Logo" style="max-width:180px; margin-bottom:10px; display:block; margin-left:auto; margin-right:auto;">` : ''}
            <h1 style="color:#fff; font-size:28px; margin:0;">Abmeldung erfolgreich</h1>
          </div>
          <!-- Content -->
          <div style="padding:40px 30px; text-align:center; color:#555; line-height:1.6;">
            <p>Du wurdest erfolgreich vom Newsletter abgemeldet. Es tut uns leid, dich gehen zu sehen. Du kannst dich jederzeit wieder anmelden.</p>
            <a href="https://jugehoerig.ch" style="display:inline-block; margin-top:30px; padding:14px 30px; background:#F59422; color:white; text-decoration:none; border-radius:8px; font-weight:bold; box-shadow:0 4px 12px rgba(0,0,0,0.1); transition: all 0.3s;">Zur Startseite</a>
          </div>
        </div>
      </div>
    `);
  } catch (error) {
    console.error('Fehler beim Abmelden vom Newsletter:', error);
    return res.status(500).send(`
      <div style="font-family: Arial, sans-serif; background-color: #f0f4f8; min-height:100vh; display:flex; justify-content:center; align-items:center; padding:20px;">
        <div style="background:#fff; padding:40px; border-radius:12px; box-shadow:0 12px 25px rgba(0,0,0,0.1); max-width:500px; text-align:center;">
          <h2 style="color:#dc3545; margin-bottom:20px;">Serverfehler</h2>
          <p style="color:#555; line-height:1.6;">Beim Abmelden ist ein Fehler aufgetreten. Bitte versuche es später erneut.</p>
          <a href="https://jugehoerig.ch" style="display:inline-block; margin-top:30px; padding:12px 25px; background:#F59422; color:white; text-decoration:none; border-radius:8px; font-weight:bold;">Zur Startseite</a>
        </div>
      </div>
    `);
  }
},
  

  // --- Alle Abonnenten abrufen ---
getAllSubscribers: async (req, res) => {
  try {
    // 🔒 Nur Vorstand/Admin darf Anmeldungen sehen
    if (
      !req.user.userTypes ||
      !Array.isArray(req.user.userTypes) ||
      !req.user.userTypes.some(role => ["vorstand", "admin"].includes(role))
    ) {
      return res.status(403).json({ error: "Nur Vorstände oder Admins dürfen Anmeldungen sehen." });
    }

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
