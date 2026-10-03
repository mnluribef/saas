const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'public', 'style.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

const migrations = [
  { header: '/* ===================== HEADER ===================== */', endHeader: '/* =====================', file: 'src/components/layout/Header.astro', global: true },
  { header: '/* ===================== NAVIGATION ===================== */', endHeader: '/* ===================== CTA BUTTONS ===================== */', file: 'src/components/layout/Header.astro', global: true },
  { header: '/* ===================== FOOTER ===================== */', endHeader: '/* ===================== FLOATING BUTTONS ===================== */', file: 'src/components/layout/Footer.astro', global: true },
];

for (const m of migrations) {
  if (!fs.existsSync(path.join(__dirname, '..', m.file))) continue;

  const startIdx = cssContent.indexOf(m.header);
  if (startIdx === -1) continue;

  let endIdx = cssContent.indexOf(m.endHeader, startIdx + m.header.length);
  if (endIdx === -1) {
    endIdx = cssContent.length;
  }

  const extractedCss = cssContent.substring(startIdx, endIdx).trim();
  
  if (extractedCss) {
    const targetFile = path.join(__dirname, '..', m.file);
    let astroContent = fs.readFileSync(targetFile, 'utf8');
    
    const styleTag = m.global ? '<style is:global>' : '<style>';
    astroContent += `\n\n${styleTag}\n${extractedCss}\n</style>\n`;
    fs.writeFileSync(targetFile, astroContent);

    cssContent = cssContent.substring(0, startIdx) + cssContent.substring(endIdx);
  }
}

fs.writeFileSync(cssPath, cssContent.trim() + '\n');
console.log('Migration complete');
