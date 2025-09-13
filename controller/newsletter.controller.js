const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../database/index');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const crypto = require('crypto'); // Für Token-Generierung
const sharp = require('sharp');

// Mail-Transporter für Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'info@jugehoerig.ch', // Deine Gmail-Adresse
    pass: 'juge!1234',      // Dein Gmail-App-Passwort, nicht dein normales Passwort
  },
});
const newsletterController = {
  // Authentifizierungsmiddleware
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

  create: async (req, res) => {
    try {
      // Nur vorstand darf erstellen
      if (!req.user.userTypes || !req.user.userTypes.includes('vorstand')) {
        return res.status(403).json({ error: 'Nur vorstandistratoren dürfen Newsletter erstellen.' });
      }
  
      const { title, sections, send_date } = req.body;
  
      if (!title || !sections || !send_date) {
        return res.status(400).json({ error: 'title, sections und send_date sind erforderlich.' });
      }
      if (!Array.isArray(sections) || sections.length === 0) {
        return res.status(400).json({ error: 'sections muss ein nicht-leeres Array sein.' });
      }
  
      // Newsletter Grunddaten speichern
      const [result] = await pool.query(
        'INSERT INTO newsletter (title, send_date) VALUES (?, ?)',
        [title, send_date]
      );
      const newsletterId = result.insertId;
  
      // Sections speichern: Foto wird direkt nach Untertitel skaliert und gespeichert, Text danach (oder leer)
      for (const section of sections) {
        const { subtitle, text, foto } = section;
  
        let base64Foto = null;
        if (foto) {
          try {
            // Base64 Validierung mit data:image/... prefix
            const matches = foto.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
              console.warn('Ungültiges Bildformat, wird ignoriert.');
              base64Foto = null;
            } else {
              const mimeType = matches[1];
              const base64Data = matches[2];
  
              if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(mimeType)) {
                console.warn('Nicht erlaubtes Bildformat, wird ignoriert:', mimeType);
                base64Foto = null;
              } else if (base64Data.length < 100) { 
                // zu kurze Base64-Daten = wahrscheinlich kaputt
                console.warn('Base64 Bilddaten zu kurz, wird ignoriert.');
                base64Foto = null;
              } else {
                const buffer = Buffer.from(base64Data, 'base64');
  
                // Bild skalieren auf max 400x400 und als PNG speichern
                const convertedBuffer = await sharp(buffer)
                  .png()
                  .toBuffer();
  
                base64Foto = 'data:image/png;base64,' + convertedBuffer.toString('base64');
              }
            }
          } catch (err) {
            console.warn('Fehler bei Bildverarbeitung, Bild wird ignoriert:', err.message);
            base64Foto = null;
          }
        }
  
        // In DB speichern: subtitle, image, text (Text leer falls nicht vorhanden)
        await pool.query(
          'INSERT INTO newsletter_sections (newsletter_id, subtitle, image, text) VALUES (?, ?, ?, ?)',
          [newsletterId, subtitle, base64Foto || '', text || '']
        );
      }
  
      return res.status(201).json({ message: 'Newsletter wurde erfolgreich erstellt!', newsletterId });
    } catch (error) {
      console.error('Fehler beim Erstellen des Newsletters:', error);
      return res.status(500).json({ error: 'Interner Serverfehler' });
    }
  },
  

  getAllSubscribers: async (req, res) => {
    try {
      // Hier prüfe ich userTypes-Array auf vorstand
      if (!req.user.userTypes || !req.user.userTypes.includes('vorstand')) {
        return res.status(403).json({ error: 'Nur vorstands dürfen Abonnenten einsehen' });
      }

      const [subscribers] = await pool.query(`
        SELECT 
          id, 
          vorname,
          nachname,
          email, 
          subscribed_at, 
          unsubscribed_at,
          CASE 
            WHEN unsubscribed_at IS NULL THEN 'aktiv'
            ELSE 'inaktiv'
          END AS status
        FROM newsletter_subscribers
        ORDER BY subscribed_at DESC
      `);

      res.json(subscribers);
    } catch (error) {
      console.error('Fehler beim Abrufen der Abonnenten:', error);
      res.status(500).json({ error: 'Serverfehler beim Abrufen der Abonnenten' });
    }
  },

  getAll: async (req, res) => {
    try {
      const [newsletters] = await pool.query('SELECT * FROM newsletter ORDER BY created_at DESC');
      res.json(newsletters);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Fehler beim Abrufen der Newsletter' });
    }
  },

  getById: async (req, res) => {
    try {
      const { id } = req.params;
      const [[newsletter]] = await pool.query('SELECT * FROM newsletter WHERE id = ?', [id]);
      if (!newsletter) return res.status(404).json({ error: 'Newsletter nicht gefunden' });

      const [sections] = await pool.query('SELECT subtitle, image, text FROM newsletter_sections WHERE newsletter_id = ?', [id]);

      res.json({ newsletter, sections });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Fehler beim Abrufen des Newsletters' });
    }
  },
  subscribe: async (req, res) => {
    try {
      const { vorname, nachname, email, newsletter_optin } = req.body;
  
      // Pflichtfelder prüfen
      if (!vorname || !nachname || !email) {
        return res.status(400).json({ error: 'Vorname, Nachname und E-Mail sind erforderlich' });
      }
  
      // Checkbox muss TRUE sein
      if (newsletter_optin !== true) {
        return res.status(400).json({ error: 'Newsletter-Opt-in muss bestätigt sein' });
      }
  
      // Einheitliches responsives HTML-Template mit Vereinsfarbe
      const generateNewsletterEmail = (title, message, token) => `
        <div style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial,sans-serif;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f4;">
            <tr>
              <td align="center" style="padding:20px;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:white; border-radius:8px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <tr>
                    <td align="center" style="background:#F59422; padding:20px;">
                      <h1 style="color:white; font-size:24px; margin:0;">Jugendverein e.V.</h1>
                    </td>
                  </tr>
  
                  <!-- Inhalt -->
                  <tr>
                    <td style="padding:20px;">
                      <h2 style="color:#F59422; font-size:20px; margin-top:0;">${title}</h2>
                      <p style="font-size:16px; line-height:1.5; color:#333; margin:0 0 15px 0;">
                        ${message}
                      </p>
                      <p style="font-size:16px; line-height:1.5; color:#333;">
                        Falls du den Newsletter nicht mehr erhalten möchtest, kannst du dich jederzeit hier abmelden:
                      </p>
                      <div style="text-align:center; margin:20px 0;">
                        <a href="https://meinverein.de/api/newsletter/unsubscribe?token=${token}" 
                          style="background:#F59422; color:white; text-decoration:none; padding:12px 18px; border-radius:5px; font-size:16px; display:inline-block;">
                          Jetzt abmelden
                        </a>
                      </div>
                      <p style="font-size:12px; color:#999; text-align:center;">
                        Du erhältst diese E-Mail, weil du dich für den Newsletter angemeldet hast. Falls dies ein Irrtum war, ignoriere bitte diese Nachricht.
                      </p>
                    </td>
                  </tr>
  
                  <!-- Footer -->
                  <tr>
                    <td style="background:#f4f4f4; padding:15px; text-align:center; font-size:12px; color:#777;">
                      © ${new Date().getFullYear()} Jugendverein e.V. – Alle Rechte vorbehalten<br>
                      Musterstraße 123, 12345 Musterstadt
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `;
  
      // Prüfen, ob schon vorhanden
      const [[existing]] = await pool.query(
        'SELECT * FROM newsletter_subscribers WHERE email = ?',
        [email]
      );
  
      if (existing) {
        if (existing.unsubscribed_at === null) {
          return res.status(400).json({ error: 'Diese E-Mail ist bereits angemeldet' });
        } else {
          // Reaktivierung
          const newToken = crypto.randomBytes(20).toString('hex');
          await pool.query(
            'UPDATE newsletter_subscribers SET unsubscribed_at = NULL, subscribed_at = NOW(), unsubscribe_token = ?, vorname = ?, nachname = ?, newsletter_optin = 1 WHERE email = ?',
            [newToken, vorname, nachname, email]
          );
  
          await transporter.sendMail({
            from: '"Jugendverein" <newsletter@jugendverein.de>',
            to: email,
            subject: 'Deine Newsletter-Reaktivierung war erfolgreich',
            html: generateNewsletterEmail(
              'Willkommen zurück!',
              `Hallo ${vorname} ${nachname},<br><br>
               schön, dass du wieder bei uns bist! Ab sofort erhältst du erneut unsere 
               Vereinsnews, Veranstaltungshinweise und spannende Einblicke direkt per E-Mail.<br><br>
               Wir freuen uns, dich wieder als Teil unserer Gemeinschaft zu haben.`,
              newToken
            ),
          });
  
          return res.json({ message: 'Newsletter-Anmeldung reaktiviert' });
        }
      }
  
      // Neue Anmeldung
      const unsubscribeToken = crypto.randomBytes(20).toString('hex');
      await pool.query(
        'INSERT INTO newsletter_subscribers (vorname, nachname, email, unsubscribe_token, newsletter_optin) VALUES (?, ?, ?, ?, 1)',
        [vorname, nachname, email, unsubscribeToken]
      );
  
      await transporter.sendMail({
        from: '"Jugendverein" <newsletter@jugendverein.de>',
        to: email,
        subject: 'Willkommen zu unserem Newsletter!',
        html: generateNewsletterEmail(
          'Willkommen im Jugendverein-Newsletter!',
          `Hallo ${vorname} ${nachname},<br><br>
           vielen Dank für deine Anmeldung zu unserem Newsletter.<br>
           Ab sofort bist du immer bestens informiert über unsere Projekte, 
           Veranstaltungen und exklusive Vereinsaktionen.<br><br>
           Wir freuen uns, dich als Teil unserer Gemeinschaft zu begrüßen.`,
          unsubscribeToken
        ),
      });
  
      res.json({ message: 'Newsletter-Anmeldung erfolgreich' });
  
    } catch (error) {
      console.error('Fehler beim Newsletter-Anmelden:', error);
      res.status(500).json({ error: 'Serverfehler bei der Anmeldung' });
    }
  },
  
  
  unsubscribe: async (req, res) => {
    try {
      const { token } = req.query;

      if (!token) {
        return res.status(400).json({ error: 'Token wird benötigt' });
      }

      const [[subscriber]] = await pool.query(
        'SELECT * FROM newsletter_subscribers WHERE unsubscribe_token = ?',
        [token]
      );

      if (!subscriber) {
        return res.status(404).json({ error: 'Ungültiger Abmelde-Token' });
      }

      if (subscriber.unsubscribed_at !== null) {
        return res.status(400).json({ error: 'Du bist bereits abgemeldet' });
      }

      await pool.query(
        'UPDATE newsletter_subscribers SET unsubscribed_at = NOW() WHERE id = ?',
        [subscriber.id]
      );

      res.json({ message: 'Du wurdest erfolgreich vom Newsletter abgemeldet' });
    } catch (error) {
      console.error('Fehler beim Abmelden:', error);
      res.status(500).json({ error: 'Serverfehler beim Abmelden' });
    }
  },

  sendNewsletter: async (req, res) => {
    try {
      // Nur vorstand darf versenden
      if (!req.user.userTypes || !req.user.userTypes.includes('vorstand')) {
        return res.status(403).json({ error: 'Nur vorstandistratoren dürfen Newsletter versenden.' });
      }

      const { newsletterId } = req.body;
      if (!newsletterId) {
        return res.status(400).json({ error: 'newsletterId ist erforderlich' });
      }

      // Newsletter und Sections laden
      const [[newsletter]] = await pool.query('SELECT * FROM newsletter WHERE id = ?', [newsletterId]);
      if (!newsletter) return res.status(404).json({ error: 'Newsletter nicht gefunden' });

      const [sections] = await pool.query('SELECT subtitle, image, text FROM newsletter_sections WHERE newsletter_id = ?', [newsletterId]);

      // Alle aktiven Abonnenten
      const [subscribers] = await pool.query('SELECT vorname, email FROM newsletter_subscribers WHERE unsubscribed_at IS NULL');

      // Mailtext aufbauen (einfaches HTML)
      let htmlContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h1>${newsletter.title}</h1>
      `;
      for (const sec of sections) {
        htmlContent += `<h2>${sec.subtitle}</h2>`;
        if (sec.image) {
          htmlContent += `<img src="${sec.image}" alt="${sec.subtitle}" style="max-width:400px; height:auto; display:block; margin-bottom:15px;">`;
        }
        if (sec.text) {
          htmlContent += `<p>${sec.text}</p>`;
        }
      }
      htmlContent += `<hr><p>© ${new Date().getFullYear()} Jugendverein</p></div>`;

      // Parallel Mail an alle senden (Achtung: bei großen Listen sollte man evtl. batchen oder Queue verwenden)
      for (const subscriber of subscribers) {
        await transporter.sendMail({
          from: '"Jugendverein" <newsletter@jugendverein.de>',
          to: subscriber.email,
          subject: newsletter.title,
          html: htmlContent.replace(/{{vorname}}/g, subscriber.vorname || ''),
        });
      }

      res.json({ message: 'Newsletter wurde erfolgreich versendet!' });
    } catch (error) {
      console.error('Fehler beim Versenden des Newsletters:', error);
      res.status(500).json({ error: 'Serverfehler beim Versenden des Newsletters' });
    }
  },
  importSubscribers: async (req, res) => {
    try {
      // Kein vorstand-Check mehr, jeder darf importieren
  
      const { subscribers } = req.body;
      if (!Array.isArray(subscribers) || subscribers.length === 0) {
        return res.status(400).json({ error: 'Keine Abonnenten zum Importieren übergeben.' });
      }
  
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
  
        let importedCount = 0;
        let newSubs = [];
  
        for (const sub of subscribers) {
          const { vorname, nachname, email } = sub;
          if (!vorname || !nachname || !email) continue;
  
          const [[existing]] = await connection.query(
            'SELECT * FROM newsletter_subscribers WHERE email = ?',
            [email]
          );
  
          if (existing) {
            if (existing.unsubscribed_at !== null) {
              await connection.query(
                'UPDATE newsletter_subscribers SET unsubscribed_at = NULL, subscribed_at = NOW(), vorname = ?, nachname = ?, newsletter_optin = 1 WHERE email = ?',
                [vorname, nachname, email]
              );
              importedCount++;
            }
          } else {
            const unsubscribeToken = crypto.randomBytes(20).toString('hex');
            newSubs.push([vorname, nachname, email, unsubscribeToken]);
            importedCount++;
          }
        }
  
        if (newSubs.length > 0) {
          await connection.query(
            'INSERT INTO newsletter_subscribers (vorname, nachname, email, unsubscribe_token, newsletter_optin) VALUES ?',
            [newSubs.map(s => [...s, 1])]
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
  }
  
};

module.exports = newsletterController;
