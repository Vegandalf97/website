// ===== Wall of Notes - Server =====

require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

const FARBEN = ['gelb', 'gruen', 'blau', 'lila', 'rot', 'orange', 'tuerkis'];

// ===== Wände =====
// Jeder Monat wird in vier Abschnitte geteilt:
//   1.-7. | 8.-14. | 15.-21. | 22. bis Monatsende
// Der letzte ist je nach Monat 7 bis 10 Tage lang.
const MAX_WAENDE = 4;                    // vier Abschnitte = etwa ein Monat
const ZEITZONE = 'Europe/Berlin';        // Monatswechsel nach deutscher Zeit

// ===== Grenzen =====
const MAX_X = 4000;
const MAX_Y = 4000;
const MAX_ZEICHEN = 500;

// Höchstgröße einer Zeichnung in Zeichen Base64
// (etwa 400 KB Bilddaten)
const MAX_ZEICHNUNG = 550000;

const MIN_BREITE = 150;
const MIN_HOEHE = 90;

// Obergrenzen. Für Textnotizen begrenzt zusätzlich die
// Textlänge (GUARD_*), gemalte Zettel dürfen bis hier hoch.
// Muss zu BILD_MAX_BREITE / BILD_MAX_HOEHE in pinnwand.js
// und zu .notiz.mitZeichnung in style.css passen.
const MAX_BREITE = 700;
const MAX_HOEHE = 700;

const GUARD_BREITE = 300;
const GUARD_HOEHE = 200;
const BREITE_PRO_ZEICHEN = 6;
const HOEHE_PRO_ZEICHEN = 5;

// ===== Konten =====
const NAME_MIN = 3;
const NAME_MAX = 20;
const PASSWORT_MIN = 8;
const PASSWORT_MAX = 100;
const SITZUNG_TAGE = 30;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Zeichnungen kommen als Base64 im Anfragekörper an.
// Der Standardwert von 100 KB reicht dafür nicht.
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());


// ============================================
//  LIVE-VERBINDUNGEN (Server-Sent Events)
// ============================================
let klienten = [];

app.get('/api/ereignisse', function (req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write('retry: 3000\n\n');
  klienten.push(res);

  req.on('close', function () {
    klienten = klienten.filter(function (eintrag) {
      return eintrag !== res;
    });
  });
});


// Schickt ein Ereignis an alle offenen Browser.
// Der Inhalt ist JSON, damit verschiedene Arten von
// Meldungen unterscheidbar sind.
function ereignisSenden(inhalt) {
  const zeile = 'data: ' + JSON.stringify(inhalt) + '\n\n';

  klienten.forEach(function (res) {
    res.write(zeile);
  });
}


function alleBenachrichtigen() {
  ereignisSenden({ typ: 'aktualisiert' });
}


setInterval(function () {
  klienten.forEach(function (res) {
    res.write(': ping\n\n');
  });
}, 25000);


setInterval(function () {
  pool.query('DELETE FROM sitzungen WHERE laeuft_ab < NOW()')
    .catch(function (fehler) {
      console.error('Aufräumen fehlgeschlagen:', fehler.message);
    });
}, 60 * 60 * 1000);


