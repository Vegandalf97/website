// ============================================
//  Kleine Malfläche für den Befehl /paint
//
//  Pinsel, Farben, Farbeimer und Radiergummi.
//  Die Leinwand lässt sich vor dem Anpinnen
//  in der Größe verändern.
// ============================================

const MAL_START_BREITE = 320;
const MAL_START_HOEHE = 220;

const MAL_MIN_BREITE = 160;
const MAL_MAX_BREITE = 470;
const MAL_MIN_HOEHE = 120;
const MAL_MAX_HOEHE = 380;

const MAL_FARBEN = [
  '#000000', '#ffffff', '#e0d12b', '#28d43f',
  '#0084ff', '#9900ff', '#b91818', '#ff7f00'
];

const MAL_STAERKEN = [4, 10, 18];


function malBegrenzen(wert, min, max) {
  return Math.min(Math.max(wert, min), max);
}


// Baut die Malfläche und gibt ein Objekt zurück:
//   .element  - zum Einhängen in die Notiz
//   .breite / .hoehe - aktuelle Leinwandgröße
//   .alsPng() - liefert die Zeichnung als Datenadresse
function malflaecheBauen() {
  const kasten = document.createElement('div');
  kasten.className = 'malKasten';

  const buehne = document.createElement('div');
  buehne.className = 'malBuehne';

  const leinwand = document.createElement('canvas');
  leinwand.className = 'malLeinwand';

  const dichte = window.devicePixelRatio || 1;

  let breite = MAL_START_BREITE;
  let hoehe = MAL_START_HOEHE;
  let stift = null;

  let farbe = '#000000';
  let staerke = MAL_STAERKEN[1];
  let maltGerade = false;

  // Die Hintergrundfarbe liegt NICHT auf der Leinwand,
  // sondern als CSS-Farbe darunter. Nur so lässt sie sich
  // später mit dem Eimer noch ändern, ohne das Gemalte
  // zu übermalen. Beim Speichern werden beide vereint.
  let hintergrund = '#ffffff';

  // Wird weiter unten gebaut, aber schon in
  // leinwandSetzen gebraucht
  let werkzeuge = null;


  // Setzt Größe und Grundeinstellungen der Leinwand.
  // "altesBild" wird, falls vorhanden, wieder aufgetragen.
  function leinwandSetzen(neueBreite, neueHoehe, altesBild, alteBreite, alteHoehe) {
    breite = Math.round(malBegrenzen(neueBreite, MAL_MIN_BREITE, MAL_MAX_BREITE));
    hoehe = Math.round(malBegrenzen(neueHoehe, MAL_MIN_HOEHE, MAL_MAX_HOEHE));

    leinwand.width = breite * dichte;
    leinwand.height = hoehe * dichte;
    leinwand.style.width = breite + 'px';
    leinwand.style.height = hoehe + 'px';

    // Beim Ändern der Größe verliert der Zeichenstift
    // alle Einstellungen - deshalb neu holen und setzen
    stift = leinwand.getContext('2d');
    stift.scale(dichte, dichte);

    // Leinwand bleibt durchsichtig - die Farbe kommt
    // aus dem CSS-Hintergrund
    leinwand.style.backgroundColor = hintergrund;

    if (altesBild) {
      // In Originalgröße wieder auftragen, damit das
      // Gemalte beim Vergrößern nicht verzerrt
      stift.drawImage(altesBild, 0, 0, alteBreite, alteHoehe);
    }

    stift.lineCap = 'round';
    stift.lineJoin = 'round';

    // Die Werkzeugleiste soll nicht breiter werden als
    // die Leinwand - sonst entsteht rechts leerer Raum
    if (werkzeuge) {
      werkzeuge.style.width = breite + 'px';
    }
  }


  leinwandSetzen(MAL_START_BREITE, MAL_START_HOEHE, null, 0, 0);


  function punktVon(event) {
    const rahmen = leinwand.getBoundingClientRect();
    return {
      x: (event.clientX - rahmen.left) * (breite / rahmen.width),
      y: (event.clientY - rahmen.top) * (hoehe / rahmen.height)
    };
  }


  leinwand.addEventListener('pointerdown', function (event) {
    event.stopPropagation();
    leinwand.setPointerCapture(event.pointerId);

    maltGerade = true;

    const punkt = punktVon(event);

    stift.globalCompositeOperation = 'source-over';
    stift.strokeStyle = farbe;
    stift.lineWidth = staerke;
    stift.beginPath();
    stift.moveTo(punkt.x, punkt.y);
    stift.lineTo(punkt.x + 0.01, punkt.y);
    stift.stroke();
  });


  leinwand.addEventListener('pointermove', function (event) {
    if (!maltGerade) {
      return;
    }
    event.stopPropagation();

    const punkt = punktVon(event);
    stift.lineTo(punkt.x, punkt.y);
    stift.stroke();
  });


  function malenBeenden(event) {
    if (!maltGerade) {
      return;
    }
    event.stopPropagation();
    maltGerade = false;
    stift.closePath();
  }

  leinwand.addEventListener('pointerup', malenBeenden);
  leinwand.addEventListener('pointercancel', malenBeenden);


  // ===== Griff zum Verändern der Leinwandgröße =====
  const griff = document.createElement('div');
  griff.className = 'malGriff';
  griff.title = 'Größe ändern';

  griff.addEventListener('pointerdown', function (event) {
    event.stopPropagation();
    griff.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startY = event.clientY;
    const startBreite = breite;
    const startHoehe = hoehe;

    // Aktuellen Stand sichern, damit er beim
    // Ändern der Größe nicht verlorengeht
    const sicherung = document.createElement('canvas');
    sicherung.width = leinwand.width;
    sicherung.height = leinwand.height;
    sicherung.getContext('2d').drawImage(leinwand, 0, 0);

    const altBreite = startBreite;
    const altHoehe = startHoehe;

    function ziehen(bewegEvent) {
      leinwandSetzen(
        startBreite + (bewegEvent.clientX - startX),
        startHoehe + (bewegEvent.clientY - startY),
        sicherung, altBreite, altHoehe
      );
    }

    function fertig() {
      griff.removeEventListener('pointermove', ziehen);
      griff.removeEventListener('pointerup', fertig);
      griff.removeEventListener('pointercancel', fertig);
    }

    griff.addEventListener('pointermove', ziehen);
    griff.addEventListener('pointerup', fertig);
    griff.addEventListener('pointercancel', fertig);
  });


  buehne.appendChild(leinwand);


  // ===== Werkzeugleiste =====
  werkzeuge = document.createElement('div');
  werkzeuge.className = 'malWerkzeuge';
  werkzeuge.style.width = breite + 'px';

  const farbKnoepfe = [];

  MAL_FARBEN.forEach(function (wert) {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'malFarbe';
    knopf.style.backgroundColor = wert;
    knopf.title = 'Farbe';

    if (wert === farbe) {
      knopf.classList.add('gewaehlt');
    }

    knopf.addEventListener('click', function (event) {
      event.stopPropagation();
      farbe = wert;

      farbKnoepfe.forEach(function (anderer) {
        anderer.classList.remove('gewaehlt');
      });
      knopf.classList.add('gewaehlt');
    });

    farbKnoepfe.push(knopf);
    werkzeuge.appendChild(knopf);
  });


  const staerkeKnoepfe = [];

  MAL_STAERKEN.forEach(function (wert) {
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'malStaerke';
    knopf.title = 'Strichstärke';

    const punkt = document.createElement('span');
    punkt.style.width = wert + 'px';
    punkt.style.height = wert + 'px';
    knopf.appendChild(punkt);

    if (wert === staerke) {
      knopf.classList.add('gewaehlt');
    }

    knopf.addEventListener('click', function (event) {
      event.stopPropagation();
      staerke = wert;

      staerkeKnoepfe.forEach(function (anderer) {
        anderer.classList.remove('gewaehlt');
      });
      knopf.classList.add('gewaehlt');
    });

    staerkeKnoepfe.push(knopf);
    werkzeuge.appendChild(knopf);
  });


  // ===== Farbeimer =====
  // Füllt die ganze Fläche mit der gewählten Farbe -
  // aber HINTER dem bereits Gemalten.
  const eimer = document.createElement('button');
  eimer.type = 'button';
  eimer.className = 'malKnopf malEimer';
  eimer.title = 'Fläche füllen';
  eimer.textContent = '🪣';

  eimer.addEventListener('click', function (event) {
    event.stopPropagation();

    // Nur die Hintergrundfarbe tauschen - das Gemalte
    // liegt darüber und bleibt unberührt
    hintergrund = farbe;
    leinwand.style.backgroundColor = hintergrund;
  });

  werkzeuge.appendChild(eimer);


  const leeren = document.createElement('button');
  leeren.type = 'button';
  leeren.className = 'malKnopf';
  leeren.textContent = 'Leeren';

  leeren.addEventListener('click', function (event) {
    event.stopPropagation();

    stift.globalCompositeOperation = 'source-over';
    stift.clearRect(0, 0, breite, hoehe);

    hintergrund = '#ffffff';
    leinwand.style.backgroundColor = hintergrund;
  });

  werkzeuge.appendChild(leeren);


  kasten.appendChild(buehne);
  kasten.appendChild(werkzeuge);

  // Der Griff sitzt ganz unten rechts im Zettel,
  // nicht über der Werkzeugleiste
  kasten.appendChild(griff);


  return {
    element: kasten,

    get breite() {
      return breite;
    },
    get hoehe() {
      return hoehe;
    },

    // Hintergrundfarbe und Gemaltes zu einem Bild vereinen
    alsPng: function () {
      const fertig = document.createElement('canvas');
      fertig.width = leinwand.width;
      fertig.height = leinwand.height;

      const pinsel = fertig.getContext('2d');

      pinsel.fillStyle = hintergrund;
      pinsel.fillRect(0, 0, fertig.width, fertig.height);
      pinsel.drawImage(leinwand, 0, 0);

      return fertig.toDataURL('image/png');
    }
  };
}
