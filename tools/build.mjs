// Construit dist/ : module ES (applications), script autonome (pages classiques), feuille de style
// (pages à CSP stricte, avec `injectStyle: false`) et vérificateur Node.
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const common = { bundle: true, minify: true, sourcemap: true, target: ['es2020', 'safari15'], legalComments: 'none' };
await Promise.all([
  build({ ...common, entryPoints: ['src/client/index.ts'], format: 'esm', outfile: 'dist/onlc-bot-filter.mjs' }),
  build({ ...common, entryPoints: ['src/client/browser.ts'], format: 'iife', outfile: 'dist/onlc-bot-filter.js' }),
  build({ ...common, minify: false, entryPoints: ['src/server/index.ts'], format: 'esm', platform: 'node', target: 'node20', outfile: 'dist/server.mjs' }),
]);
const css = await build({ stdin: { contents: "export { CSS } from './src/client/challenge.ts';", resolveDir: '.', loader: 'ts' }, bundle: true, format: 'esm', write: false });
const { CSS } = await import(`data:text/javascript;base64,${Buffer.from(css.outputFiles[0].text).toString('base64')}`);
writeFileSync('dist/onlc-bot-filter.css', CSS.trim() + '\n');
