const mysql = require("mysql2");

// Pool erstellen
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DBNAME,
  port: process.env.DB_PORT, // Port falls abweichend
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Verbindung testen
pool.getConnection((err, conn) => {
  if (err) {
    console.error("❌ Fehler bei DB-Verbindung:", err.message);
  } else {
    console.log("✅ Mit Datenbank verbunden");
    conn.release();
  }
});

// Keep-Alive Ping alle 5 Minuten
setInterval(() => {
  pool.query("SELECT 1", (err) => {
    if (err) {
      console.error("⚠️ DB Keep-Alive fehlgeschlagen:", err.message);
    } else {
      console.log("🔄 DB Keep-Alive erfolgreich");
    }
  });
}, 5 * 60 * 1000); // 5 Minuten

module.exports = pool.promise();
