// ============================================
//  Wall of Notes
//
//  Jeder Monat wird in vier Abschnitte geteilt.
//  Ältere Abschnitte sind Chronik und nur zum
//  Ansehen. Die Wand füllt den Rahmen immer aus.
// ============================================

const rahmen = document.querySelector('#wandRahmen');
const wand = document.querySelector('#wand');
const statusZeile = document.querySelector('#status');
const waendeLeiste = document.querySelector('#waendeLeiste');

// Größe der gesamten Wand - muss zu style.css passen
const WAND_BREITE = 2400;
const WAND_HOEHE = 1200;

const NOTIZ_BREITE = 190;
const NOTIZ_HOEHE = 90;

const GRIFF_ZONE = 22;
const MAX_ZEICHEN = 500;

const MIN_BREITE = 150;
const MAX_BREITE = 520;
const MIN_HOEHE = 90;
const MAX_HOEHE = 460;

// Notizen mit Bild dürfen breiter und höher werden
const BILD_MIN_BREITE = 320;

// Reine Befehlsbilder: schmaler Rand rundum, kein Name,
// kein Löschknopf, keine Größenänderung
const BILD_RAND = 0;
const BILD_MIN_HOEHE = 40;

const MAX_SKALA = 2;
const ZOOM_SCHRITT = 1.25;

// ===== Werte aus style.css, die beim Messen zählen =====
// Links und rechts jetzt gleich - dadurch sitzt das Bild
// mittig und der Ziehgriff genau an seiner Kante.
const RAHMEN = 1;
const TEXT_OBEN = 32;
const TEXT_LINKS = 12;
const TEXT_RECHTS = 12;
const TEXT_UNTEN = 12;
const SCROLLBAR = 6;
const SICHERHEIT = 1;

const BREITEN_STUFEN = [190, 240, 300, 360, 420, 470, 520];

const SPIELRAUM_BASIS = 40;
const SPIELRAUM_PRO_ZEICHEN = 1;
const SPIELRAUM_BREITE_MAX = 220;

let notizen = [];
let waende = [];
let aktuelleWandId = null;
let gewaehlteWandId = null;

let ziehtGerade = false;
let schreibtGerade = false;
let offeneSpeicherungen = 0;
let obersteEbene = 10;
let nachholenNoetig = false;

let skala = 1;
let versatzX = 0;
let versatzY = 0;
let zoomGeste = false;

const hoehenSpeicher = new Map();
const groessenSpeicher = new Map();

// Gemerkte Seitenverhältnisse der Bilder (Adresse -> Maße)
const bildMasse = new Map();

let messNotiz = null;
let messAbsatz = null;


function statusSetzen(text) {
  statusZeile.textContent = text;
}


function nurLesen() {
  return gewaehlteWandId !== aktuelleWandId;
}


function beschaeftigt() {
  return ziehtGerade || schreibtGerade || offeneSpeicherungen > 0;
}


function begrenzen(wert, min, max) {
  return Math.min(Math.max(wert, min), max);
}


// ============================================
//  ANSICHT: zoomen und verschieben
// ============================================

// Math.max = die Wand füllt den Rahmen immer aus
// Ganze Wand sichtbar - dabei bleiben oben/unten oder
// links/rechts Ränder frei, weil die Verhältnisse
// von Wand und Fenster nicht übereinstimmen.
function passSkala() {
  const breite = rahmen.clientWidth / WAND_BREITE;
  const hoehe = rahmen.clientHeight / WAND_HOEHE;
  return Math.min(breite, hoehe);
}


// Wand füllt den Rahmen randlos aus - dafür ragt sie
// über einen Rand hinaus. Das ist die Standardansicht.
function deckSkala() {
  const breite = rahmen.clientWidth / WAND_BREITE;
  const hoehe = rahmen.clientHeight / WAND_HOEHE;

  // Ein Tausendstel Zugabe: bei krummen Zoomstufen bleibt
  // sonst durch Rundung ein halber Pixel Spalt am Rand.
  return Math.max(breite, hoehe) * 1.001;
}


