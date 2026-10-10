# Sportdex

Mobiles Grundgeruest fuer eine Sportplattform nach Dex-Prinzip. Der Dex ist die Startansicht und zeigt alle 36 Disziplinen aus Generation 1. Feed und Connect sind bewusst nur Platzhalter, Profil ist fuer Supabase Auth und die Tabelle `nutzer` vorbereitet.

## Lokaler Start

```bash
npm test
npm start
```

Alternativ kann ein beliebiger statischer Server auf `public/` zeigen. Die App nutzt relative Pfade und funktioniert dadurch auch unter einem GitHub-Pages-Unterpfad wie `/sport-dex/`.

Ohne `public/config.local.json` startet die App im klar gekennzeichneten Demo-Modus. Der Dex nutzt dann `public/data/disciplines.js`; Registrierung, Anmeldung und Speichern sind deaktiviert.

## Supabase verbinden

1. In Supabase ein Projekt anlegen.
2. SQL aus `supabase/migrations/001_schema.sql` ausfuehren.
3. SQL aus `supabase/seed/001_disziplinen.sql` ausfuehren. Der Seed ist wiederholbar und upsertet nach `sortierung`.
4. `public/config.example.json` nach `public/config.local.json` kopieren.
5. `supabaseUrl` und den oeffentlichen `anon` Key eintragen. Keine Service-Keys im Frontend speichern.

Die Tabellen heissen exakt `nutzer`, `disziplin`, `leistung`, `beitrag`, `follow`. `erstellt_am` wird ueberall verwendet. Supabase Auth verwaltet E-Mail und Passwort; es gibt keinen eigenen Passwort-Hash.

## Sicherheit

- Aktive Disziplinen sind oeffentlich lesbar.
- Disziplinen haben keine Client-Policies fuer Insert/Update/Delete.
- Nutzer lesen und bearbeiten nur ihr eigenes Profil.
- `rank` bleibt fuer normale Nutzer nicht frei erhoehbar.
- Leistungen, Beitraege und Follow-Beziehungen sind per RLS auf eigene Daten begrenzt.
- Medaillen werden per Trigger in der Datenbank aus Wertungsklasse, Disziplin und Wert berechnet.
- Geloeschte Nutzer entfernen eigene Profile, Leistungen, Beitraege und Follow-Beziehungen per Cascade.
- Geloeschte Leistungen entfernen ihren Beitrag per Cascade.
- Bereits verwendete Disziplinen werden bei Delete-Versuch deaktiviert statt entfernt.

## Deployment auf GitHub Pages

Die zu veroeffentlichenden Dateien liegen in `public/`.

Optionen:

- Repository so konfigurieren, dass GitHub Pages den Ordner `public/` ausliefert.
- Oder den Inhalt von `public/` in den Pages-Branch kopieren.

Da die App keine Server-Routen nutzt, funktionieren Reloads auf GitHub Pages. Navigation laeuft rein clientseitig.

## Fachliche Dokumentation

Grenzwerte, Quellen, offene Fragen und DSA-Abweichungen stehen in `docs/disziplinen-und-quellen.md`.

## Aktueller Umfang

Funktioniert:

- Bottom-Bar: Feed, Suche, Dex, Connect, Profil.
- Dex als Startansicht.
- 36 sichtbare Disziplinen.
- Suche nach Name.
- Suche nach anderen Profilen aus der Tabelle `nutzer`.
- Zaehler fuer sichtbare und gesamte Disziplinen.
- Lade-, Fehler- und Leerzustaende.
- Supabase Auth: Registrierung, Anmeldung, Abmeldung.
- Profilbearbeitung fuer eigene Nutzerdaten.
- Echte Fortschrittszahlen aus vorhandenen `leistung`-Zeilen.

Noch nicht enthalten:

- Disziplin-Detailansicht.
- Leistungseingabe im Frontend.
- Feed mit echten Beitraegen.
- Connect mit echten Community-Funktionen.
- Profilbild-Upload und Storage.
- Automatische Rangberechnung.
