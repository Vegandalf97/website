// ============================================
//  Kleine Malfläche für den Befehl /paint
//
//  Baut ein <canvas> mit Pinsel, Farben und
//  Radierer. Das Ergebnis kommt als PNG heraus.
// ============================================

const MAL_BREITE = 320;
const MAL_HOEHE = 220;

const MAL_FARBEN = [
  '#000000', '#ffffff', '#e0d12b', '#28d43f',
  '#0084ff', '#9900ff', '#b91818', '#ff7f00'
];

const MAL_STAERKEN = [3, 8, 18];


// Baut die Malfläche und gibt ein Objekt zurück:
//   .element  - zum Einhängen in die Notiz
//   .alsPng() - liefert die Zeichnung als Datenadresse
function malflaecheBauen() {
  const kasten = document.createElement('div');
  kasten.className = 'malKasten';

  // ===== Die Zeichenfläche =====
  const leinwand = document.createElement('canvas');
  leinwand.className = 'malLeinwand';

  // Auf feinen Bildschirmen mehr Bildpunkte, damit
  // die Linien nicht ausfransen
  const dichte = window.devicePixelRatio || 1;

  leinwand.width = MAL_BREITE * dichte;
  leinwand.height = MAL_HOEHE * dichte;
  leinwand.style.width = MAL_BREITE + 'px';
  leinwand.style.height = MAL_HOEHE + 'px';

  const stift = leinwand.getContext('2d');
  stift.scale(dichte, dichte);

  // Weißer Untergrund - sonst wäre das PNG durchsichtig
  stift.fillStyle = '#ffffff';
  stift.fillRect(0, 0, MAL_BREITE, MAL_HOEHE);

  stift.lineCap = 'round';
  stift.lineJoin = 'round';

  let farbe = '#000000';
  let staerke = MAL_STAERKEN[1];
  let maltGerade = false;


  function punktVon(event) {
    const rahmen = leinwand.getBoundingClientRect();
    return {
      x: (event.clientX - rahmen.left) * (MAL_BREITE / rahmen.width),
      y: (event.clientY - rahmen.top) * (MAL_HOEHE / rahmen.height)
    };
  }


  leinwand.addEventListener('pointerdown', function (event) {
    event.stopPropagation();          // nicht die Notiz verschieben
    leinwand.setPointerCapture(event.pointerId);

    maltGerade = true;

    const punkt = punktVon(event);

    stift.strokeStyle = farbe;
    stift.lineWidth = staerke;
    stift.beginPath();
    stift.moveTo(punkt.x, punkt.y);

    // Ein einzelner Klick soll auch einen Punkt setzen
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


  // ===== Werkzeugleiste =====
  const werkzeuge = document.createElement('div');
  werkzeuge.className = 'malWerkzeuge';

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
    punkt.style.width = Math.min(wert, 14) + 'px';
    punkt.style.height = Math.min(wert, 14) + 'px';
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


  const leeren = document.createElement('button');
  leeren.type = 'button';
  leeren.className = 'malKnopf';
  leeren.textContent = 'Leeren';
  leeren.addEventListener('click', function (event) {
    event.stopPropagation();
    stift.fillStyle = '#ffffff';
    stift.fillRect(0, 0, MAL_BREITE, MAL_HOEHE);
  });

  werkzeuge.appendChild(leeren);


  kasten.appendChild(leinwand);
  kasten.appendChild(werkzeuge);


  return {
    element: kasten,
    breite: MAL_BREITE,
    hoehe: MAL_HOEHE,

    alsPng: function () {
      return leinwand.toDataURL('image/png');
    }
  };
}