// Untere Grenze fürs Zoomen.
// Normalerweise deckSkala - dann gibt es nie Flächen,
// auf denen man nichts anlegen kann.
// Nur im Übersichtsmodus (Knopf ⛶) darf weiter heraus
// gezoomt werden, um die ganze Wand zu sehen.
let uebersicht = false;

function minSkala() {
  return uebersicht ? passSkala() : deckSkala();
}


function ansichtAnwenden() {
  // Sobald wieder hineingezoomt wird, endet der Übersichtsmodus
  if (uebersicht && skala > deckSkala()) {
    uebersicht = false;
  }

  skala = begrenzen(skala, minSkala(), MAX_SKALA);

  const sichtbareBreite = WAND_BREITE * skala;
  const sichtbareHoehe = WAND_HOEHE * skala;

  if (sichtbareBreite <= rahmen.clientWidth) {
    versatzX = (rahmen.clientWidth - sichtbareBreite) / 2;
  } else {
    versatzX = begrenzen(versatzX, rahmen.clientWidth - sichtbareBreite, 0);
  }

  if (sichtbareHoehe <= rahmen.clientHeight) {
    versatzY = (rahmen.clientHeight - sichtbareHoehe) / 2;
  } else {
    versatzY = begrenzen(versatzY, rahmen.clientHeight - sichtbareHoehe, 0);
  }

  wand.style.transform =
    'translate(' + versatzX + 'px, ' + versatzY + 'px) scale(' + skala + ')';
}


function zuWand(clientX, clientY) {
  const kasten = rahmen.getBoundingClientRect();
  return {
    x: (clientX - kasten.left - versatzX) / skala,
    y: (clientY - kasten.top - versatzY) / skala
  };
}


function zoomenAufPunkt(neueSkala, clientX, clientY) {
  const kasten = rahmen.getBoundingClientRect();
  const vorher = zuWand(clientX, clientY);

  // Wer unter die Deckung zoomt, will die Übersicht -
  // egal ob mit Knopf, Mausrad oder zwei Fingern
  if (neueSkala < deckSkala()) {
    uebersicht = true;
  }

  skala = begrenzen(neueSkala, passSkala(), MAX_SKALA);

  versatzX = (clientX - kasten.left) - vorher.x * skala;
  versatzY = (clientY - kasten.top) - vorher.y * skala;

  ansichtAnwenden();
}


// Knopf ⛶ - Übersicht: die ganze Wand auf einmal.
// Dabei bleiben oben/unten oder links/rechts Ränder frei;
// das ist hier gewollt und endet, sobald man hineinzoomt.
function allesZeigen() {
  uebersicht = true;
  skala = passSkala();
  ansichtAnwenden();
}


// Beim Öffnen: Rahmen randlos gefüllt
function standardAnsicht() {
  skala = deckSkala();
  ansichtAnwenden();
}


document.querySelector('#zoomRein').addEventListener('click', function () {
  const kasten = rahmen.getBoundingClientRect();
  zoomenAufPunkt(skala * ZOOM_SCHRITT,
    kasten.left + rahmen.clientWidth / 2,
    kasten.top + rahmen.clientHeight / 2);
});

document.querySelector('#zoomRaus').addEventListener('click', function () {
  const kasten = rahmen.getBoundingClientRect();
  zoomenAufPunkt(skala / ZOOM_SCHRITT,
    kasten.left + rahmen.clientWidth / 2,
    kasten.top + rahmen.clientHeight / 2);
});

document.querySelector('#zoomAlles').addEventListener('click', allesZeigen);


rahmen.addEventListener('wheel', function (event) {
  if (!event.ctrlKey) {
    return;
  }
  event.preventDefault();
  zoomenAufPunkt(skala * (event.deltaY < 0 ? 1.1 : 0.9), event.clientX, event.clientY);
}, { passive: false });