// ===== Tabellen anlegen bzw. erweitern =====
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

  await pool.query(`ALTER TABLE zettel
    ADD COLUMN IF NOT EXISTS x INTEGER NOT NULL DEFAULT floor(random() * 600 + 20)`);
  await pool.query(`ALTER TABLE zettel
    ADD COLUMN IF NOT EXISTS y INTEGER NOT NULL DEFAULT floor(random() * 350 + 20)`);
  await pool.query(`ALTER TABLE zettel
    ADD COLUMN IF NOT EXISTS breite INTEGER NOT NULL DEFAULT 190`);
  await pool.query(`ALTER TABLE zettel
    ADD COLUMN IF NOT EXISTS hoehe INTEGER NOT NULL DEFAULT 130`);
  await pool.query(`ALTER TABLE zettel
    ADD COLUMN IF NOT EXISTS ebene INTEGER NOT NULL DEFAULT 0`);

  // Drehung der Befehlsbilder in Grad (0-359).
  // Ohne diese Spalte stünden die Köpfe nach jedem
  // Neuladen wieder kerzengerade.
  await pool.query(`ALTER TABLE zettel
    ADD COLUMN IF NOT EXISTS winkel INTEGER NOT NULL DEFAULT 0`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS benutzer (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      benutzername  TEXT NOT NULL,
      passwort_hash TEXT NOT NULL,
      erstellt      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS benutzer_name_eindeutig
      ON benutzer (lower(benutzername))
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sitzungen (
      token       TEXT PRIMARY KEY,
      benutzer_id UUID NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
      laeuft_ab   TIMESTAMPTZ NOT NULL
    )
  `);

  await pool.query(`
    ALTER TABLE zettel
      ADD COLUMN IF NOT EXISTS benutzer_id UUID REFERENCES benutzer(id) ON DELETE SET NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS waende (
      id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nummer SERIAL,
      beginn TIMESTAMPTZ NOT NULL,
      ende   TIMESTAMPTZ NOT NULL
    )
  `);

  // ON DELETE CASCADE: verschwindet eine Wand, gehen ihre Notizen mit
  await pool.query(`
    ALTER TABLE zettel
      ADD COLUMN IF NOT EXISTS wand_id UUID REFERENCES waende(id) ON DELETE CASCADE
  `);

  // Gemalte Zettel: das Bild als Base64-Text.
  // Wird bewusst NICHT in der Notizliste mitgeschickt,
  // sondern über eine eigene Adresse geladen.
  await pool.query(`
    ALTER TABLE zettel ADD COLUMN IF NOT EXISTS zeichnung TEXT
  `);

  console.log('Datenbank bereit.');
}


// ============================================
//  Zu welchem Monatsabschnitt gehört ein Zeitpunkt?
//
//  1.-7. | 8.-14. | 15.-21. | 22. bis Monatsende
//
//  Gerechnet wird in deutscher Ortszeit, damit ein
//  Monat auch um Mitternacht deutscher Zeit wechselt
//  und nicht irgendwann nachts nach Serverzeit.
// ============================================
async function abschnittFuer(zeitpunkt) {
  const ergebnis = await pool.query(
    `SELECT (b AT TIME ZONE $2) AS beginn,
            (e AT TIME ZONE $2) AS ende
     FROM (
       SELECT
         monatsanfang + (abschnitt * INTERVAL '7 days') AS b,
         CASE WHEN abschnitt < 3
              THEN monatsanfang + ((abschnitt + 1) * INTERVAL '7 days')
              ELSE monatsanfang + INTERVAL '1 month'
         END AS e
       FROM (
         SELECT
           date_trunc('month', ortszeit) AS monatsanfang,
           LEAST(3, floor((EXTRACT(day FROM ortszeit)::int - 1) / 7))::int AS abschnitt
         FROM (SELECT ($1::timestamptz AT TIME ZONE $2) AS ortszeit) AS t
       ) AS x
     ) AS y`,
    [zeitpunkt, ZEITZONE]
  );

  return ergebnis.rows[0];
}


// ============================================
//  WÄNDE PFLEGEN
// ============================================
async function wandPflegen() {
  const jetzt = await abschnittFuer(new Date());

  let ergebnis = await pool.query(
    'SELECT * FROM waende ORDER BY beginn DESC LIMIT 1'
  );
  let neueste = ergebnis.rows[0];

  // Allererster Start: Wand für den laufenden Abschnitt anlegen
  // und die vorhandenen Notizen hineinlegen
  if (!neueste) {
    neueste = (await pool.query(
      'INSERT INTO waende (beginn, ende) VALUES ($1, $2) RETURNING *',
      [jetzt.beginn, jetzt.ende]
    )).rows[0];

    await pool.query(
      'UPDATE zettel SET wand_id = $1 WHERE wand_id IS NULL',
      [neueste.id]
    );
  }

  // Ist der Abschnitt vorbei, kommt der nächste dazu.
  // Sein Beginn ist genau das Ende des alten - keine Lücken.
  let schutz = 0;

  while (new Date(neueste.ende) <= new Date() && schutz < 100) {
    const naechster = await abschnittFuer(neueste.ende);

    neueste = (await pool.query(
      'INSERT INTO waende (beginn, ende) VALUES ($1, $2) RETURNING *',
      [naechster.beginn, naechster.ende]
    )).rows[0];

    schutz = schutz + 1;
  }

  // Nur die neuesten MAX_WAENDE behalten
  await pool.query(
    `DELETE FROM waende
     WHERE id NOT IN (
       SELECT id FROM waende ORDER BY beginn DESC LIMIT $1
     )`,
    [MAX_WAENDE]
  );

  return neueste;
}


function zahlOderNull(wert, min, max) {
  if (wert === undefined || wert === null || wert === '') {
    return null;
  }

  const zahl = Math.round(Number(wert));

  if (!Number.isFinite(zahl)) {
    return null;
  }
  return Math.min(Math.max(zahl, min), max);
}


// ============================================
//  ANMELDUNG
// ============================================

async function benutzerLaden(req, res, next) {
  req.benutzer = null;

  const token = req.cookies ? req.cookies.sitzung : null;

  if (token) {
    try {
      const ergebnis = await pool.query(
        `SELECT b.id, b.benutzername
         FROM sitzungen s
         JOIN benutzer b ON b.id = s.benutzer_id
         WHERE s.token = $1 AND s.laeuft_ab > NOW()`,
        [token]
      );

      if (ergebnis.rowCount > 0) {
        req.benutzer = ergebnis.rows[0];
      }
    } catch (fehler) {
      console.error('Sitzung konnte nicht geprüft werden:', fehler.message);
    }
  }

  next();
}

app.use(benutzerLaden);
app.use(express.static(path.join(__dirname, 'public')));


async function anmelden(res, req, benutzer) {
  const token = crypto.randomBytes(32).toString('hex');

  await pool.query(
    `INSERT INTO sitzungen (token, benutzer_id, laeuft_ab)
     VALUES ($1, $2, NOW() + ($3 || ' days')::interval)`,
    [token, benutzer.id, String(SITZUNG_TAGE)]
  );

  res.cookie('sitzung', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    maxAge: SITZUNG_TAGE * 24 * 60 * 60 * 1000
  });
}


function namePruefen(name) {
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return 'Der Name muss ' + NAME_MIN + ' bis ' + NAME_MAX + ' Zeichen lang sein.';
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
    return 'Erlaubt sind Buchstaben, Ziffern, Punkt, Bindestrich und Unterstrich.';
  }
  return null;
}


app.get('/api/ich', function (req, res) {
  res.json({
    benutzername: req.benutzer ? req.benutzer.benutzername : null
  });
});


app.post('/api/registrieren', async function (req, res) {
  const name = String(req.body.benutzername || '').trim();
  const passwort = String(req.body.passwort || '');

  const namensFehler = namePruefen(name);
  if (namensFehler) {
    return res.status(400).json({ fehler: namensFehler });
  }
  if (passwort.length < PASSWORT_MIN || passwort.length > PASSWORT_MAX) {
    return res.status(400).json({
      fehler: 'Das Passwort muss mindestens ' + PASSWORT_MIN + ' Zeichen haben.'
    });
  }

  try {
    const hash = await bcrypt.hash(passwort, 12);

    const ergebnis = await pool.query(
      `INSERT INTO benutzer (benutzername, passwort_hash)
       VALUES ($1, $2) RETURNING id, benutzername`,
      [name, hash]
    );

    const benutzer = ergebnis.rows[0];
    await anmelden(res, req, benutzer);

    res.status(201).json({ benutzername: benutzer.benutzername });

  } catch (fehler) {
    if (fehler.code === '23505') {
      return res.status(409).json({ fehler: 'Dieser Name ist schon vergeben.' });
    }
    console.error(fehler);
    res.status(500).json({ fehler: 'Registrierung fehlgeschlagen.' });
  }
});


app.post('/api/login', async function (req, res) {
  const name = String(req.body.benutzername || '').trim();
  const passwort = String(req.body.passwort || '');

  if (name === '' || passwort === '') {
    return res.status(400).json({ fehler: 'Bitte Name und Passwort eingeben.' });
  }

  try {
    const ergebnis = await pool.query(
      `SELECT id, benutzername, passwort_hash
       FROM benutzer WHERE lower(benutzername) = lower($1)`,
      [name]
    );

    const benutzer = ergebnis.rows[0];

    const hash = benutzer
      ? benutzer.passwort_hash
      : '$2a$12$0000000000000000000000000000000000000000000000000000';

    const passt = await bcrypt.compare(passwort, hash);

    if (!benutzer || !passt) {
      return res.status(401).json({ fehler: 'Name oder Passwort ist falsch.' });
    }

    await anmelden(res, req, benutzer);
    res.json({ benutzername: benutzer.benutzername });

  } catch (fehler) {
    console.error(fehler);
    res.status(500).json({ fehler: 'Anmeldung fehlgeschlagen.' });
  }
});


app.post('/api/logout', async function (req, res) {
  const token = req.cookies ? req.cookies.sitzung : null;

  if (token) {
    try {
      await pool.query('DELETE FROM sitzungen WHERE token = $1', [token]);
    } catch (fehler) {
      console.error(fehler);
    }
  }

  res.clearCookie('sitzung');
  res.json({ ok: true });
});


// ============================================
//  WÄNDE
// ============================================

app.get('/api/waende', async function (req, res) {
  try {
    const aktuell = await wandPflegen();

    const ergebnis = await pool.query(
      `SELECT w.id, w.nummer, w.beginn, w.ende,
              (SELECT COUNT(*) FROM zettel z WHERE z.wand_id = w.id) AS anzahl
       FROM waende w
       ORDER BY w.beginn DESC`
    );

    res.json({
      aktuell: aktuell.id,
      waende: ergebnis.rows
    });

  } catch (fehler) {
    console.error(fehler);
    res.status(500).json({ fehler: 'Wände konnten nicht geladen werden.' });
  }
});


// Nur die aktuelle Wand ist bearbeitbar - ältere sind Chronik
async function istAktuelleWand(zettelId, aktuellId) {
  const ergebnis = await pool.query(
    'SELECT wand_id, benutzer_id FROM zettel WHERE id = $1',
    [zettelId]
  );

  if (ergebnis.rowCount === 0) {
    return { gefunden: false };
  }

  return {
    gefunden: true,
    aktuell: ergebnis.rows[0].wand_id === aktuellId,
    besitzer: ergebnis.rows[0].benutzer_id
  };
}


// ============================================
//  NOTIZEN
// ============================================

app.get('/api/zettel', async function (req, res) {
  try {
    const aktuell = await wandPflegen();
    const gewaehlt = req.query.wand ? String(req.query.wand) : aktuell.id;
    const ich = req.benutzer ? req.benutzer.id : null;

    const ergebnis = await pool.query(
      `SELECT id, name, nachricht, farbe, zeit, x, y, breite, hoehe, ebene, winkel,
              (zeichnung IS NOT NULL) AS hat_zeichnung,
              (
                $1::uuid IS NOT NULL
                AND (benutzer_id IS NULL OR benutzer_id = $1::uuid)
                AND wand_id = $3::uuid
              ) AS darf_loeschen
       FROM zettel
       WHERE wand_id = $2::uuid
       ORDER BY ebene ASC, zeit ASC`,
      [ich, gewaehlt, aktuell.id]
    );

    res.json(ergebnis.rows);

  } catch (fehler) {
    console.error(fehler);
    res.status(400).json({ fehler: 'Diese Wand gibt es nicht.' });
  }
});


// ===== Zeichnung eines Zettels ausliefern =====
// Eigene Adresse, damit die Bilddaten nicht bei jeder
// Aktualisierung der Wand mitgeschickt werden.
app.get('/api/zettel/:id/zeichnung', async function (req, res) {
  try {
    const ergebnis = await pool.query(
      'SELECT zeichnung FROM zettel WHERE id = $1',
      [req.params.id]
    );

    const daten = ergebnis.rows[0] ? ergebnis.rows[0].zeichnung : null;

    if (!daten) {
      return res.status(404).json({ fehler: 'Keine Zeichnung.' });
    }

    // "data:image/png;base64," abschneiden und in Bytes wandeln
    const bytes = Buffer.from(daten.split(',')[1], 'base64');

    res.setHeader('Content-Type', 'image/png');

    // Eine Zeichnung ändert sich nie - der Browser darf
    // sie dauerhaft behalten.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    res.send(bytes);

  } catch (fehler) {
    res.status(400).json({ fehler: 'Ungültige ID.' });
  }
});


app.post('/api/zettel', async function (req, res) {
  const nachricht = String(req.body.nachricht || '').trim();

  if (nachricht === '') {
    return res.status(400).json({ fehler: 'Bitte einen Text schreiben.' });
  }
  if (nachricht.length > MAX_ZEICHEN) {
    return res.status(400).json({
      fehler: 'Text ist zu lang (max. ' + MAX_ZEICHEN + ' Zeichen).'
    });
  }

  // ===== Zeichnung, falls eine mitkommt =====
  let zeichnung = null;

  if (req.body.zeichnung) {
    const roh = String(req.body.zeichnung);

    // Nur PNG als Datenadresse, nichts anderes
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(roh)) {
      return res.status(400).json({ fehler: 'Ungültige Zeichnung.' });
    }
    if (roh.length > MAX_ZEICHNUNG) {
      return res.status(400).json({ fehler: 'Die Zeichnung ist zu groß.' });
    }

    zeichnung = roh;
  }

  const name = req.benutzer ? req.benutzer.benutzername : 'Anonym';
  const besitzer = req.benutzer ? req.benutzer.id : null;

  const farbe = FARBEN[Math.floor(Math.random() * FARBEN.length)];
  const x = zahlOderNull(req.body.x, 0, MAX_X);
  const y = zahlOderNull(req.body.y, 0, MAX_Y);
  const breite = zahlOderNull(req.body.breite, MIN_BREITE, MAX_BREITE);
  const hoehe = zahlOderNull(req.body.hoehe, MIN_HOEHE, MAX_HOEHE);

  try {
    const aktuell = await wandPflegen();

    const ergebnis = await pool.query(
      `INSERT INTO zettel
         (name, nachricht, farbe, x, y, breite, hoehe, ebene,
          benutzer_id, wand_id, zeichnung)
       VALUES (
         $1, $2, $3,
         COALESCE($4, 20),
         COALESCE($5, 20),

         -- Bei Text begrenzt die Textlänge die Größe.
         -- Zeichnungen haben keinen Text, daher ohne Begrenzung.
         CASE WHEN $14::text IS NULL
              THEN LEAST(COALESCE($6, 190), $8 + length($2) * $10)
              ELSE COALESCE($6, 190)
         END,
         CASE WHEN $14::text IS NULL
              THEN LEAST(COALESCE($7, 130), $9 + length($2) * $11)
              ELSE COALESCE($7, 130)
         END,
         (SELECT COALESCE(MAX(ebene), 0) + 1 FROM zettel WHERE wand_id = $13),
         $12, $13, $14
       )
       RETURNING id, name, nachricht, farbe, zeit, x, y, breite, hoehe, ebene,
                 (zeichnung IS NOT NULL) AS hat_zeichnung`,
      [name, nachricht, farbe, x, y, breite, hoehe,
       GUARD_BREITE, GUARD_HOEHE, BREITE_PRO_ZEICHEN, HOEHE_PRO_ZEICHEN,
       besitzer, aktuell.id, zeichnung]
    );

    alleBenachrichtigen();
    res.status(201).json(ergebnis.rows[0]);

  } catch (fehler) {
    console.error(fehler);
    res.status(500).json({ fehler: 'Datenbankfehler beim Speichern.' });
  }
});


// ===== Live-Bewegung während des Ziehens =====
// Wird viele Male pro Sekunde aufgerufen und schreibt
// deshalb NICHT in die Datenbank - nur weitersagen.
// Gespeichert wird erst beim Loslassen über /layout.
app.post('/api/zettel/:id/bewegt', function (req, res) {
  const x = zahlOderNull(req.body.x, 0, MAX_X);
  const y = zahlOderNull(req.body.y, 0, MAX_Y);
  const breite = zahlOderNull(req.body.breite, MIN_BREITE, MAX_BREITE);
  const hoehe = zahlOderNull(req.body.hoehe, MIN_HOEHE, MAX_HOEHE);

  ereignisSenden({
    typ: 'bewegt',
    id: req.params.id,
    x: x,
    y: y,
    breite: breite,
    hoehe: hoehe,
    winkel: zahlOderNull(req.body.winkel, 0, 359),
    sender: String(req.body.sender || '')
  });

  // 204 = alles gut, nichts zurückzugeben
  res.status(204).end();
});


app.patch('/api/zettel/:id/layout', async function (req, res) {
  const x = zahlOderNull(req.body.x, 0, MAX_X);
  const y = zahlOderNull(req.body.y, 0, MAX_Y);
  const breite = zahlOderNull(req.body.breite, MIN_BREITE, MAX_BREITE);
  const hoehe = zahlOderNull(req.body.hoehe, MIN_HOEHE, MAX_HOEHE);
  const winkel = zahlOderNull(req.body.winkel, 0, 359);

  try {
    const aktuell = await wandPflegen();
    const info = await istAktuelleWand(req.params.id, aktuell.id);

    if (!info.gefunden) {
      return res.status(404).json({ fehler: 'Notiz nicht gefunden.' });
    }
    if (!info.aktuell) {
      return res.status(403).json({ fehler: 'Ältere Wände sind nur zum Ansehen.' });
    }

    const ergebnis = await pool.query(
      `UPDATE zettel SET
         x = COALESCE($1, x),
         y = COALESCE($2, y),
         -- Die Textlänge begrenzt die Größe nur bei Textnotizen.
         -- Zeichnungen haben kaum Text und dürfen frei wachsen.
         breite = CASE WHEN zeichnung IS NULL
                       THEN LEAST(COALESCE($3, breite), $6 + length(nachricht) * $8)
                       ELSE COALESCE($3, breite)
                  END,
         hoehe  = CASE WHEN zeichnung IS NULL
                       THEN LEAST(COALESCE($4, hoehe), $7 + length(nachricht) * $9)
                       ELSE COALESCE($4, hoehe)
                  END,
         winkel = COALESCE($11, winkel),
         ebene = (SELECT COALESCE(MAX(ebene), 0) + 1 FROM zettel WHERE wand_id = $10)
       WHERE id = $5
       RETURNING id, x, y, breite, hoehe, ebene, winkel`,
      [x, y, breite, hoehe, req.params.id,
       GUARD_BREITE, GUARD_HOEHE, BREITE_PRO_ZEICHEN, HOEHE_PRO_ZEICHEN,
       aktuell.id, winkel]
    );

    alleBenachrichtigen();
    res.json(ergebnis.rows[0]);

  } catch (fehler) {
    console.error(fehler);
    return res.status(400).json({ fehler: 'Ungültige Anfrage.' });
  }
});


app.delete('/api/zettel/:id', async function (req, res) {

  if (!req.benutzer) {
    return res.status(401).json({ fehler: 'Bitte zuerst anmelden.' });
  }

  try {
    const aktuell = await wandPflegen();
    const info = await istAktuelleWand(req.params.id, aktuell.id);

    if (!info.gefunden) {
      return res.status(404).json({ fehler: 'Notiz nicht gefunden.' });
    }
    if (!info.aktuell) {
      return res.status(403).json({ fehler: 'Ältere Wände sind nur zum Ansehen.' });
    }
    if (info.besitzer !== null && info.besitzer !== req.benutzer.id) {
      return res.status(403).json({ fehler: 'Das ist nicht deine Notiz.' });
    }

    await pool.query('DELETE FROM zettel WHERE id = $1', [req.params.id]);

    alleBenachrichtigen();
    res.json({ ok: true });

  } catch (fehler) {
    return res.status(400).json({ fehler: 'Ungültige ID.' });
  }
});


app.delete('/api/zettel', async function (req, res) {
  if (!req.benutzer) {
    return res.status(401).json({ fehler: 'Bitte zuerst anmelden.' });
  }

  try {
    const aktuell = await wandPflegen();

    await pool.query(
      'DELETE FROM zettel WHERE benutzer_id = $1 AND wand_id = $2',
      [req.benutzer.id, aktuell.id]
    );

    alleBenachrichtigen();
    res.json({ ok: true });

  } catch (fehler) {
    console.error(fehler);
    res.status(500).json({ fehler: 'Datenbankfehler beim Löschen.' });
  }
});


// Stündlich prüfen, ob ein neuer Abschnitt begonnen hat
setInterval(function () {
  wandPflegen().catch(function (fehler) {
    console.error('Wandpflege fehlgeschlagen:', fehler.message);
  });
}, 60 * 60 * 1000);


datenbankVorbereiten()
  .then(wandPflegen)
  .then(function () {
    app.listen(PORT, function () {
      console.log('Server läuft auf Port ' + PORT);
    });
  })
  .catch(function (fehler) {
    console.error('Keine Verbindung zur Datenbank:', fehler.message);
    process.exit(1);
  });
