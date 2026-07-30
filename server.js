// ===== Pinnwand-Server mit PostgreSQL-Datenbank =====

require('dotenv').config();      // liest die Datei .env ein

const express = require('express');
const path = require('path');
const { Pool } = require('pg');  // pg = PostgreSQL-Treiber

const app = express();
const PORT = process.env.PORT || 3000;

const FARBEN = ['gelb', 'gruen', 'blau', 'lila'];

// ===== Verbindung zur Datenbank =====
// Die Zugangsdaten stehen in .env, NICHT im Code.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }     // Neon verlangt eine verschlüsselte Verbindung
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// ===== Tabelle anlegen, falls sie noch nicht existiert =====
async function datenbankVorbereiten() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS zettel (
      id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name      TEXT NOT NULL,
      nachricht TEXT NOT NULL,
      farbe     TEXT NOT NULL,
      zeit      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('Datenbank bereit.');
}


// ===== ROUTE 1: Alle Zettel holen =====
app.get('/api/zettel', async function (req, res) {
  try {
    const ergebnis = await pool.query(
      'SELECT id, name, nachricht, farbe, zeit FROM zettel ORDER BY zeit DESC'
    );
    res.json(ergebnis.rows);          // .rows = die gefundenen Zeilen
  } catch (fehler) {
    console.error(fehler);
    res.status(500).json({ fehler: 'Datenbankfehler beim Laden.' });
  }
});


// ===== ROUTE 2: Neuen Zettel anlegen =====
app.post('/api/zettel', async function (req, res) {
  const name = String(req.body.name || '').trim();
  const nachricht = String(req.body.nachricht || '').trim();

  if (name === '' || nachricht === '') {
    return res.status(400).json({ fehler: 'Name und Nachricht sind Pflicht.' });
  }
  if (name.length > 30) {
    return res.status(400).json({ fehler: 'Name ist zu lang (max. 30 Zeichen).' });
  }
  if (nachricht.length > 100) {
    return res.status(400).json({ fehler: 'Nachricht ist zu lang (max. 100 Zeichen).' });
  }

  const farbe = FARBEN[Math.floor(Math.random() * FARBEN.length)];

  try {
    // $1, $2, $3 sind Platzhalter. Die Werte kommen getrennt hinterher.
    // NIEMALS Eingaben direkt in den SQL-Text einbauen!
    const ergebnis = await pool.query(
      'INSERT INTO zettel (name, nachricht, farbe) VALUES ($1, $2, $3) RETURNING *',
      [name, nachricht, farbe]
    );
    res.status(201).json(ergebnis.rows[0]);
  } catch (fehler) {
    console.error(fehler);
    res.status(500).json({ fehler: 'Datenbankfehler beim Speichern.' });
  }
});


// ===== ROUTE 3: Einen Zettel löschen =====
app.delete('/api/zettel/:id', async function (req, res) {
  try {
    const ergebnis = await pool.query(
      'DELETE FROM zettel WHERE id = $1',
      [req.params.id]
    );

    if (ergebnis.rowCount === 0) {
      return res.status(404).json({ fehler: 'Zettel nicht gefunden.' });
    }
    res.json({ ok: true });

  } catch (fehler) {
    // Passiert z.B., wenn die ID keine gültige UUID ist
    return res.status(400).json({ fehler: 'Ungültige ID.' });
  }
});


// ===== ROUTE 4: Alle Zettel löschen =====
app.delete('/api/zettel', async function (req, res) {
  try {
    await pool.query('DELETE FROM zettel');
    res.json({ ok: true });
  } catch (fehler) {
    console.error(fehler);
    res.status(500).json({ fehler: 'Datenbankfehler beim Löschen.' });
  }
});


// ===== Start: erst Tabelle prüfen, dann Server starten =====
datenbankVorbereiten()
  .then(function () {
    app.listen(PORT, function () {
      console.log('Server läuft auf Port ' + PORT);
    });
  })
  .catch(function (fehler) {
    console.error('Keine Verbindung zur Datenbank:', fehler.message);
    process.exit(1);              // Ohne Datenbank macht Starten keinen Sinn
  });