// ============================================
//  Finger-Gesten
// ============================================

const zeiger = new Map();
let gesteStart = null;


function abstandVon(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}


rahmen.addEventListener('pointerdown', function (event) {
  zeiger.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (zeiger.size === 2) {
    zoomGeste = true;
    ziehtGerade = false;

    const punkte = Array.from(zeiger.values());
    const mitteX = (punkte[0].x + punkte[1].x) / 2;
    const mitteY = (punkte[0].y + punkte[1].y) / 2;

    gesteStart = {
      abstand: abstandVon(punkte[0], punkte[1]),
      skala: skala,
      mitte: zuWand(mitteX, mitteY)
    };
  }
}, true);


rahmen.addEventListener('pointermove', function (event) {
  if (!zeiger.has(event.pointerId)) {
    return;
  }

  zeiger.set(event.pointerId, { x: event.clientX, y: event.clientY });

  if (zeiger.size !== 2 || !gesteStart || gesteStart.abstand === 0) {
    return;
  }

  event.preventDefault();

  const punkte = Array.from(zeiger.values());
  const jetzt = abstandVon(punkte[0], punkte[1]);

  const kasten = rahmen.getBoundingClientRect();
  const mitteX = (punkte[0].x + punkte[1].x) / 2;
  const mitteY = (punkte[0].y + punkte[1].y) / 2;

  const ziel = gesteStart.skala * (jetzt / gesteStart.abstand);

  // Auseinanderziehen bis zur vollen Übersicht erlauben
  if (ziel < deckSkala()) {
    uebersicht = true;
  }

  skala = begrenzen(ziel, passSkala(), MAX_SKALA);

  versatzX = (mitteX - kasten.left) - gesteStart.mitte.x * skala;
  versatzY = (mitteY - kasten.top) - gesteStart.mitte.y * skala;

  ansichtAnwenden();
}, true);


function gesteBeenden(event) {
  zeiger.delete(event.pointerId);

  if (zeiger.size < 2) {
    gesteStart = null;

    if (zeiger.size === 0) {
      zoomGeste = false;
    }
  }
}

rahmen.addEventListener('pointerup', gesteBeenden, true);
rahmen.addEventListener('pointercancel', gesteBeenden, true);


wand.addEventListener('pointerdown', function (event) {
  if (event.target !== wand || zeiger.size > 1) {
    return;
  }

  const startX = event.clientX;
  const startY = event.clientY;
  const startVersatzX = versatzX;
  const startVersatzY = versatzY;

  function schieben(bewegEvent) {
    if (zoomGeste) {
      return;
    }
    versatzX = startVersatzX + (bewegEvent.clientX - startX);
    versatzY = startVersatzY + (bewegEvent.clientY - startY);
    ansichtAnwenden();
  }

  function schiebenFertig(endEvent) {
    window.removeEventListener('pointermove', schieben);
    window.removeEventListener('pointerup', schiebenFertig);
    window.removeEventListener('pointercancel', schiebenFertig);

    if (!endEvent || zoomGeste) {
      return;
    }

    // Kaum bewegt? Dann war es ein Tipp und kein Schieben.
    const weg = Math.abs(endEvent.clientX - startX) +
                Math.abs(endEvent.clientY - startY);

    if (weg > TIPP_TOLERANZ) {
      return;
    }

    if (istDoppeltipp(endEvent.clientX, endEvent.clientY)) {
      neueNotizAn(endEvent.clientX, endEvent.clientY);
    }
  }

  window.addEventListener('pointermove', schieben);
  window.addEventListener('pointerup', schiebenFertig);
  window.addEventListener('pointercancel', schiebenFertig);
});


window.addEventListener('resize', ansichtAnwenden);


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
    rahmen.appendChild(messNotiz);
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
//  Links und Bilder im Notiztext
// ============================================

const URL_MUSTER = /(https?:\/\/[^\s]+)/g;
const BILD_ENDUNGEN = /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?.*)?$/i;


