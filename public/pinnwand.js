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

// Eigene, großzügigere Grenzen für gemalte Zettel.
// Müssen zu .notiz in style.css und zu server.js passen.
const BILD_MAX_BREITE = 700;
const BILD_MAX_HOEHE = 700;

// Reine Befehlsbilder: schmaler Rand rundum, kein Name,
// kein Löschknopf, keine Größenänderung
const BILD_RAND = 0;

// Anzeigebreite der Befehlsbilder. Hochkant-Bilder brauchen
// weniger Breite, um gleich hoch zu wirken.
const BEFEHL_BREITE = 240;

// ACHTUNG: Diese Liste gehört zu BEFEHLE (weiter unten,
// bei "===== Befehle ====="). Ein neuer Kopf braucht IMMER
// einen Eintrag in beiden Listen.
// Breite ausrechnen:  163 * (Bildbreite / Bildhöhe)
// Dann sind alle Köpfe etwa gleich hoch.
const BEFEHL_BREITEN = {
  '/merz': 120,     // hochkant (250 x 348)
  '/trump': 240,    // querformat (1419 x 946)
  '/kim': 110,      // hochkant (1024 x 1536)
  '/china': 160     // fast quadratisch (824 x 841)
};


function befehlsBreite(nachricht) {
  const wert = BEFEHL_BREITEN[nachricht.trim().toLowerCase()];
  return wert ? wert : BEFEHL_BREITE;
}

// Höhe der Knopfzeile beim Schreiben einer neuen Notiz.
// Muss zu .notizAbschluss in style.css passen.
const KNOPF_ZEILE = 40;

// So breit muss eine Notiz beim Schreiben mindestens sein,
// damit "Anpinnen" und "Abbrechen" nebeneinander passen
const NEU_MIN_BREITE = 215;
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

// Zuordnung Notiz-Kennung -> Element, damit fremde
// Bewegungen gezielt zugestellt werden können
const notizElemente = new Map();

// Zufällige Kennung dieses Browsers. Damit erkennen wir
// unsere eigenen Meldungen und ignorieren sie.
const KLIENT_ID = Math.random().toString(36).slice(2);

// Wie oft die eigene Bewegung gemeldet wird
const MELDE_ABSTAND = 70;   // Millisekunden

let messNotiz = null;
let messAbsatz = null;


function statusSetzen(text) {
  statusZeile.textContent = text;
}


function nurLesen() {
  return gewaehlteWandId !== aktuelleWandId;
}


function beschaeftigt() {
  // Auch während fliegende Köpfe unterwegs sind, darf die Wand
  // nicht neu geladen werden: Ihre Position steht nur im
  // Arbeitsspeicher, in der Datenbank noch die alte. Ein
  // Neuladen würde sie zurück an den Start setzen.
  return ziehtGerade || schreibtGerade
      || offeneSpeicherungen > 0
      || physikLaeuft;
}


// Bringt jeden Winkel in den Bereich 0 bis 359.
// -90 wird zu 270, 725 wird zu 5. Das Modulo allein
// reicht nicht: In JavaScript ist -90 % 360 gleich -90,
// deshalb einmal 360 addieren und erneut teilen.
function winkelNormal(grad) {
  // Erst runden, dann in den Bereich holen. Andersherum
  // würde aus 359,6 die 360 - und die gibt es hier nicht.
  return ((Math.round(grad) % 360) + 360) % 360;
}


