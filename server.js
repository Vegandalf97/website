// ===== Pinnwand-Server mit API =====

const express = require('express');
const path = require('path');
const fs = require('fs');                  // fs = filesystem, Dateien lesen/schreiben
const crypto = require('crypto');          // für zufällige IDs

const app = express();
const PORT = process.env.PORT || 3000;

// Hier landen die Zettel dauerhaft
const DATEI = path.join(__dirname, 'zettel.json');

const FARBEN = ['gelb', 'gruen', 'blau', 'lila'];

// ===== Middleware: läuft vor jeder Anfrage =====
app.use(express.json());                                  // JSON im Request lesbar machen
app.use(express.static(path.join(__dirname, 'public')));  // Website ausliefern


// ===== Hilfsfunktionen: Datei lesen und schreiben =====
function zettelLesen() {
  if (!fs.existsSync(DATEI)) {
    return [];                        // Datei gibt's noch nicht -> leere Liste
  }
  try {
    return JSON.parse(fs.readFileSync(DATEI, 'utf8'));
  } catch (fehler) {
    console.error('zettel.json ist kaputt:', fehler.message);
    return [];
  }
}

function zettelSchreiben(liste) {
  // null, 2 sorgt für schön eingerückte, lesbare Datei
  fs.writeFileSync(DATEI, JSON.stringify(liste, null, 2), 'utf8');
}


// ===== ROUTE 1: Alle Zettel holen =====
// GET http://localhost:3000/api/zettel
app.get('/api/zettel', function (req, res) {
  res.json(zettelLesen());
});


// ===== ROUTE 2: Neuen Zettel anlegen =====
// POST http://localhost:3000/api/zettel
app.post('/api/zettel', function (req, res) {

  // req.body = die Daten, die der Browser mitgeschickt hat
  const name = String(req.body.name || '').trim();
  const nachricht = String(req.body.nachricht || '').trim();

  // WICHTIG: Der Server prüft nochmal selbst.
  // Prüfungen im Browser kann man umgehen, die hier nicht.
  if (name === '' || nachricht === '') {
    return res.status(400).json({ fehler: 'Name und Nachricht sind Pflicht.' });
  }
  if (name.length > 30) {
    return res.status(400).json({ fehler: 'Name ist zu lang (max. 30 Zeichen).' });
  }
  if (nachricht.length > 100) {
    return res.status(400).json({ fehler: 'Nachricht ist zu lang (max. 100 Zeichen).' });
  }

  const neuerZettel = {
    id: crypto.randomUUID(),          // eindeutige ID, z.B. "f81d4fae-7dec-..."
    name: name,
    nachricht: nachricht,
    farbe: FARBEN[Math.floor(Math.random() * FARBEN.length)],
    zeit: Date.now()
  };

  const liste = zettelLesen();
  liste.unshift(neuerZettel);         // vorne einfügen
  zettelSchreiben(liste);

  res.status(201).json(neuerZettel);  // 201 = "erfolgreich angelegt"
});


// ===== ROUTE 3: Einen Zettel löschen =====
// DELETE http://localhost:3000/api/zettel/<id>
app.delete('/api/zettel/:id', function (req, res) {
  const liste = zettelLesen();

  // filter() behält alle, bei denen die Bedingung wahr ist
  const uebrig = liste.filter(function (zettel) {
    return zettel.id !== req.params.id;
  });

  if (uebrig.length === liste.length) {
    return res.status(404).json({ fehler: 'Zettel nicht gefunden.' });
  }

  zettelSchreiben(uebrig);
  res.json({ ok: true });
});


// ===== ROUTE 4: Alle Zettel löschen =====
// DELETE http://localhost:3000/api/zettel
app.delete('/api/zettel', function (req, res) {
  zettelSchreiben([]);
  res.json({ ok: true });
});


app.listen(PORT, function () {
  console.log('Server läuft!');
  console.log('Im Browser öffnen: http://localhost:' + PORT);
  console.log('Beenden mit Strg + C');
});