// ===== Befehle =====
// Wer "/merz" schreibt, bekommt das Bild statt des Textes.
// Neue Befehle einfach hier ergänzen - das Bild muss in
// public/bilder/ liegen.
const BEFEHLE = {
  '/merz': '/bilder/merz.png',
  '/trump': '/bilder/trump.png'
};


// Findet Adressen UND Befehle in einem Durchgang.
// Die Adresse steht zuerst, damit die Schrägstriche in
// "https://" nicht als Befehl missverstanden werden.
const TEILE_MUSTER = /(https?:\/\/[^\s]+|\/[a-zA-Z0-9_-]+)/g;


// Liefert die Bildadresse für einen Textbaustein -
// oder null, wenn es kein Bild ist.
function bildAdresseVon(teil) {
  const befehl = BEFEHLE[teil.toLowerCase()];

  if (befehl) {
    return befehl;
  }

  if (/^https?:\/\//i.test(teil) && BILD_ENDUNGEN.test(teil)) {
    return teil;
  }

  return null;
}


function hatBild(nachricht) {
  const treffer = nachricht.match(TEILE_MUSTER);

  if (!treffer) {
    return false;
  }
  return treffer.some(function (teil) {
    return bildAdresseVon(teil) !== null;
  });
}


// Besteht die Notiz NUR aus einem Befehl?
// Dann wird sie als reines Bild dargestellt.
function istNurBefehl(nachricht) {
  return BEFEHLE[nachricht.trim().toLowerCase()] !== undefined;
}


function linkBauen(adresse) {
  const link = document.createElement('a');
  link.className = 'notizLink';
  link.href = adresse;
  link.textContent = adresse;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}


// Wie hoch ist der Inhalt wirklich?
// Der Absatz wird kurz freigestellt, gemessen und
// wieder zurückgesetzt. So erfährt man auch, wenn
// er KLEINER ist als der Platz - anders als bei
// scrollHeight allein.
function inhaltHoehe(element) {
  const altBottom = element.style.bottom;
  const altHeight = element.style.height;
  const altOverflow = element.style.overflowY;

  element.style.bottom = 'auto';
  element.style.height = 'auto';
  element.style.overflowY = 'visible';

  const hoehe = element.scrollHeight;

  element.style.bottom = altBottom;
  element.style.height = altHeight;
  element.style.overflowY = altOverflow;

  return hoehe;
}


// Setzt die Notizhöhe exakt auf das, was der Inhalt braucht.
// Wächst UND schrumpft - dadurch bleibt bei Bildern kein
// leerer Raum mehr übrig.
function hoeheAnpassen(notiz, inhalt) {
  // Reine Befehlsbilder haben rundum denselben schmalen Rand,
  // normale Notizen brauchen oben Platz für den Namen.
  const nurBild = notiz.classList.contains('nurBild');

  const oben = nurBild ? BILD_RAND : TEXT_OBEN;
  const unten = nurBild ? BILD_RAND : TEXT_UNTEN;

  const noetig = inhaltHoehe(inhalt)
               + 2 * RAHMEN + oben + unten + SICHERHEIT;

  const kleinste = nurBild ? BILD_MIN_HOEHE : MIN_HOEHE;

  notiz.style.height = begrenzen(Math.ceil(noetig), kleinste, MAX_HOEHE) + 'px';
}


