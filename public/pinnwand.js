// ============================================
//  Nur für die Pinnwand-Seite (index.html)
// ============================================

const form = document.querySelector('#zettelForm');
const nameFeld = document.querySelector('#nameFeld');
const nachrichtFeld = document.querySelector('#nachrichtFeld');
const pinnwand = document.querySelector('#pinnwand');
const statusZeile = document.querySelector('#status');
const sendenButton = document.querySelector('#sendenButton');
const loeschenAlleButton = document.querySelector('#loeschenAlle');

let zettelListe = [];


function statusSetzen(text) {
  statusZeile.textContent = text;
}


// ===== Zettel vom Server holen =====
async function zettelHolen() {
  try {
    const antwort = await fetch('/api/zettel');

    if (!antwort.ok) {
      throw new Error('Server antwortet mit Status ' + antwort.status);
    }

    zettelListe = await antwort.json();
    statusSetzen('');
    anzeigen();

  } catch (fehler) {
    statusSetzen('Keine Verbindung zum Server.');
    console.error(fehler);
  }
}


// ===== Neuen Zettel senden =====
async function zettelSenden(name, nachricht) {
  sendenButton.disabled = true;

  try {
    const antwort = await fetch('/api/zettel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, nachricht: nachricht })
    });

    const daten = await antwort.json();

    if (!antwort.ok) {
      statusSetzen(daten.fehler || 'Der Zettel wurde abgelehnt.');
      return;
    }

    nachrichtFeld.value = '';
    nachrichtFeld.focus();
    await zettelHolen();

  } catch (fehler) {
    statusSetzen('Konnte nicht senden. Server erreichbar?');
    console.error(fehler);

  } finally {
    sendenButton.disabled = false;
  }
}


// ===== Löschen =====
async function zettelLoeschen(id) {
  try {
    await fetch('/api/zettel/' + id, { method: 'DELETE' });
    await zettelHolen();
  } catch (fehler) {
    statusSetzen('Löschen fehlgeschlagen.');
  }
}

async function alleLoeschen() {
  try {
    await fetch('/api/zettel', { method: 'DELETE' });
    await zettelHolen();
  } catch (fehler) {
    statusSetzen('Löschen fehlgeschlagen.');
  }
}


// ===== Anzeigen =====
function anzeigen() {
  pinnwand.innerHTML = '';

  if (zettelListe.length === 0) {
    const hinweis = document.createElement('p');
    hinweis.className = 'leer';
    hinweis.textContent = 'Noch keine Zettel. Schreib den ersten!';
    pinnwand.appendChild(hinweis);
    return;
  }

  zettelListe.forEach(function (eintrag) {
    const zettel = document.createElement('div');
    zettel.className = 'zettel ' + eintrag.farbe;

    const text = document.createElement('p');
    text.textContent = eintrag.nachricht;

    const autor = document.createElement('small');
    autor.textContent = 'von ' + eintrag.name;

    const zeit = document.createElement('span');
    zeit.className = 'zeit';
    zeit.textContent = new Date(eintrag.zeit).toLocaleString('de-DE');
    autor.appendChild(zeit);

    const loeschen = document.createElement('button');
    loeschen.className = 'loeschen';
    loeschen.textContent = '×';
    loeschen.addEventListener('click', function () {
      zettelLoeschen(eintrag.id);
    });

    zettel.appendChild(loeschen);
    zettel.appendChild(text);
    zettel.appendChild(autor);
    pinnwand.appendChild(zettel);
  });
}


// ===== Formular =====
form.addEventListener('submit', function (event) {
  event.preventDefault();

  const name = nameFeld.value.trim();
  const nachricht = nachrichtFeld.value.trim();

  if (nachricht === '') {
    statusSetzen('Bitte eine Nachricht schreiben.');
    return;
  }

  statusSetzen('');
  zettelSenden(name, nachricht);
});

loeschenAlleButton.addEventListener('click', function () {
  if (confirm('Willst du wirklich alle Zettel löschen?')) {
    alleLoeschen();
  }
});


// ===== Start =====
zettelHolen();
setInterval(zettelHolen, 5000);
