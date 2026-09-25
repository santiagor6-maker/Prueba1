/** Folds dist/assets/*.js|css into dist/index.html so the app is a single file that opens from disk (file://). */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

let html = readFileSync('dist/index.html', 'utf8');
html = html.replace(/<script type="module" crossorigin src="\.?\/?(assets\/[^"]+\.js)"><\/script>/g, (_m, f: string) => {
  const js = readFileSync(`dist/${f}`, 'utf8').replaceAll('</script', '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.?\/?(assets\/[^"]+\.css)">/g, (_m, f: string) => `<style>${readFileSync(`dist/${f}`, 'utf8')}</style>`);
if (/src="\.?\/?assets\//.test(html) || /href="\.?\/?assets\//.test(html)) throw new Error('Unresolved asset reference in dist/index.html');
writeFileSync('dist/index.html', html);
rmSync('dist/assets', { recursive: true, force: true });
console.log(`dist/index.html: ${(html.length / 1024).toFixed(0)} KB, self-contained`);