// Baut den Notizinhalt aus Text, Links und Bildern.
// Alles über createElement und createTextNode - niemals
// über innerHTML, sonst könnte jemand HTML einschleusen.
function inhaltAufbauen(absatz, nachricht, notiz) {
  const teile = nachricht.split(TEILE_MUSTER);

  teile.forEach(function (teil) {
    if (!teil) {
      return;
    }

    const bildAdresse = bildAdresseVon(teil);

    // Befehl oder Bildadresse -> als Bild anzeigen
    if (bildAdresse) {
      const bild = document.createElement('img');
      bild.className = 'notizBild';
      bild.src = bildAdresse;
      bild.alt = teil;
      bild.loading = 'lazy';
      bild.referrerPolicy = 'no-referrer';

      // Sonst startet der Browser sein eigenes Bild-Ziehen
      // und unser Verschieben bekommt keine Ereignisse mehr
      bild.draggable = false;

      // Seitenverhältnis von früher schon bekannt?
      // Dann steht die Höhe sofort fest und die Notiz
      // klappt nicht erst zusammen und wieder auf.
      const mass = bildMasse.get(bildAdresse);

      if (mass) {
        bild.style.aspectRatio = mass.breite + ' / ' + mass.hoehe;
      }

      // Bilder laden verzögert - danach Höhe neu setzen
      bild.addEventListener('load', function () {
        if (bild.naturalWidth && bild.naturalHeight) {
          bildMasse.set(bildAdresse, {
            breite: bild.naturalWidth,
            hoehe: bild.naturalHeight
          });

          bild.style.aspectRatio =
            bild.naturalWidth + ' / ' + bild.naturalHeight;
        }

        hoeheAnpassen(notiz, absatz);
      });

      // Bild fehlt -> stattdessen den ursprünglichen Text zeigen
      bild.addEventListener('error', function () {
        bild.replaceWith(document.createTextNode(teil));
        hoeheAnpassen(notiz, absatz);
      });

      absatz.appendChild(bild);
      return;
    }

    // Sonstiger Link -> anklickbar
    if (/^https?:\/\//i.test(teil)) {
      absatz.appendChild(linkBauen(teil));
      return;
    }

    // Alles andere ist normaler Text
    absatz.appendChild(document.createTextNode(teil));
  });
}


// ============================================
//  WÄNDE
// ============================================

function zeitraumText(beginn, ende) {
  const einstellung = { day: 'numeric', month: 'short' };
  const von = new Date(beginn);
  const bis = new Date(new Date(ende).getTime() - 1);

  return von.toLocaleDateString('de-DE', einstellung)
       + ' – ' + bis.toLocaleDateString('de-DE', einstellung);
}


async function waendeLaden() {
  try {
    const antwort = await fetch('/api/waende');

    if (!antwort.ok) {
      throw new Error('Status ' + antwort.status);
    }

    const daten = await antwort.json();
    waende = daten.waende;
    aktuelleWandId = daten.aktuell;

    const gibtsNoch = waende.some(function (w) {
      return w.id === gewaehlteWandId;
    });

    if (!gewaehlteWandId || !gibtsNoch) {
      gewaehlteWandId = aktuelleWandId;
    }

    waendeAnzeigen();

  } catch (fehler) {
    statusSetzen('Wände konnten nicht geladen werden.');
    console.error(fehler);
  }
}


function waendeAnzeigen() {
  waendeLeiste.innerHTML = '';

  waende.forEach(function (eintrag) {
    const knopf = document.createElement('button');
    knopf.className = 'wandKnopf';

    if (eintrag.id === gewaehlteWandId) {
      knopf.classList.add('gewaehlt');
    }
    if (eintrag.id === aktuelleWandId) {
      knopf.classList.add('istAktuell');
    }

    const titel = document.createElement('span');
    titel.className = 'wandTitel';
    titel.textContent = zeitraumText(eintrag.beginn, eintrag.ende);

    const anzahl = document.createElement('span');
    anzahl.className = 'wandZeitraum';
    anzahl.textContent = eintrag.anzahl + ' Notizen';

    knopf.appendChild(titel);
    knopf.appendChild(anzahl);

    knopf.addEventListener('click', function () {
      if (gewaehlteWandId === eintrag.id) {
        return;
      }
      gewaehlteWandId = eintrag.id;
      waendeAnzeigen();
      notizenHolen();
    });

    waendeLeiste.appendChild(knopf);
  });

  rahmen.classList.toggle('nurLesen', nurLesen());
}


// ============================================
//  Daten vom Server
// ============================================

