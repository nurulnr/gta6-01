# gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/nurulnr/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/nurulnr/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# SOLMARA — an open-world crime story

Mara Solis came home broke. The city owes her. Take it back — one job at a time.

**SOLMARA** is a complete open-world crime game that plays offline in a desktop browser from static files. Explore the sun-soaked coastal city of Solmara Bay on foot and by car: steal rides, dodge the Solmara PD, run six story missions for Rico, Tessa and Vega, and build your rep from street nobody to the name every fixer in town calls first.

## What's in the game

- **A living city** — a procedural coastal city with a downtown tower district, a beach, a pier, palms, traffic and 26 pedestrians, all built from a fixed seed so it is identical every run
- **On foot and by car** — third-person walking with a punch, and arcade driving with steering, handbrake drifts and a chase camera; press E to steal any car on the street
- **Wanted system** — 5 stars of heat. Crimes raise it, staying clean cools it. Solmara PD cars chase, ram and bust you
- **Six story missions** — steal a getaway car, run a package to the pier on a timer, get 3 stars and lose them, brawl thugs on the beach, drive a VIP across town, and rob the Solmara Bank and escape a 4-star wanted level
- **HUD with minimap** — cash, health, wanted stars, clock, mission objective, speed, and a live top-down map with police and mission blips
- **Save & continue** — progress (cash, missions, position) saves to local storage
- **Sound** — fully synthesised with Web Audio: engine hum, sirens, punches, crashes, a mission jingle and a sunset-radio loop. No audio files, no network

## Controls

WASD move / drive · SHIFT run / boost · mouse drag to look around · E get in / out of a car · F punch · SPACE handbrake · H honk · M missions · P pause · R restart · U mute

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. No build step, no network requests — every file the game loads is under `game/`, including the vendored three.js build.

## Layout

- `game/` — the playable game as static files (`index.html`, `src/*.js`, `vendor/three.min.js`)
- `screenshots/` — four renders of the game running: cruising the avenue, a 3-star police chase, the pier package run, and the beach brawl
- `main.ts` — the make.fun entry program (Node 22): copies `game/` and `screenshots/` to `/output` and writes `dossier.json`
- `serve.ts` — tiny static server for local play-testing

Everything in the game — the city, characters, vehicles, names, story, art and sound — is original. Nothing from any commercial game.

---

<sub>Entered on [make.fun](https://make.fun/?ref=rey-morela&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
