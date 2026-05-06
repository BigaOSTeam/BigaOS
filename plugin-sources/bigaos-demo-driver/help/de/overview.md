# Demo-Treiber

Der Demo-Treiber erzeugt plausible Test-Sensordaten, damit du BigaOS auch ohne Boots-Hardware nutzen kannst. Jede Dashboard-Kachel, jede Detailansicht, jeder Alarmpfad lässt sich durchgängig gegen Demo-Daten testen — exakt derselbe Codepfad wie auf einem echten Boot.

## Wann aktivieren

- **Erster Kontakt mit BigaOS** — lebendige Werte sehen, ganz ohne angeschlossene Hardware.
- **Entwicklung neuer Features, Themes oder Layouts** ohne Boots-Anschluss.
- **System vorführen** am Schreibtisch, im Hafenbüro oder auf einer Messe.
- **Fehler eingrenzen.** Wenn echte Daten kaputt sind, isolierst du mit Demo, ob der Datenpfad oder die UI das Problem ist.

## Was rauskommt

Knapp zwei Dutzend simulierte Streams: Position (langsame Strecke), Kurs, Geschwindigkeit, Tiefe, Wind, Batterien, Motordrehzahl, Umweltwerte und zwei Tank-Eingänge. Die Zahlen ändern sich langsam und in plausiblen Bereichen — kein echtes Rauschen, eher wie ein ruhig motorendes Boot bei mittlerem Wetter.

Die Demo-Tank-Eingänge (`tank_input_0`, `tank_input_1`) wandern zwischen rund **0,4 V (leer)** und **3,0 V (voll)** — das entspricht dem Verhalten eines typischen resistiven Senders und eignet sich gut zum Testen des Tank-Kalibrier-Assistenten.

## Demo-Banner

Wenn das Plugin aktiv ist, zeigt BigaOS oben rechts auf jedem Bildschirm einen kleinen **DEMO**-Hinweis. Damit niemand simulierte Daten für echte hält — wichtig, wenn man das Boot an einen neuen Eigner oder ein Crew-Mitglied übergibt.

## Wieder ausschalten

Demo-Treiber unter **Einstellungen → Plugins** deaktivieren, wenn echte Daten fließen sollen. Sind Demo und ein echter Treiber gleichzeitig aktiv, wählst du im Sensor-Mapping unter **Einstellungen → Plugins → Quellen**, welcher die jeweiligen Werte liefert.