async function notizenHolen() {
  if (beschaeftigt()) {
    nachholenNoetig = true;
    return;
  }

  if (!gewaehlteWandId) {
    return;
  }

  try {
    const antwort = await fetch('/api/zettel?wand=' + encodeURIComponent(gewaehlteWandId));

    if (!antwort.ok) {
      throw new Error('Status ' + antwort.status);
    }

    notizen = await antwort.json();
    statusSetzen(nurLesen() ? 'Chronik – nur zum Ansehen' : '');
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

  // Bilder brauchen von Anfang an mehr Platz
  const breite = hatBild(text)
    ? Math.max(groesse.breite, BILD_MIN_BREITE)
    : groesse.breite;

  try {
    const antwort = await fetch('/api/zettel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nachricht: text,
        x: x,
        y: y,
        breite: breite,
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

    // Die gleich folgende Server-Meldung stammt von uns selbst
    eigeneAenderungBis = Date.now() + 1500;

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

    await waendeLaden();
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
    const mitBild = hatBild(eintrag.nachricht);
    const nurBild = istNurBefehl(eintrag.nachricht);

    // Bildnotizen dürfen bis zur vollen Breite gezogen werden.
    // Reine Befehlsbilder behalten ihre Größe.
    const maxBreite = mitBild ? MAX_BREITE : auto.maxBreite;

    const breite = begrenzen(eintrag.breite, MIN_BREITE, maxBreite);

    const notiz = document.createElement('div');
    notiz.className = 'notiz ' + eintrag.farbe + (nurBild ? ' nurBild' : '');

    notiz.style.left = begrenzen(eintrag.x, 0, WAND_BREITE - breite) + 'px';
    notiz.style.top = begrenzen(eintrag.y, 0, WAND_HOEHE - MIN_HOEHE) + 'px';
    notiz.style.width = breite + 'px';
    notiz.style.height = passendeHoehe(eintrag.nachricht, breite) + 'px';

    notiz.style.zIndex = 10 + nummer;
    obersteEbene = Math.max(obersteEbene, 10 + nummer);

    const text = document.createElement('p');
    inhaltAufbauen(text, eintrag.nachricht, notiz);

    // Reine Befehlsbilder: kein Name, kein Löschknopf.
    // Gelöscht wird dort per Doppelklick.
    if (!nurBild) {
      const autor = document.createElement('small');
      autor.textContent = eintrag.name;
      notiz.appendChild(autor);

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

    } else if (eintrag.darf_loeschen && !nurLesen()) {
      // Gelöscht wird per Doppeltipp - erkannt in ziehenAktivieren
      notiz.title = 'Zweimal antippen zum Entfernen';
    }

    notiz.appendChild(text);

    wand.appendChild(notiz);

    // Höhe exakt auf den Inhalt setzen (wächst und schrumpft)
    hoeheAnpassen(notiz, text);

    eintrag.breite = breite;
    eintrag.hoehe = notiz.offsetHeight;
    eintrag.maxBreite = maxBreite;
    eintrag.mitBild = mitBild;
    eintrag.nurBild = nurBild;
    eintrag.absatz = text;

    if (!nurLesen()) {
      ziehenAktivieren(notiz, eintrag);
    }
  });

  ansichtAnwenden();
}


// ============================================
//  Verschieben und Breitenziehen
// ============================================

function ziehenAktivieren(element, eintrag) {

  element.addEventListener('pointerdown', function (event) {

    if (event.target.classList.contains('loeschen')) {
      return;
    }

    // Links anklickbar lassen
    if (event.target.tagName === 'A') {
      return;
    }

    if (zoomGeste || zeiger.size > 1) {
      return;
    }

    obersteEbene = obersteEbene + 1;
    element.style.zIndex = obersteEbene;

    const kasten = element.getBoundingClientRect();

    // Reine Befehlsbilder behalten ihre Größe -
    // dort gibt es keinen Ziehgriff.
    // Die Griffzone in Bildschirmpixeln. Bei kleinem Zoom
    // wäre GRIFF_ZONE * skala nur eine Handvoll Pixel -
    // mit dem Finger nicht zu treffen. Deshalb ein Mindestmaß.
    const mindestZone = event.pointerType === 'mouse' ? 24 : 40;

    // ... aber nie mehr als ein Viertel der Notiz, sonst
    // erwischt man bei kleinen Zetteln immer die Ecke
    // statt sie verschieben zu können.
    const obergrenze = Math.min(kasten.width, kasten.height) * 0.25;

    const zone = Math.min(
      Math.max(GRIFF_ZONE * skala, mindestZone),
      obergrenze
    );

    const inEcke = !eintrag.nurBild &&
                   event.clientX > kasten.right - zone &&
                   event.clientY > kasten.bottom - zone;

    ziehtGerade = true;
    element.setPointerCapture(event.pointerId);
    element.classList.add('wirdGezogen');

    // ---------- Fall 1: Breite ändern ----------
    if (inEcke) {
      const startX = event.clientX;
      const startBreite = element.offsetWidth;

      function breiteBewegen(bewegEvent) {
        if (zoomGeste) {
          return;
        }

        const verschiebung = (bewegEvent.clientX - startX) / skala;

        let neueBreite = Math.round(startBreite + verschiebung);
        neueBreite = begrenzen(neueBreite, MIN_BREITE, eintrag.maxBreite);
        neueBreite = Math.min(neueBreite, WAND_BREITE - eintrag.x);

        element.style.width = neueBreite + 'px';

        // Höhe folgt dem Inhalt - bei Bildern und bei Text
        hoeheAnpassen(element, eintrag.absatz);
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
    const start = zuWand(event.clientX, event.clientY);
    const griffX = start.x - eintrag.x;
    const griffY = start.y - eintrag.y;

    // Für die Doppeltipp-Erkennung beim Löschen
    const tippStartX = event.clientX;
    const tippStartY = event.clientY;

    let letzteX = eintrag.x;
    let letzteY = eintrag.y;


    function bewegen(bewegEvent) {
      if (zoomGeste) {
        return;
      }

      const punkt = zuWand(bewegEvent.clientX, bewegEvent.clientY);

      let neuX = punkt.x - griffX;
      let neuY = punkt.y - griffY;

      neuX = begrenzen(neuX, 0, WAND_BREITE - element.offsetWidth);
      neuY = begrenzen(neuY, 0, WAND_HOEHE - element.offsetHeight);

      neuX = Math.round(neuX);
      neuY = Math.round(neuY);

      element.style.left = neuX + 'px';
      element.style.top = neuY + 'px';

      letzteX = neuX;
      letzteY = neuY;
    }


    function loslassen(endEvent) {
      element.removeEventListener('pointermove', bewegen);
      element.removeEventListener('pointerup', loslassen);
      element.removeEventListener('pointercancel', loslassen);

      element.classList.remove('wirdGezogen');
      ziehtGerade = false;

      // Befehlsbilder: zweimal antippen entfernt sie.
      // Nur wenn dabei kaum bewegt wurde.
      if (endEvent && eintrag.nurBild && eintrag.darf_loeschen) {
        const weg = Math.abs(endEvent.clientX - tippStartX) +
                    Math.abs(endEvent.clientY - tippStartY);

        if (weg <= TIPP_TOLERANZ) {
          if (letzteNotizId === eintrag.id &&
              Date.now() - letzterNotizTipp < DOPPEL_ZEIT) {

            letzterNotizTipp = 0;
            letzteNotizId = null;
            notizLoeschen(eintrag.id);
            return;
          }

          letzterNotizTipp = Date.now();
          letzteNotizId = eintrag.id;
        }
      }

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

  obersteEbene = obersteEbene + 1;
  notiz.style.zIndex = obersteEbene;

  const autor = document.createElement('small');
  autor.textContent =
    (typeof angemeldeterName !== 'undefined' && angemeldeterName)
      ? angemeldeterName
      : 'Anonym';

  const feld = document.createElement('textarea');
  feld.maxLength = MAX_ZEICHEN;
  feld.placeholder = 'Text eingeben...';


  // Breite aus der Textlänge, Höhe direkt aus dem
  // Eingabefeld gemessen - dadurch sitzt es exakt.
  function groesseAnpassen() {
    const text = feld.value === '' ? ' ' : feld.value;

    const auto = groesseFuerText(text);
    let breite = auto.breite;

    if (hatBild(feld.value)) {
      breite = Math.max(breite, BILD_MIN_BREITE);
    }

    breite = Math.min(breite, WAND_BREITE - x);
    notiz.style.width = breite + 'px';

    hoeheAnpassen(notiz, feld);
  }

  feld.addEventListener('input', groesseAnpassen);


  notiz.appendChild(autor);
  notiz.appendChild(feld);
  wand.appendChild(notiz);

  groesseAnpassen();
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
    await waendeLaden();
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


// ============================================
//  Doppeltippen auf die freie Fläche = neue Notiz
//
//  Wir werten das selbst aus, statt "dblclick" zu
//  benutzen: Auf dem iPhone kommt dieses Ereignis
//  bei touch-action: none oft gar nicht an.
// ============================================

const DOPPEL_ZEIT = 400;     // Millisekunden zwischen zwei Tippern
const DOPPEL_ABSTAND = 30;   // erlaubte Abweichung in Pixeln
const TIPP_TOLERANZ = 8;     // darüber gilt es als Ziehen, nicht als Tipp

let letzterTipp = 0;
let letzterTippX = 0;
let letzterTippY = 0;

// Doppeltipp auf ein Befehlsbild (zum Entfernen)
let letzterNotizTipp = 0;
let letzteNotizId = null;

// Nach eigenen Änderungen kurz nicht neu zeichnen -
// sonst flackert die Wand bei jedem Verschieben
let eigeneAenderungBis = 0;


function istDoppeltipp(x, y) {
  const jetzt = Date.now();

  const nahGenug = Math.abs(x - letzterTippX) < DOPPEL_ABSTAND &&
                   Math.abs(y - letzterTippY) < DOPPEL_ABSTAND;

  if (jetzt - letzterTipp < DOPPEL_ZEIT && nahGenug) {
    letzterTipp = 0;         // zurücksetzen, sonst zählt der dritte Tipp mit
    return true;
  }

  letzterTipp = jetzt;
  letzterTippX = x;
  letzterTippY = y;
  return false;
}


function neueNotizAn(clientX, clientY) {
  if (nurLesen()) {
    statusSetzen('Ältere Wände sind nur zum Ansehen.');
    return;
  }

  const punkt = zuWand(clientX, clientY);

  const x = begrenzen(punkt.x - NOTIZ_BREITE / 2, 0, WAND_BREITE - NOTIZ_BREITE);
  const y = begrenzen(punkt.y - NOTIZ_HOEHE / 2, 0, WAND_HOEHE - NOTIZ_HOEHE);

  notizfeldOeffnen(Math.round(x), Math.round(y));
}


// ============================================
//  Live-Verbindung zum Server
// ============================================

const ereignisse = new EventSource('/api/ereignisse');

ereignisse.addEventListener('message', function () {
  // Die Meldung stammt von unserer eigenen Änderung -
  // die Wand steht hier schon richtig, neu zeichnen
  // würde nur Bilder kurz verschwinden lassen.
  if (Date.now() < eigeneAenderungBis) {
    return;
  }

  notizenHolen();
});

ereignisse.addEventListener('error', function () {
  console.log('Live-Verbindung unterbrochen, wird neu aufgebaut...');
});

window.addEventListener('focus', function () {
  waendeLaden().then(notizenHolen);
});


// ============================================
//  Start
// ============================================

standardAnsicht();

waendeLaden().then(function () {
  notizenHolen();
});

setInterval(waendeLaden, 60 * 60 * 1000);
