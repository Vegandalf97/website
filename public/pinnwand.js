// ============================================
//  Wall of Notes
//  Doppelklick = neue Notiz
//  Ziehen = verschieben (kommt nach vorne)
//  Ecke unten rechts = Breite ändern
//
//  Löschen darf man nur eigene Notizen. Ob das
//  erlaubt ist, entscheidet der Server und schickt
//  es als "darf_loeschen" mit.
// ============================================

const wand = document.querySelector('#wand');
const statusZeile = document.querySelector('#status');

const NOTIZ_BREITE = 190;
const NOTIZ_HOEHE = 130;

const GRIFF_ZONE = 22;

const MAX_ZEICHEN = 500;

const MIN_BREITE = 150;
const MAX_BREITE = 520;
const MIN_HOEHE = 90;
const MAX_HOEHE = 460;

// ===== Werte aus style.css, die beim Messen zählen =====
const RAHMEN = 1;
const TEXT_OBEN = 30;
const TEXT_LINKS = 12;
const TEXT_RECHTS = 5;
const TEXT_UNTEN = 6;
const SCROLLBAR = 6;
const SICHERHEIT = 2;

const BREITEN_STUFEN = [190, 240, 300, 360, 420, 470, 520];

const SPIELRAUM_BASIS = 40;
const SPIELRAUM_PRO_ZEICHEN = 1;
const SPIELRAUM_BREITE_MAX = 220;

let notizen = [];
let ziehtGerade = false;
let schreibtGerade = false;
let offeneSpeicherungen = 0;
let obersteEbene = 10;
let nachholenNoetig = false;

const hoehenSpeicher = new Map();
const groessenSpeicher = new Map();

let messNotiz = null;
let messAbsatz = null;


function statusSetzen(text) {
  statusZeile.textContent = text;
}


function beschaeftigt() {
  return ziehtGerade || schreibtGerade || offeneSpeicherungen > 0;
}


function begrenzen(wert, min, max) {
  return Math.min(Math.max(wert, min), max);
}


// ============================================
//  MESSEN
// ============================================
function messerVorbereiten() {
  if (!messNotiz) {
    messNotiz = document.createElement('div');
    messNotiz.className = 'notiz';
    messNotiz.style.visibility = 'hidden';
    messNotiz.style.left = '-9999px';
    messNotiz.style.top = '0';
    messNotiz.style.height = 'auto';
    messNotiz.style.maxHeight = 'none';
    messNotiz.style.maxWidth = 'none';

    messAbsatz = document.createElement('p');
    messAbsatz.style.position = 'static';
    messAbsatz.style.whiteSpace = 'pre-wrap';
    messAbsatz.style.margin = '0';

    messNotiz.appendChild(messAbsatz);
  }

  if (!messNotiz.isConnected) {
    wand.appendChild(messNotiz);
  }
}


function hoeheFuerBreite(text, breite) {
  const schluessel = text + '|' + breite;

  if (hoehenSpeicher.has(schluessel)) {
    return hoehenSpeicher.get(schluessel);
  }

  messerVorbereiten();

  const innenBreite = breite - 2 * RAHMEN - TEXT_LINKS - TEXT_RECHTS - SCROLLBAR;

  messNotiz.style.width = breite + 'px';
  messAbsatz.textContent = text;
  messAbsatz.style.width = innenBreite + 'px';

  const textHoehe = Math.ceil(messAbsatz.getBoundingClientRect().height);
  const noetig = textHoehe + 2 * RAHMEN + TEXT_OBEN + TEXT_UNTEN + SICHERHEIT;

  hoehenSpeicher.set(schluessel, noetig);
  return noetig;
}


function passendeHoehe(text, breite) {
  return begrenzen(hoeheFuerBreite(text, breite), MIN_HOEHE, MAX_HOEHE);
}


function groesseFuerText(text) {
  if (groessenSpeicher.has(text)) {
    return groessenSpeicher.get(text);
  }

  let gewaehlteBreite = BREITEN_STUFEN[0];

  for (let i = 0; i < BREITEN_STUFEN.length; i++) {
    gewaehlteBreite = BREITEN_STUFEN[i];

    if (hoeheFuerBreite(text, gewaehlteBreite) <= MAX_HOEHE) {
      break;
    }
  }

  const breite = begrenzen(gewaehlteBreite, MIN_BREITE, MAX_BREITE);

  const spielraum = Math.min(
    SPIELRAUM_BREITE_MAX,
    SPIELRAUM_BASIS + text.length * SPIELRAUM_PRO_ZEICHEN
  );

  const ergebnis = {
    breite: breite,
    hoehe: passendeHoehe(text, breite),
    maxBreite: begrenzen(Math.round(breite + spielraum), MIN_BREITE, MAX_BREITE)
  };

  groessenSpeicher.set(text, ergebnis);
  return ergebnis;
}


// ============================================
//  Daten vom Server
// ============================================

