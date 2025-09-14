const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());

// Limits hochsetzen, damit große Base64-Bilder durchgehen
app.use(express.urlencoded({ limit: "150mb", extended: true }));
app.use(express.json({ limit: "150mb" }));

const linksRouter = require('./routes/links.router');
const loginRouter = require('./routes/login.router');
const vorstandRouter = require('./routes/vorstand.router');
const youtubelinkRouter = require('./routes/youtubelink.router');
const eventRouter = require('./routes/event.router');
const newsletterRouter = require('./routes/newsletter.router');
const impressumRouter = require('./routes/impressum.router');
const homeRouter = require('./routes/home.router');
const blogsRouter = require('./routes/blogs.router');
const spendenRouter = require('./routes/spenden.router');
const anfrageRouter = require('./routes/anfrage.router');

const logoRouter = require('./routes/logo.router');

app.use('/api/links', linksRouter);
app.use('/api/login', loginRouter);
app.use('/api/vorstand', vorstandRouter);
app.use('/api/youtubelink', youtubelinkRouter);
app.use('/api/event', eventRouter);
app.use('/api/newsletter', newsletterRouter);
app.use('/api/impressum', impressumRouter);
app.use('/api/home', homeRouter);
app.use('/api/blogs', blogsRouter);
app.use('/api/spenden', spendenRouter);
app.use('/api/anfrage', anfrageRouter);
app.use('/api/logo', logoRouter);


// Fehlerbehandlung
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Etwas ist schiefgelaufen!');
});

// Server starten
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}....`);
});
