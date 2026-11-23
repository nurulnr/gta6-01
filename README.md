# SOLMARA — an open-world crime story · gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/nurulnr/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/nurulnr/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Mara Solis came home broke. The city owes her. Take it back — one job at a time.

**SOLMARA** is a complete open-world crime game that runs offline in a desktop browser, from static files alone. It is an entry for make.fun's "Make GTA 6" bounty (gta6-01): a sun-soaked coastal city, Solmara Bay, to explore on foot and by car — steal rides, dodge the Solmara PD, run six story missions for Rico, Tessa and Vega, and climb from street nobody to the name every fixer in town calls first.

## What the game has

- **A living city.** A procedural coastal city built from a fixed seed, so it is the same on every run: a downtown tower district, a beach, a pier, palms, streetlights, traffic and 26 pedestrians.
- **On foot and by car.** Third-person walking with a punch, plus arcade driving — steering, handbrake drifts, a chase camera. Walk up to any car and press E to steal it.
- **A wanted system.** Five stars of heat. Crimes raise it; staying clean cools it off. Solmara PD cars chase, ram and bust you.
- **Six story missions.** Steal a getaway car for Rico; run a package to the pier against the clock; earn 3 stars and then lose them; brawl Vega's thugs on the beach; drive a VIP from Hotel Miramar to Club Vega; rob the Solmara Bank and escape a 4-star wanted level at the safehouse.
- **A HUD with a minimap.** Cash, health, wanted stars, the clock, the current objective, speed — and a live top-down map with police blips and the gold mission marker.
- **Save and continue.** Cash, missions and position save to local storage; pick up where you left off.
- **Synthesised sound.** Engine hum, sirens, punches, crashes, a mission jingle and a sunset-radio loop, all made live with the Web Audio API. No audio files, no network.

## Controls

| Keys | What they do |
| --- | --- |
| WASD / arrows | Walk / drive |
| SHIFT | Run / boost |
| Mouse drag | Look around |
| E | Get in / out of a car (or start a mission at a gold marker) |
| F | Punch |
| SPACE | Handbrake |
| H | Honk |
| M | Mission list |
| P | Pause |
| R | Restart |
| U | Mute |

## Play it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no network requests — every file the game loads lives under `game/`, including the vendored three.js build.

## Files

- `game/` — the playable game as static files: `index.html`, the `src/*.js` modules, and `vendor/three.min.js`
- `screenshots/` — four renders of the game running: cruising the avenue, a 3-star police chase, the pier package run, and the beach brawl
- `main.ts` — the make.fun entry program (Node 22): copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `serve.ts` — a tiny static server for local play-testing

Everything in the game — the city, the characters, the vehicles, the names, the story, the art and the sound — is original. Nothing comes from any commercial game.

---

<sub>Entered on [make.fun](https://make.fun/?ref=rey-morela&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
