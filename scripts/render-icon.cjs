// Renders assets/icon.svg to the PNGs the plugin and the README use (#31), and assets/insert.svg
// to the Insert best picture button's icon (#74).
// Chromium draws the SVG on a transparent page, so the PNGs never drift from the master.
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright');

const assets = path.join(__dirname, '..', 'assets');
// 96 px is the 48 dp toolbar size at the Manta's 1.875 density, rounded up.
const outputs = [
  {svg: 'icon.svg', file: 'icon.png', size: 96},
  {svg: 'icon.svg', file: 'icon-512.png', size: 512},
  {svg: 'insert.svg', file: 'insert.png', size: 96},
];

async function main() {
  const browser = await chromium.launch();
  try {
    for (const {svg: source, file, size} of outputs) {
      const svg = fs.readFileSync(path.join(assets, source), 'utf8');
      const page = await browser.newPage({viewport: {width: size, height: size}});
      await page.setContent(
        `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      );
      await page.screenshot({path: path.join(assets, file), omitBackground: true});
      await page.close();
      console.log(`rendered assets/${file} (${size} x ${size})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
