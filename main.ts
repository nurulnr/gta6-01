// Coral Bay's hand-in program (Node 22, standard library only). It takes the
// game as it stands in this repository — game/ (the playable static files) and
// screenshots/ (four real renders) — copies both into the output directory and
// writes /output/dossier.json with the kit's buildDossier, the summary the
// judge reads. Run it twice and the bytes come out identical.
//
// Local check:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play it:      node serve.ts, then open http://localhost:8080

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The scorer's caps, from the kit's reference/gate.json: the text cap shapes
// the dossier's bytes; the rest refuse an entry the scorer would refuse —
// more than four screenshots or one over 256 KiB, more than 993 files in
// game/ or 48 MiB of them, or a game/ path over 1,000 bytes.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
