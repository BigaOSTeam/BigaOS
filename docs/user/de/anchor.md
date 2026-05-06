# Ankeralarm

Der Ankeralarm überwacht die Bootsposition relativ zur Stelle, an der du den Anker geworfen hast, und warnt, wenn das Boot über den Schwojradius hinaus driftet.

## Was vorher feststehen sollte

Der Ankeralarm rechnet mit den realen Werten deines Boots. Trag sie unter **Einstellungen → Schiff** ein, bevor du ankerst:

- **Länge (LOA)**, **Wasserlinie**, **Freibord** — gehen in die Wind-Last-Rechnung ein.
- **Verdrängung** — beeinflusst die Schätzung der Windangriffsfläche.
- **Gesamtlänge der Kette**, **Kettendurchmesser**, **Kettentyp** (verzinkt oder Edelstahl) — gehen in das Kettengewicht und die Empfehlungen ein.

Diese Werte fließen in die Catenary-Rechnung ein — je genauer sie stimmen, desto sinnvoller die Empfehlungen.

## Anker werfen

Am gewünschten Ankerplatz:

1. Lange auf die Karte tippen und im Kontextmenü **Anker setzen** wählen — oder die dedizierte **Anker**-Aktion nutzen.
2. Der **Ankeralarm**-Dialog öffnet sich mit Eingabe für die Kettenlänge, der aktuellen Tiefe und dem berechneten **Schwojradius**.
3. Trag die tatsächlich gesteckte Kette ein. Der Dialog visualisiert die Catenary auf der Karte — die am Grund liegende Kette in einer dunkleren Farbe, der hängende Teil heller.
4. Tippe **Aktivieren**, um den Alarm scharf zu schalten.

Solange aktiv, zeichnet BigaOS den Schwojkreis um die Ankerposition und überwacht das GPS. Verlässt das Boot den Kreis, geht der Alarm los.

## Schwojradius — wie er gerechnet wird

Der Schwojradius ist die horizontale Strecke, die das Boot bei der gesteckten Kette und der gegebenen Tiefe zurücklegen kann, plus die halbe Bootslänge:

> `schwojradius = sqrt(kette² − tiefe²) + bootslänge / 2`

Ist die Kette kürzer als die Tiefe (unmöglicher Scope), verweigert der Dialog die Aktivierung.

## Empfehlungen für die Kettenlänge

Der Dialog zeigt zwei Ziel-Längen für die aktuelle Tiefe — gespeist aus der **Wettervorhersage** für die geplante Liegedauer:

- **Mindest-Kette** — ausreichend Kette für den maximal erwarteten Dauerwind während deines Aufenthalts.
- **Empfohlene Kette** — ausreichend Kette für die maximal erwarteten Böen während deines Aufenthalts.

Beide Werte sowie die zugrunde liegenden Max-Wind- und Max-Böen-Werte aus der Vorhersage stehen direkt über der Ketten-Eingabe. Wähle oben die **Liegedauer** (12 h / 24 h / 2 d / 3 d) und die Empfehlungen rechnen sich neu für den neuen Zeitraum.

Ist der Wetter-Service nicht erreichbar (kein Internet, Wetter in den Einstellungen aus), fällt der Dialog auf drei feste Schwellen zurück — *Minimum* bei ~15 kn, *Empfohlen* bei ~25 kn, *Sturm* bei ~45 kn.

Die Empfehlungen kommen aus einer Rechnung, die kombiniert:

- Windkraft am Boot (`F = 0,5 × ρ × V² × A × Cd`, mit Windangriffsfläche aus Freibord × Wasserlinie × Rumpf-Faktor).
- Kettengewicht pro Meter im Wasser (verzinkt vs Edelstahl) nach `gewicht ≈ k × durchmesser²` (k=0,020 verzinkt, 0,022 Edelstahl).
- Catenary-Gleichung `L = √(Y × (Y + 2a))` mit `a = F / (m × g)`.
- Quercheck mit der Yachting-Monthly-Regel `kette = wind × tiefenfaktor + bootslänge` (Tiefenfaktor 1,0 unter 8 m, 1,5 für 8–15 m, 2,0 darüber).

Der Dialog färbt die eingegebene Kettenlänge je nachdem ein, ob sie die jeweilige Schwelle erreicht — grün wenn ja, orange oder rot wenn nicht.

Wenn die eingegebene Kette mehr als 90 % der **Gesamtkette** (aus Schiff-Einstellungen) ist, warnt der Dialog — fast alles auszustecken lässt keinen Spielraum mehr.

## Die Mathematik ansehen (und die Formel wählen)

**Tippe auf die Empfehlungs-Kästen**, um den Detail-Dialog **Ketten-Berechnung** zu öffnen. Er zeigt:

- **Dein Boot** — die Werte für LOA, Wasserlinie, Freibord, Verdrängung, Kettendurchmesser und -typ, die BigaOS verwendet, dazu die abgeleitete Windangriffsfläche (m²) und das Kettengewicht pro Meter (kg/m).
- **Wettervorhersage** — Max-Wind und Max-Böen, die in die Empfehlung eingehen, neben dem, was die Vorhersage für deine Liegedauer meldet.
- **Klassischer Scope-Vergleich** — 5:1 und 7:1 für die aktuelle Tiefe als Plausibilitätsprüfung gegen die alten Daumenregeln.
- **Die zwei Formeln** als Schalter — **Catenary** (Physik-Rechnung) und **Wind + LOA** (Yachting-Monthly-Regel). Eine kann an, eine aus, oder beide. Sind beide an, nimmt die Empfehlung den höheren Wert. Sind beide aus, fällt der Dialog auf einen einfachen `5×/6×/7×`-Scope zurück. Die Schalter werden in den Schiff-Einstellungen gespeichert und gelten beim nächsten Ankern wieder.

Eine kurze *Wie wird gerechnet*-Zeile oben im Detail-Dialog zeigt, welche Kombination gerade aktiv ist.

## Während des Liegens nachjustieren

Du kannst die Ankerposition direkt auf der Karte ziehen. Der Dialog bleibt offen und rechnet den Schwojradius live neu.

## Ton

Der Ankeralarm nutzt das gemeinsame Alarm-Tonsystem. Bestätigen über das Banner. Der Alarm geht weiter, bis das Boot wieder im Schwojkreis liegt.
