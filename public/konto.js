// ============================================
//  Anmeldebereich oben rechts
//  Wird von allen Seiten eingebunden.
// ============================================

console.log('konto.js geladen');

let kontoBereich = document.querySelector('#konto');

if (!kontoBereich) {
  kontoBereich = document.createElement('div');
  kontoBereich.id = 'konto';
  kontoBereich.className = 'konto';
  document.body.appendChild(kontoBereich);
}

let angemeldeterName = null;


// Nach An- oder Abmelden muss die Wand neu geladen werden,
// weil sich die Löschrechte ändern. Auf Seiten ohne Wand
// gibt es notizenHolen nicht - deshalb die Prüfung.
function wandAktualisieren() {
  if (typeof notizenHolen === 'function') {
    notizenHolen();
  }
}


// ===== Beim Server nachfragen, wer angemeldet ist =====
async function kontoLaden() {
  try {
    const antwort = await fetch('/api/ich');
    const daten = await antwort.json();
    angemeldeterName = daten.benutzername;
  } catch (fehler) {
    angemeldeterName = null;
    console.error('Konto konnte nicht geladen werden:', fehler);
  }

  kontoAnzeigen();
}


// ===== Anzeige aufbauen =====
function kontoAnzeigen() {
  kontoBereich.innerHTML = '';

  if (angemeldeterName) {
    const hallo = document.createElement('span');
    hallo.className = 'kontoName';
    hallo.textContent = angemeldeterName;

    const abmelden = document.createElement('button');
    abmelden.className = 'kontoKnopf';
    abmelden.textContent = 'Abmelden';
    abmelden.addEventListener('click', abmeldenAusfuehren);

    kontoBereich.appendChild(hallo);
    kontoBereich.appendChild(abmelden);
    return;
  }

  const login = document.createElement('button');
  login.className = 'kontoKnopf';
  login.textContent = 'Login';
  login.addEventListener('click', function () {
    formularZeigen('login');
  });

  const registrieren = document.createElement('button');
  registrieren.className = 'kontoKnopf';
  registrieren.textContent = 'Registrieren';
  registrieren.addEventListener('click', function () {
    formularZeigen('registrieren');
  });

  kontoBereich.appendChild(login);
  kontoBereich.appendChild(registrieren);
}


// ===== Formular für Login bzw. Registrierung =====
function formularZeigen(modus) {
  kontoBereich.innerHTML = '';

  const kasten = document.createElement('div');
  kasten.className = 'kontoKasten';

  const titel = document.createElement('div');
  titel.className = 'kontoTitel';
  titel.textContent = modus === 'login' ? 'Anmelden' : 'Konto erstellen';

  const nameFeld = document.createElement('input');
  nameFeld.type = 'text';
  nameFeld.placeholder = 'Benutzername';
  nameFeld.autocomplete = 'username';
  nameFeld.maxLength = 20;

  const passwortFeld = document.createElement('input');
  passwortFeld.type = 'password';
  passwortFeld.placeholder = 'Passwort';
  passwortFeld.autocomplete = modus === 'login' ? 'current-password' : 'new-password';
  passwortFeld.maxLength = 100;

  const meldung = document.createElement('div');
  meldung.className = 'kontoMeldung';

  const senden = document.createElement('button');
  senden.className = 'kontoKnopf kontoHaupt';
  senden.textContent = modus === 'login' ? 'Anmelden' : 'Registrieren';

  const abbrechen = document.createElement('button');
  abbrechen.className = 'kontoKnopf';
  abbrechen.textContent = 'Abbrechen';
  abbrechen.addEventListener('click', kontoAnzeigen);

  const reihe = document.createElement('div');
  reihe.className = 'kontoReihe';
  reihe.appendChild(senden);
  reihe.appendChild(abbrechen);

  kasten.appendChild(titel);
  kasten.appendChild(nameFeld);
  kasten.appendChild(passwortFeld);
  kasten.appendChild(meldung);
  kasten.appendChild(reihe);
  kontoBereich.appendChild(kasten);

  nameFeld.focus();


  async function absenden() {
    const name = nameFeld.value.trim();
    const passwort = passwortFeld.value;

    if (name === '' || passwort === '') {
      meldung.textContent = 'Bitte beides ausfüllen.';
      return;
    }

    senden.disabled = true;
    meldung.textContent = '';

    const adresse = modus === 'login' ? '/api/login' : '/api/registrieren';

    try {
      const antwort = await fetch(adresse, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ benutzername: name, passwort: passwort })
      });

      const daten = await antwort.json();

      if (!antwort.ok) {
        meldung.textContent = daten.fehler || 'Hat nicht geklappt.';
        return;
      }

      angemeldeterName = daten.benutzername;
      kontoAnzeigen();
      wandAktualisieren();

    } catch (fehler) {
      meldung.textContent = 'Server nicht erreichbar.';

    } finally {
      senden.disabled = false;
    }
  }


  senden.addEventListener('click', absenden);

  [nameFeld, passwortFeld].forEach(function (feld) {
    feld.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        absenden();
      }
      if (event.key === 'Escape') {
        kontoAnzeigen();
      }
    });
  });
}


async function abmeldenAusfuehren() {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (fehler) {
    // egal - lokal abmelden reicht
  }

  angemeldeterName = null;
  kontoAnzeigen();
  wandAktualisieren();
}


kontoLaden();
