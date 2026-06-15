
const fs = require('fs');
let c = fs.readFileSync('components/Dashboard.tsx', 'utf8');
c = c.replace('globalAlpha = 0.3', 'globalAlpha = 0.6');
c = c.replace('font = "bold 24px sans-serif"', 'font = "bold 36px sans-serif"');
c = c.replace('isDark ? "#9ca3af" : "#6b7280"', 'isDark ? "#d1d5db" : "#6b7280"');
c = c.replace('<button onClick={async () => {', '<button data-html2canvas-ignore="true" onClick={async () => {');
c = c.replace('ScreenshotBtn targetRef={teamReportRef} isDark={isDark} />', 'ScreenshotBtn targetRef={teamReportRef} isDark={isDark} watermarkText={watermarkText} />');
c = c.replace(/name="H\\\\u00f4m nay"/g, 'name="Hôm nay"');
fs.writeFileSync('components/Dashboard.tsx', c);
console.log('done!');

