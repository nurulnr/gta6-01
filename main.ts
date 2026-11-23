// SOLMARA's entry program for the gta6-01 bounty (Node 22, standard library
// only). The game itself is plain static files under game/ — index.html plus
// its ES modules and the vendored three.js build — and screenshots/ holds the
// four renders the maker took of it running in a desktop browser.
//
// This program hands both in: it copies game/ and screenshots/ from this
// repository into the output directory and writes dossier.json there, the
// summary the judge reads, using the kit's vendored make.fun library. The
// grader runs it twice and the two runs must write identical bytes, so there
// is no timestamp, no randomness and no network here — just copies.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The folder this file lives in, and the folder the grader collects from.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(source, target) {
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

// The game first: every static file the browser loads, three.js included.
copyTree(join(repoRoot, 'game'), join(outputDir, 'game'));

// Then the screenshots, when they are present (they always are in the entry).
if (existsSync(join(repoRoot, 'screenshots'))) {
  copyTree(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
}

// The dossier, built by the kit's own library from exactly what was copied,
// with the competition's caps from the kit's reference/gate.json: the text is
// capped at 160 KiB, at most 4 screenshots of at most 256 KiB each, game/ at
// most 993 files and 48 MiB, every game path at most 1000 bytes.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