// Kurze Pause zum Abwarten. setTimeout kann kein await,
// deshalb einmal in ein Versprechen eingepackt.
function neuerVersuchWarten(millisekunden) {
  return new Promise(function (fertig) {
    setTimeout(fertig, millisekunden);
  });
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

  // Ragt die Wand nur um ein paar Pixel über den Rahmen
  // hinaus, wird sie mittig festgesetzt. Sonst ließe sie
  // sich um diesen Rest hin und her zappeln.
  const RUHE = 4;

  if (sichtbareBreite - rahmen.clientWidth <= RUHE) {
    versatzX = Math.round((rahmen.clientWidth - sichtbareBreite) / 2);
  } else {
    versatzX = begrenzen(versatzX, rahmen.clientWidth - sichtbareBreite, 0);
  }

  if (sichtbareHoehe - rahmen.clientHeight <= RUHE) {
    versatzY = Math.round((rahmen.clientHeight - sichtbareHoehe) / 2);
  } else {
    versatzY = begrenzen(versatzY, rahmen.clientHeight - sichtbareHoehe, 0);
  }

  wand.style.transform =
    'translate(' + versatzX + 'px, ' + versatzY + 'px) scale(' + skala + ')';

  // Passt die Wand ganz in den Rahmen, gibt es nichts zu
  // verschieben - dann soll der Finger auf der freien Fläche
  // wieder die Seite scrollen. "pan-y" überlässt dem Browser
  // nur das senkrechte Scrollen; das Zoomen mit zwei Fingern
  // bleibt bei uns.
  const kannWaagerecht = sichtbareBreite - rahmen.clientWidth > RUHE;
  const kannSenkrecht = sichtbareHoehe - rahmen.clientHeight > RUHE;

  // Nur wenn es senkrecht wirklich etwas zu verschieben gibt,
  // nehmen wir dem Browser das Scrollen weg. Sonst bleiben
  // Bereiche übrig, in denen der Finger nichts bewirkt.
  rahmen.style.touchAction = kannSenkrecht ? 'none' : 'pan-y';
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
//
// Neuen Kopf hinzufügen - drei Schritte:
//   1. Bild nach public/bilder/ legen (klein rechnen, < 200 KB)
//   2. Hier eintragen - Dateiname EXAKT, auch die Endung
//   3. Breite in BEFEHL_BREITEN eintragen (ganz oben in dieser Datei)
// Alles Weitere (Anstoßen, Fliegen, Drehen, Löschen per
// Doppeltipp) passiert von allein.
const BEFEHLE = {
  '/merz': '/bilder/merz.png',
  '/trump': '/bilder/trump.png',
  '/kim': '/bilder/kim.png',
  '/china': '/bilder/china.jpg'
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


// Wie breit darf eine Notiz mit diesem Bild höchstens sein,
// damit das Bild noch vollständig in die erlaubte Höhe passt?
// Sonst würde es abgeschnitten und der Text bekäme eine
// Bildlaufleiste.
function maxBreiteFuerBild(bildBreite, bildHoehe) {
  if (!bildBreite || !bildHoehe) {
    return BILD_MAX_BREITE;
  }

  // Zwei Pixel Abstand zur Obergrenze, damit die Höhe
  // nie genau anschlägt und eine Leiste erzeugt
  const innenHoehe =
    BILD_MAX_HOEHE - 2 * RAHMEN - TEXT_OBEN - TEXT_UNTEN - SICHERHEIT - 2;

  const innenBreite = innenHoehe * (bildBreite / bildHoehe);

  const passend = Math.floor(innenBreite) + 2 * RAHMEN + TEXT_LINKS + TEXT_RECHTS;

  return begrenzen(passend, MIN_BREITE, BILD_MAX_BREITE);
}


// Zeigt eine gemalte Notiz an. Die Bilddaten kommen
// über eine eigene Adresse, nicht mit der Notizliste.
function zeichnungAnzeigen(absatz, eintrag, notiz) {
  const adresse = '/api/zettel/' + eintrag.id + '/zeichnung';

  const bild = document.createElement('img');
  bild.className = 'notizBild';
  bild.src = adresse;
  bild.alt = 'Gemalte Notiz';
  bild.draggable = false;

  const mass = bildMasse.get(adresse);

  if (mass) {
    bild.style.aspectRatio = mass.breite + ' / ' + mass.hoehe;
  }

  bild.addEventListener('load', function () {
    if (bild.naturalWidth && bild.naturalHeight) {
      bildMasse.set(adresse, {
        breite: bild.naturalWidth,
        hoehe: bild.naturalHeight
      });

      bild.style.aspectRatio =
        bild.naturalWidth + ' / ' + bild.naturalHeight;

      // Jetzt ist das Seitenverhältnis bekannt - damit steht
      // fest, wie breit die Notiz höchstens werden darf
      eintrag.maxBreite = maxBreiteFuerBild(bild.naturalWidth, bild.naturalHeight);

      if (notiz.offsetWidth > eintrag.maxBreite) {
        notiz.style.width = eintrag.maxBreite + 'px';
      }
    }

    hoeheAnpassen(notiz, absatz);
  });

  absatz.appendChild(bild);
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

  // Beim Schreiben braucht es unten Platz für die Knöpfe
  const knopfzeile = notiz.classList.contains('neu') ? KNOPF_ZEILE : 0;

  const noetig = inhaltHoehe(inhalt)
               + 2 * RAHMEN + oben + unten + SICHERHEIT + knopfzeile;

  const kleinste = nurBild ? BILD_MIN_HOEHE : MIN_HOEHE;

  // Gemalte Zettel dürfen höher werden als Textzettel
  const groesste = notiz.classList.contains('mitZeichnung')
    ? BILD_MAX_HOEHE
    : MAX_HOEHE;

  notiz.style.height = begrenzen(Math.ceil(noetig), kleinste, groesste) + 'px';
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


// zeichnung ist eine PNG-Datenadresse oder null
async function notizSpeichern(text, x, y, zeichnung, breiteVor, hoeheVor) {
  const groesse = groesseFuerText(text);

  // Bilder brauchen von Anfang an mehr Platz
  let breite = hatBild(text)
    ? Math.max(groesse.breite, BILD_MIN_BREITE)
    : groesse.breite;

  let hoehe = groesse.hoehe;

  // Bei einer Zeichnung gibt die Leinwand die Größe vor
  if (zeichnung) {
    breite = breiteVor;
    hoehe = hoeheVor;
  }

  try {
    const antwort = await fetch('/api/zettel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nachricht: text,
        x: x,
        y: y,
        breite: breite,
        hoehe: hoehe,
        zeichnung: zeichnung || null
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

  const anfrage = {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x: Math.round(eintrag.x),
      y: Math.round(eintrag.y),
      breite: breite,
      hoehe: hoehe,
      winkel: winkelNormal(eintrag.winkel || 0)
    })
  };

  try {
    let antwort;

    try {
      antwort = await fetch('/api/zettel/' + eintrag.id + '/layout', anfrage);

    } catch (ersterVersuch) {
      // Ein einzelner Aussetzer ist meist der Serverneustart
      // oder eine kurz schwächelnde Verbindung. Einmal
      // nachfassen, bevor wir den Nutzer beunruhigen.
      // Das Wiederholen ist gefahrlos: Die Anfrage setzt
      // feste Werte, sie rechnet nichts dazu.
      await neuerVersuchWarten(400);
      antwort = await fetch('/api/zettel/' + eintrag.id + '/layout', anfrage);
    }

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

    // Nur übernehmen, wenn der Server wirklich einen Winkel
    // schickt. Sonst würde ein alter Server (der die Spalte
    // noch nicht kennt) unser gutes "37" mit undefined
    // überschreiben - und beim nächsten Speichern ginge
    // eine 0 in die Datenbank.
    if (daten.winkel !== undefined && daten.winkel !== null) {
      eintrag.winkel = daten.winkel;
      winkelSpeicher.set(eintrag.id, daten.winkel);
    }

    if (element && element.isConnected) {
      element.style.left = daten.x + 'px';
      element.style.top = daten.y + 'px';
    }

  } catch (fehler) {
    // Auch der zweite Versuch ging daneben - jetzt darf
    // es der Nutzer erfahren. Die Meldung verschwindet
    // beim nächsten erfolgreichen Laden von selbst.
    console.error('Layout endgültig fehlgeschlagen', fehler);
    statusSetzen('Verschiebung nicht gespeichert – Verbindung prüfen.');

  } finally {
    offeneSpeicherungen = offeneSpeicherungen - 1;
    nachholenPruefen();
  }
}


// ============================================
//  KLEINE PHYSIK FÜR BEFEHLSBILDER
// ============================================

// Wie viel Schwung pro Bild übrig bleibt (1 = kein Verlust)
const REIBUNG = 0.99;

// Darunter gilt ein Objekt als stehend
const MIN_TEMPO = 0.20;

// Wie stark ein Stoß wirkt
const STOSS_FAKTOR = 1.5;

// Wie viel Schwung beim Abprallen erhalten bleibt
const PRALL = 0.7;

// Höchstgeschwindigkeit, damit nichts durch die Wand schießt
const MAX_TEMPO = 40;

// Wie stark ein außermittiger Stoß ins Drehen versetzt
const DRALL_FAKTOR = 0.25;

// Grad pro Bild, mehr wird schwindelig
const MAX_DREHUNG = 15;

// Alle beweglichen Objekte: Kennung -> Zustand
const koerper = new Map();

// Zuletzt bekannte Drehung je Notiz: Kennung -> Grad.
// Die Datenbank ist die eigentliche Quelle, aber sie
// hinkt hinterher: Zwischen "Kopf bleibt liegen" und
// "PATCH ist durch" liegen einige hundert Millisekunden.
// Wird die Wand genau in dieser Lücke neu aufgebaut,
// stünde der Kopf wieder gerade. Dieses Gedächtnis
// überlebt das Neuaufbauen und schließt die Lücke -
// dasselbe Prinzip wie bildMasse bei den Bildgrößen.
const winkelSpeicher = new Map();

let physikLaeuft = false;


function koerperEintragen(eintrag, element) {
  koerper.set(eintrag.id, {
    eintrag: eintrag,
    element: element,
    vx: 0,
    vy: 0,
    // Die gespeicherte Drehung übernehmen, nicht bei null
    // anfangen - sonst richtet sich der Kopf beim
    // Neuzeichnen wieder auf
    winkel: eintrag.winkel || 0,
    drall: 0,           // Drehgeschwindigkeit in Grad pro Bild
    letzteMeldung: 0,
    inBewegung: false
  });
}


// Überlappen sich zwei Rechtecke?
function ueberlappt(a, b) {
  return a.x < b.x + b.breite &&
         a.x + a.breite > b.x &&
         a.y < b.y + b.hoehe &&
         a.y + a.hoehe > b.y;
}


// Ein bewegtes Rechteck stößt alle Objekte an, die es berührt.
// tempoX/tempoY ist die Geschwindigkeit des Stoßenden.
function anstossen(rechteck, tempoX, tempoY, ausnahmeId) {
  const wucht = Math.sqrt(tempoX * tempoX + tempoY * tempoY);

  if (wucht < 0.5) {
    return;                      // zu langsam, kein Stoß
  }

  koerper.forEach(function (k, id) {
    // Ein Objekt stößt sich nicht selbst an - sonst würde
    // ein festgehaltenes Bild sofort davonfliegen
    if (id === ausnahmeId) {
      return;
    }

    const ziel = {
      x: k.eintrag.x,
      y: k.eintrag.y,
      breite: k.element.offsetWidth,
      hoehe: k.element.offsetHeight
    };

    if (!ueberlappt(rechteck, ziel)) {
      return;
    }

    // Richtung von Mitte zu Mitte
    let dx = (ziel.x + ziel.breite / 2) - (rechteck.x + rechteck.breite / 2);
    let dy = (ziel.y + ziel.hoehe / 2) - (rechteck.y + rechteck.hoehe / 2);

    const laenge = Math.sqrt(dx * dx + dy * dy) || 1;
    dx = dx / laenge;
    dy = dy / laenge;

    // Je schneller der Stoß, desto mehr Schwung
    k.vx = begrenzen(k.vx + dx * wucht * STOSS_FAKTOR, -MAX_TEMPO, MAX_TEMPO);
    k.vy = begrenzen(k.vy + dy * wucht * STOSS_FAKTOR, -MAX_TEMPO, MAX_TEMPO);

    // Drehung: Trifft der Stoß mittig, schiebt er nur.
    // Trifft er seitlich versetzt, dreht er zusätzlich.
    // Das Kreuzprodukt misst genau diesen seitlichen Anteil:
    // es ist null bei geradem Stoß und am größten bei
    // einem Streifschuss.
    const seitlich = dx * tempoY - dy * tempoX;

    k.drall = begrenzen(k.drall + seitlich * DRALL_FAKTOR,
                        -MAX_DREHUNG, MAX_DREHUNG);

    k.inBewegung = true;
    physikStarten();
  });
}


// Zwei fliegende Köpfe stoßen sich gegenseitig ab.
// Anders als bei anstossen() haben hier BEIDE Seiten
// Schwung, den sie miteinander tauschen.
function koerperStossen(a, b) {
  const aBreite = a.element.offsetWidth;
  const aHoehe = a.element.offsetHeight;
  const bBreite = b.element.offsetWidth;
  const bHoehe = b.element.offsetHeight;

  const rechteckA = { x: a.eintrag.x, y: a.eintrag.y, breite: aBreite, hoehe: aHoehe };
  const rechteckB = { x: b.eintrag.x, y: b.eintrag.y, breite: bBreite, hoehe: bHoehe };

  if (!ueberlappt(rechteckA, rechteckB)) {
    return;
  }

  let dx = (b.eintrag.x + bBreite / 2) - (a.eintrag.x + aBreite / 2);
  let dy = (b.eintrag.y + bHoehe / 2) - (a.eintrag.y + aHoehe / 2);

  const laenge = Math.sqrt(dx * dx + dy * dy) || 1;
  dx = dx / laenge;
  dy = dy / laenge;

  // Wie schnell nähern sie sich einander an?
  // Entfernen sie sich bereits voneinander, darf kein
  // zweiter Stoß folgen - sonst kleben sie zitternd
  // aneinander und stoßen sich in jedem Bild erneut.
  const naehern = (a.vx - b.vx) * dx + (a.vy - b.vy) * dy;

  if (naehern <= 0) {
    return;
  }

  // Beide bekommen die halbe Annäherung entgegengesetzt ab
  const stoss = naehern * PRALL;

  a.vx = begrenzen(a.vx - dx * stoss, -MAX_TEMPO, MAX_TEMPO);
  a.vy = begrenzen(a.vy - dy * stoss, -MAX_TEMPO, MAX_TEMPO);
  b.vx = begrenzen(b.vx + dx * stoss, -MAX_TEMPO, MAX_TEMPO);
  b.vy = begrenzen(b.vy + dy * stoss, -MAX_TEMPO, MAX_TEMPO);

  // Auch hier dreht der seitliche Anteil
  const seitlich = dx * (a.vy - b.vy) - dy * (a.vx - b.vx);

  a.drall = begrenzen(a.drall - seitlich * DRALL_FAKTOR, -MAX_DREHUNG, MAX_DREHUNG);
  b.drall = begrenzen(b.drall + seitlich * DRALL_FAKTOR, -MAX_DREHUNG, MAX_DREHUNG);

  a.inBewegung = true;
  b.inBewegung = true;
}


function physikStarten() {
  if (!physikLaeuft) {
    physikLaeuft = true;
    requestAnimationFrame(physikSchritt);
  }
}


function physikSchritt() {
  let nochAktiv = false;

  // Erst prüfen, ob sich Köpfe gegenseitig treffen.
  // Jedes Paar genau einmal: j beginnt bei i + 1,
  // sonst würde A-B und danach B-A doppelt gerechnet.
  const liste = Array.from(koerper.values());

  for (let i = 0; i < liste.length; i++) {
    for (let j = i + 1; j < liste.length; j++) {
      if (liste[i].inBewegung || liste[j].inBewegung) {
        koerperStossen(liste[i], liste[j]);
      }
    }
  }

  koerper.forEach(function (k) {
    if (!k.inBewegung) {
      return;
    }

    const breite = k.element.offsetWidth;
    const hoehe = k.element.offsetHeight;

    let x = k.eintrag.x + k.vx;
    let y = k.eintrag.y + k.vy;

    // An den Rändern abprallen
    if (x < 0) {
      x = 0;
      k.vx = -k.vx * PRALL;
    }
    if (x > WAND_BREITE - breite) {
      x = WAND_BREITE - breite;
      k.vx = -k.vx * PRALL;
    }
    if (y < 0) {
      y = 0;
      k.vy = -k.vy * PRALL;
    }
    if (y > WAND_HOEHE - hoehe) {
      y = WAND_HOEHE - hoehe;
      k.vy = -k.vy * PRALL;
    }

    k.eintrag.x = Math.round(x);
    k.eintrag.y = Math.round(y);

    k.element.style.left = k.eintrag.x + 'px';
    k.element.style.top = k.eintrag.y + 'px';

    // Drehen. Die Position steckt weiterhin in left/top,
    // transform macht ausschließlich die Drehung - so
    // kommen sich beide nicht in die Quere.
    k.winkel = winkelNormal(k.winkel + k.drall);
    k.eintrag.winkel = k.winkel;
    winkelSpeicher.set(k.eintrag.id, k.winkel);
    k.element.style.transform = 'rotate(' + k.winkel + 'deg)';

    // Reibung bremst - auch die Drehung
    k.vx = k.vx * REIBUNG;
    k.vy = k.vy * REIBUNG;
    k.drall = k.drall * REIBUNG;

    // Andere Geräte mitziehen lassen
    const jetzt = Date.now();

    if (jetzt - k.letzteMeldung > MELDE_ABSTAND) {
      k.letzteMeldung = jetzt;
      bewegungMelden(k.eintrag.id, k.eintrag.x, k.eintrag.y, null, null, k.winkel);
    }

    // Steht es fast still, ist Schluss - und die
    // Endposition wird einmal gespeichert
    if (Math.abs(k.vx) < MIN_TEMPO && Math.abs(k.vy) < MIN_TEMPO
        && Math.abs(k.drall) < MIN_TEMPO) {
      k.vx = 0;
      k.vy = 0;
      k.drall = 0;
      k.inBewegung = false;
      layoutSpeichern(k.eintrag, k.element);
      return;
    }

    nochAktiv = true;
  });

  if (nochAktiv) {
    requestAnimationFrame(physikSchritt);
  } else {
    physikLaeuft = false;

    // Erst jetzt darf nachgeholt werden, was während
    // der Bewegung zurückgestellt wurde
    nachholenPruefen();
  }
}


// Meldet die eigene Bewegung, ohne sie zu speichern.
// Absichtlich ohne await - das darf ruhig unterwegs sein.
function bewegungMelden(id, x, y, breite, hoehe, winkel) {
  fetch('/api/zettel/' + id + '/bewegt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x: Math.round(x),
      y: Math.round(y),
      breite: breite ? Math.round(breite) : null,
      hoehe: hoehe ? Math.round(hoehe) : null,
      winkel: winkel === undefined ? null : winkelNormal(winkel),
      sender: KLIENT_ID
    })
  }).catch(function () {
    // Eine verlorene Zwischenmeldung ist unkritisch -
    // beim Loslassen wird ohnehin richtig gespeichert
  });
}