async function notizenHolen() {
  if (beschaeftigt()) {
    nachholenNoetig = true;
    return;
  }

  try {
    const antwort = await fetch('/api/zettel');

    if (!antwort.ok) {
      throw new Error('Status ' + antwort.status);
    }

    notizen = await antwort.json();
    statusSetzen('');
    anzeigen();

  } catch (fehler) {
    statusSetzen('Keine Verbindung zum Server.');
    console.error(fehler);
  }
}


function nachholenPruefen() {
  if (nachholenNoetig && !beschaeftigt()) {
    nachholenNoetig = false;
    notizenHolen();
  }
}


async function notizSpeichern(text, x, y) {
  const groesse = groesseFuerText(text);

  try {
    const antwort = await fetch('/api/zettel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nachricht: text,
        x: x,
        y: y,
        breite: groesse.breite,
        hoehe: groesse.hoehe
      })
    });

    const daten = await antwort.json();

    if (!antwort.ok) {
      statusSetzen(daten.fehler || 'Notiz abgelehnt.');
      return;
    }

    await notizenHolen();

  } catch (fehler) {
    statusSetzen('Konnte nicht speichern.');
  }
}


async function layoutSpeichern(eintrag, element) {
  const lebt = element && element.isConnected;

  const breite = Math.round(lebt ? element.offsetWidth : eintrag.breite);
  const hoehe = Math.round(lebt ? element.offsetHeight : eintrag.hoehe);

  if (!breite || !hoehe) {
    return;
  }

  offeneSpeicherungen = offeneSpeicherungen + 1;

  try {
    const antwort = await fetch('/api/zettel/' + eintrag.id + '/layout', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x: Math.round(eintrag.x),
        y: Math.round(eintrag.y),
        breite: breite,
        hoehe: hoehe
      })
    });

    if (!antwort.ok) {
      console.error('Layout abgelehnt, Status', antwort.status);
      return;
    }

    const daten = await antwort.json();

    eintrag.x = daten.x;
    eintrag.y = daten.y;
    eintrag.breite = daten.breite;
    eintrag.hoehe = daten.hoehe;
    eintrag.ebene = daten.ebene;

    if (element && element.isConnected) {
      element.style.left = daten.x + 'px';
      element.style.top = daten.y + 'px';
    }

  } catch (fehler) {
    statusSetzen('Layout konnte nicht gespeichert werden.');

  } finally {
    offeneSpeicherungen = offeneSpeicherungen - 1;
    nachholenPruefen();
  }
}


async function notizLoeschen(id) {
  try {
    const antwort = await fetch('/api/zettel/' + id, { method: 'DELETE' });

    if (!antwort.ok) {
      const daten = await antwort.json();
      statusSetzen(daten.fehler || 'Löschen nicht erlaubt.');
      return;
    }

    await notizenHolen();

  } catch (fehler) {
    statusSetzen('Löschen fehlgeschlagen.');
  }
}


// ============================================
//  Anzeigen
// ============================================

function anzeigen() {
  wand.innerHTML = '';

  notizen.forEach(function (eintrag, nummer) {

    const auto = groesseFuerText(eintrag.nachricht);

    const breite = begrenzen(eintrag.breite, MIN_BREITE, auto.maxBreite);
    const hoehe = passendeHoehe(eintrag.nachricht, breite);

    const notiz = document.createElement('div');
    notiz.className = 'notiz ' + eintrag.farbe;

    notiz.style.left = eintrag.x + 'px';
    notiz.style.top = eintrag.y + 'px';
    notiz.style.width = breite + 'px';
    notiz.style.height = hoehe + 'px';

    notiz.style.zIndex = 10 + nummer;
    obersteEbene = Math.max(obersteEbene, 10 + nummer);

    const autor = document.createElement('small');
    autor.textContent = eintrag.name;

    const text = document.createElement('p');
    text.textContent = eintrag.nachricht;

    // Das x gibt es nur, wenn der Server es erlaubt
    if (eintrag.darf_loeschen) {
      const loeschen = document.createElement('button');
      loeschen.className = 'loeschen';
      loeschen.textContent = '×';
      loeschen.title = 'Notiz löschen';
      loeschen.addEventListener('click', function (event) {
        event.stopPropagation();
        notizLoeschen(eintrag.id);
      });
      notiz.appendChild(loeschen);
    }

    notiz.appendChild(autor);
    notiz.appendChild(text);

    wand.appendChild(notiz);

    eintrag.breite = breite;
    eintrag.hoehe = hoehe;
    eintrag.maxBreite = auto.maxBreite;

    ziehenAktivieren(notiz, eintrag);
  });
}


// ============================================
//  Verschieben und Breitenziehen
// ============================================

