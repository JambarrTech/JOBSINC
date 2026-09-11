const fs = require('fs');
const buf = fs.readFileSync('backups/JOBSINC_2026-08-23_1802.sql');

// Find the job description in raw bytes
const search = Buffer.from("'JambarrTech recherche");
const idx = buf.indexOf(search);
if (idx === -1) { console.log('Not found'); process.exit(1); }

// Check bytes around the accent
console.log('Bytes around "Dveloppeur":');
for (let i = idx + 32; i < idx + 50; i++) {
  process.stdout.write(buf[i].toString(16).padStart(2, '0') + ' ');
}
console.log('');
console.log('As utf8:', buf.slice(idx + 32, idx + 50).toString('utf-8'));
console.log('As latin1:', buf.slice(idx + 32, idx + 50).toString('latin1'));
