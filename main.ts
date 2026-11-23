// SOLMARA — the entry program for make.fun's gta6-01 bounty.
//
// What this program hands in, and how: the game is plain static files under
// game/ (index.html, its ES modules, the vendored three.js build) and the
// four screenshots under screenshots/, each a real render of the game running
// in a desktop browser. This program copies both trees into the output
// directory and writes dossier.json there with buildDossier from the kit's
// vendored library (vendor/makefun-game.ts), the summary the judge reads.
//
// It runs on Node 22 with the standard library only, and the grader runs it
// twice: both runs must write identical bytes. So nothing here varies — no
// timestamps, no randomness, no network, just deterministic copies.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy one tree, making the target first. Used for game/ and screenshots/.
function mirror(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });
}

// The game: every static file the browser loads, three.js included.
mirror(join(repoDir, 'game'), join(outDir, 'game'));

// The screenshots, when they are present (they always are in this entry).
const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) mirror(shotsDir, join(outDir, 'screenshots'));

// The dossier, built by the kit's own library from exactly what was copied.
// The caps come from the kit's reference/gate.json: dossier text capped at
// 160 KiB, at most 4 screenshots of at most 256 KiB each, game/ at most 993
// files and 48 MiB in all, every game path at most 1000 bytes.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