function ziehenAktivieren(element, eintrag) {

  element.addEventListener('pointerdown', function (event) {

    if (event.target.classList.contains('loeschen')) {
      return;
    }

    obersteEbene = obersteEbene + 1;
    element.style.zIndex = obersteEbene;

    const rahmen = element.getBoundingClientRect();

    const inEcke = event.clientX > rahmen.right - GRIFF_ZONE &&
                   event.clientY > rahmen.bottom - GRIFF_ZONE;

    ziehtGerade = true;
    element.setPointerCapture(event.pointerId);
    element.classList.add('wirdGezogen');

    // ---------- Fall 1: Breite ändern ----------
    if (inEcke) {
      const startX = event.clientX;
      const startBreite = element.offsetWidth;

      function breiteBewegen(bewegEvent) {
        let neueBreite = Math.round(startBreite + (bewegEvent.clientX - startX));
        neueBreite = begrenzen(neueBreite, MIN_BREITE, eintrag.maxBreite);

        const maxPlatz = wand.clientWidth - eintrag.x;
        neueBreite = Math.min(neueBreite, Math.max(MIN_BREITE, maxPlatz));

        element.style.width = neueBreite + 'px';
        element.style.height = passendeHoehe(eintrag.nachricht, neueBreite) + 'px';
      }

      function breiteFertig() {
        element.removeEventListener('pointermove', breiteBewegen);
        element.removeEventListener('pointerup', breiteFertig);
        element.removeEventListener('pointercancel', breiteFertig);

        element.classList.remove('wirdGezogen');
        ziehtGerade = false;

        eintrag.breite = element.offsetWidth;
        eintrag.hoehe = element.offsetHeight;
        layoutSpeichern(eintrag, element);
      }

      element.addEventListener('pointermove', breiteBewegen);
      element.addEventListener('pointerup', breiteFertig);
      element.addEventListener('pointercancel', breiteFertig);
      return;
    }

    // ---------- Fall 2: verschieben ----------
    const wandRahmen = wand.getBoundingClientRect();
    const griffX = event.clientX - rahmen.left;
    const griffY = event.clientY - rahmen.top;

    let letzteX = eintrag.x;
    let letzteY = eintrag.y;


    function bewegen(bewegEvent) {
      let neuX = bewegEvent.clientX - wandRahmen.left - griffX;
      let neuY = bewegEvent.clientY - wandRahmen.top - griffY;

      neuX = begrenzen(neuX, 0, wand.clientWidth - element.offsetWidth);
      neuY = begrenzen(neuY, 0, wand.clientHeight - element.offsetHeight);

      neuX = Math.round(neuX);
      neuY = Math.round(neuY);

      element.style.left = neuX + 'px';
      element.style.top = neuY + 'px';

      letzteX = neuX;
      letzteY = neuY;
    }


    function loslassen() {
      element.removeEventListener('pointermove', bewegen);
      element.removeEventListener('pointerup', loslassen);
      element.removeEventListener('pointercancel', loslassen);

      element.classList.remove('wirdGezogen');
      ziehtGerade = false;

      eintrag.x = letzteX;
      eintrag.y = letzteY;
      layoutSpeichern(eintrag, element);
    }


    element.addEventListener('pointermove', bewegen);
    element.addEventListener('pointerup', loslassen);
    element.addEventListener('pointercancel', loslassen);
  });
}


// ============================================
//  Neue Notiz anlegen
// ============================================

function notizfeldOeffnen(x, y) {
  schreibtGerade = true;

  const notiz = document.createElement('div');
  notiz.className = 'notiz neu';
  notiz.style.left = x + 'px';
  notiz.style.top = y + 'px';
  notiz.style.width = NOTIZ_BREITE + 'px';
  notiz.style.height = NOTIZ_HOEHE + 'px';

  obersteEbene = obersteEbene + 1;
  notiz.style.zIndex = obersteEbene;

  const feld = document.createElement('textarea');
  feld.maxLength = MAX_ZEICHEN;
  feld.placeholder = 'Text eingeben...';

  notiz.appendChild(feld);
  wand.appendChild(notiz);
  feld.focus();

  let schonFertig = false;

  async function fertig() {
    if (schonFertig) {
      return;
    }
    schonFertig = true;

    const text = feld.value.trim();
    notiz.remove();
    schreibtGerade = false;

    if (text === '') {
      await notizenHolen();
      return;
    }

    await notizSpeichern(text, x, y);
  }

  feld.addEventListener('blur', fertig);

  feld.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      fertig();
    }
    if (event.key === 'Escape') {
      feld.value = '';
      fertig();
    }
  });
}


wand.addEventListener('dblclick', function (event) {
  if (event.target !== wand) {
    return;
  }

  const rahmen = wand.getBoundingClientRect();
  let x = event.clientX - rahmen.left - NOTIZ_BREITE / 2;
  let y = event.clientY - rahmen.top - NOTIZ_HOEHE / 2;

  x = begrenzen(x, 0, wand.clientWidth - NOTIZ_BREITE);
  y = begrenzen(y, 0, wand.clientHeight - NOTIZ_HOEHE);

  notizfeldOeffnen(Math.round(x), Math.round(y));
});


// ============================================
//  Live-Verbindung zum Server
// ============================================

const ereignisse = new EventSource('/api/ereignisse');

ereignisse.addEventListener('message', function () {
  notizenHolen();
});

ereignisse.addEventListener('error', function () {
  console.log('Live-Verbindung unterbrochen, wird neu aufgebaut...');
});

window.addEventListener('focus', function () {
  notizenHolen();
});


// ============================================
//  Start
// ============================================

notizenHolen();