// Wendet die Bewegung eines anderen Geräts an
function fremdeBewegung(daten) {
  const element = notizElemente.get(daten.id);

  if (!element) {
    return;
  }

  if (daten.x !== null) {
    element.style.left = daten.x + 'px';
  }
  if (daten.y !== null) {
    element.style.top = daten.y + 'px';
  }
  if (daten.breite) {
    element.style.width = daten.breite + 'px';
  }
  if (daten.hoehe) {
    element.style.height = daten.hoehe + 'px';
  }
  if (daten.winkel !== null && daten.winkel !== undefined) {
    element.style.transform = 'rotate(' + daten.winkel + 'deg)';

    // Auch fremde Drehungen ins Gedächtnis - sonst würde
    // unser eigener, älterer Wert sie beim nächsten
    // Neuaufbauen wieder überschreiben
    winkelSpeicher.set(daten.id, daten.winkel);
  }

  // Auch die gemerkten Daten mitziehen, damit ein
  // späteres Neuzeichnen nicht zurückspringt
  const eintrag = notizen.find(function (n) {
    return n.id === daten.id;
  });

  if (eintrag) {
    if (daten.x !== null) { eintrag.x = daten.x; }
    if (daten.y !== null) { eintrag.y = daten.y; }
    if (daten.breite) { eintrag.breite = daten.breite; }
    if (daten.winkel !== null && daten.winkel !== undefined) {
      eintrag.winkel = daten.winkel;
    }
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
  notizElemente.clear();
  koerper.clear();

  notizen.forEach(function (eintrag, nummer) {

    const auto = groesseFuerText(eintrag.nachricht);

    // Gemalte Zettel sind ganz normale Zettel: mit
    // Hintergrund, Namen und Löschknopf.
    const mitBild = hatBild(eintrag.nachricht) || eintrag.hat_zeichnung;
    const nurBild = istNurBefehl(eintrag.nachricht);

    // Bildnotizen dürfen bis zur vollen Breite gezogen werden.
    let maxBreite = mitBild ? MAX_BREITE : auto.maxBreite;

    // Bei Zeichnungen begrenzt zusätzlich das Seitenverhältnis,
    // sobald es bekannt ist - sonst wird das Bild abgeschnitten
    if (eintrag.hat_zeichnung) {
      const mass = bildMasse.get('/api/zettel/' + eintrag.id + '/zeichnung');

      if (mass) {
        maxBreite = maxBreiteFuerBild(mass.breite, mass.hoehe);
      }
    }

    // Befehlsbilder immer gleich breit - egal was in der
    // Datenbank steht. Sonst wären /merz und /trump je nach
    // Bildgröße unterschiedlich groß.
    const breite = nurBild
      ? befehlsBreite(eintrag.nachricht)
      : begrenzen(eintrag.breite, MIN_BREITE, maxBreite);

    const notiz = document.createElement('div');
    notiz.className = 'notiz ' + eintrag.farbe
      + (nurBild ? ' nurBild' : '')
      + (eintrag.hat_zeichnung ? ' mitZeichnung' : '');

    notiz.style.left = begrenzen(eintrag.x, 0, WAND_BREITE - breite) + 'px';
    notiz.style.top = begrenzen(eintrag.y, 0, WAND_HOEHE - MIN_HOEHE) + 'px';
    notiz.style.width = breite + 'px';
    notiz.style.height = passendeHoehe(eintrag.nachricht, breite) + 'px';

    notiz.style.zIndex = 10 + nummer;
    obersteEbene = Math.max(obersteEbene, 10 + nummer);

    const text = document.createElement('p');

    if (eintrag.hat_zeichnung) {
      zeichnungAnzeigen(text, eintrag, notiz);
    } else {
      inhaltAufbauen(text, eintrag.nachricht, notiz);
    }

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
    notizElemente.set(eintrag.id, notiz);

    // Höhe exakt auf den Inhalt setzen (wächst und schrumpft)
    hoeheAnpassen(notiz, text);

    eintrag.breite = breite;
    eintrag.hoehe = notiz.offsetHeight;
    eintrag.maxBreite = maxBreite;
    eintrag.mitBild = mitBild;
    eintrag.nurBild = nurBild;
    eintrag.absatz = text;

    // Schiefe Köpfe bleiben schief. Das eigene Gedächtnis
    // hat Vorrang vor der Datenbank: Es ist immer mindestens
    // so aktuell wie sie, oft aktueller.
    if (nurBild) {
      const gemerkt = winkelSpeicher.get(eintrag.id);

      eintrag.winkel = gemerkt !== undefined
        ? gemerkt
        : (eintrag.winkel || 0);

      if (eintrag.winkel) {
        notiz.style.transform = 'rotate(' + eintrag.winkel + 'deg)';
      }
    }

    // Befehlsbilder sind anstoßbare Objekte
    if (nurBild && !nurLesen()) {
      koerperEintragen(eintrag, notiz);
    }

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

    // Wer festgehalten wird, hört auf zu fliegen
    const eigenerKoerper = koerper.get(eintrag.id);

    if (eigenerKoerper) {
      eigenerKoerper.vx = 0;
      eigenerKoerper.vy = 0;
      eigenerKoerper.drall = 0;
      eigenerKoerper.inBewegung = false;
    }

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
      let letzteBreitenMeldung = 0;

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

        const jetzt = Date.now();

        if (jetzt - letzteBreitenMeldung > MELDE_ABSTAND) {
          letzteBreitenMeldung = jetzt;
          bewegungMelden(eintrag.id, eintrag.x, eintrag.y,
                         neueBreite, element.offsetHeight);
        }
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
    let letzteMeldung = 0;

    // Der Weg im letzten Bild - das ist beim Loslassen
    // die Wurfgeschwindigkeit
    let wurfX = 0;
    let wurfY = 0;


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

      // Was gerade angestoßen wird, bekommt Schwung.
      // Die Geschwindigkeit ist der Weg seit dem letzten Bild.
      wurfX = neuX - letzteX;
      wurfY = neuY - letzteY;

      anstossen(
        { x: neuX, y: neuY, breite: element.offsetWidth, hoehe: element.offsetHeight },
        wurfX,
        wurfY,
        eintrag.id
      );

      letzteX = neuX;
      letzteY = neuY;

      // Andere Geräte mitziehen lassen - aber gedrosselt,
      // sonst entstehen dutzende Anfragen pro Sekunde
      const jetzt = Date.now();

      if (jetzt - letzteMeldung > MELDE_ABSTAND) {
        letzteMeldung = jetzt;
        bewegungMelden(eintrag.id, neuX, neuY, null, null);
      }
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

      // Köpfe fliegen weiter, wenn man sie in Bewegung
      // loslässt - wie ein geworfener Ball.
      const geworfen = koerper.get(eintrag.id);

      if (geworfen && Math.abs(wurfX) + Math.abs(wurfY) > 2) {
        geworfen.vx = begrenzen(wurfX, -MAX_TEMPO, MAX_TEMPO);
        geworfen.vy = begrenzen(wurfY, -MAX_TEMPO, MAX_TEMPO);
        geworfen.inBewegung = true;
        physikStarten();
        return;                  // Speichern übernimmt die Physik
      }

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

// ============================================
//  Malmodus - wird durch /paint gestartet
// ============================================
function malmodusStarten(notiz, x, y) {
  notiz.classList.add('malen');

  // Die Knopfzeile aus dem Textmodus muss weg - ihre
  // Knöpfe gehören zu einer Funktion, die schon
  // abgeschlossen ist und nichts mehr tun würde.
  const alteKnoepfe = notiz.querySelector('.notizAbschluss');

  if (alteKnoepfe) {
    alteKnoepfe.remove();
  }

  // Die Notiz richtet sich nach der Leinwand
  notiz.style.width = 'auto';
  notiz.style.height = 'auto';

  const flaeche = malflaecheBauen();
  notiz.appendChild(flaeche.element);

  const reihe = document.createElement('div');
  reihe.className = 'malAbschluss';

  const fertigKnopf = document.createElement('button');
  fertigKnopf.type = 'button';
  fertigKnopf.className = 'malKnopf malHaupt';
  fertigKnopf.textContent = 'Anpinnen';

  const abbrechen = document.createElement('button');
  abbrechen.type = 'button';
  abbrechen.className = 'malKnopf';
  abbrechen.textContent = 'Abbrechen';

  reihe.appendChild(fertigKnopf);
  reihe.appendChild(abbrechen);
  notiz.appendChild(reihe);

  let erledigt = false;


  async function speichern() {
    if (erledigt) {
      return;
    }
    erledigt = true;

    const png = flaeche.alsPng();

    notiz.remove();
    schreibtGerade = false;

    // Rahmen plus die seitlichen Abstände des Zettels
    await notizSpeichern('gemalt', x, y, png,
                         flaeche.breite + 2 * RAHMEN + TEXT_LINKS + TEXT_RECHTS,
                         flaeche.hoehe);
    await waendeLaden();
  }


  async function verwerfen() {
    if (erledigt) {
      return;
    }
    erledigt = true;

    notiz.remove();
    schreibtGerade = false;
    await notizenHolen();
  }


  fertigKnopf.addEventListener('click', function (event) {
    event.stopPropagation();
    speichern();
  });

  abbrechen.addEventListener('click', function (event) {
    event.stopPropagation();
    verwerfen();
  });
}


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

    // Nie schmaler als die Knopfzeile braucht
    breite = Math.max(breite, NEU_MIN_BREITE);
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

    // Befehl /paint: statt zu speichern die Malfläche öffnen.
    // schonFertig bleibt true, damit der Textweg nicht
    // noch einmal anspringt.
    if (text.toLowerCase() === '/paint') {
      feld.remove();
      malmodusStarten(notiz, x, y);
      return;
    }

    notiz.remove();
    schreibtGerade = false;

    if (text === '') {
      await notizenHolen();
      return;
    }

    await notizSpeichern(text, x, y);
    await waendeLaden();
  }

  // ===== Knöpfe zum Bestätigen und Abbrechen =====
  const reihe = document.createElement('div');
  reihe.className = 'notizAbschluss';

  const anpinnen = document.createElement('button');
  anpinnen.type = 'button';
  anpinnen.className = 'malKnopf malHaupt';
  anpinnen.textContent = 'Anpinnen';

  const abbrechen = document.createElement('button');
  abbrechen.type = 'button';
  abbrechen.className = 'malKnopf';
  abbrechen.textContent = 'Abbrechen';

  reihe.appendChild(anpinnen);
  reihe.appendChild(abbrechen);
  notiz.appendChild(reihe);

  anpinnen.addEventListener('click', function (event) {
    event.stopPropagation();
    fertig();
  });

  abbrechen.addEventListener('click', function (event) {
    event.stopPropagation();
    feld.value = '';
    fertig();
  });


  // Klick auf die eigenen Knöpfe soll nicht als
  // "Feld verlassen" gewertet werden
  feld.addEventListener('blur', function (event) {
    if (event.relatedTarget && notiz.contains(event.relatedTarget)) {
      return;
    }
    fertig();
  });

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

ereignisse.addEventListener('message', function (event) {
  let daten = null;

  try {
    daten = JSON.parse(event.data);
  } catch (fehler) {
    daten = { typ: 'aktualisiert' };     // ältere Meldungsform
  }

  // Live-Bewegung eines anderen Geräts: nur diese eine
  // Notiz verschieben, nicht die ganze Wand neu zeichnen
  if (daten.typ === 'bewegt') {
    if (daten.sender !== KLIENT_ID) {
      fremdeBewegung(daten);
    }
    return;
  }

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
//  Hilfefenster
// ============================================

const hilfeKnopf = document.getElementById('hilfeKnopf');
const hilfeFenster = document.getElementById('hilfeFenster');

if (hilfeKnopf && hilfeFenster) {

  function hilfeZeigen(offen) {
    hilfeFenster.hidden = !offen;
    hilfeKnopf.setAttribute('aria-expanded', offen ? 'true' : 'false');
  }

  hilfeKnopf.addEventListener('click', function () {
    hilfeZeigen(hilfeFenster.hidden);
  });

  // Wichtig: pointerdown kommt VOR click. Ohne dieses
  // Stoppen würde der Schließer unten schon zumachen,
  // und der click danach sofort wieder aufmachen -
  // der Knopf ginge nie zu.
  hilfeKnopf.addEventListener('pointerdown', function (event) {
    event.stopPropagation();
  });

  // Klicks IM Fenster sollen es offen lassen -
  // sonst könnte man nichts markieren oder kopieren
  hilfeFenster.addEventListener('pointerdown', function (event) {
    event.stopPropagation();
  });

  // Irgendwo sonst hin: zu.
  // pointerdown statt click, damit es auch dann schließt,
  // wenn der Klick auf der Wand zum Ziehen wird und
  // gar kein click mehr entsteht.
  document.addEventListener('pointerdown', function () {
    hilfeZeigen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      hilfeZeigen(false);
    }
  });
}


// ============================================
//  Start
// ============================================

standardAnsicht();

waendeLaden().then(function () {
  notizenHolen();
});

setInterval(waendeLaden, 60 * 60 * 1000);
