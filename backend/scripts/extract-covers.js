const fs = require('fs');

// Read as binary buffer and decode as latin1 to preserve bytes
const buf = fs.readFileSync('backups/JOBSINC_2026-08-23_1802.sql');
const sql = buf.toString('latin1');

const start = sql.indexOf("INSERT INTO `application` VALUES");
const end = sql.indexOf("UNLOCK TABLES;", start);
const section = sql.substring(start, end);

// Split rows by '),(' pattern
const dataStart = section.indexOf("('") + 1;
let depth = 0;
let inStr = false;
let escape = false;
const rows = [];
let rowStart = dataStart;

for (let i = dataStart; i < section.length; i++) {
  const ch = section[i];
  if (escape) { escape = false; continue; }
  if (ch === '\\') { escape = true; continue; }
  if (ch === "'" && inStr) {
    // Check for escaped ''
    if (section[i+1] === "'") { i++; continue; }
    inStr = false;
    // Check if this closes a row: next chars should be ,(
    const rest = section.substring(i+1, i+3);
    if (rest.startsWith(',(')) {
      rows.push(section.substring(rowStart, i+1));
      rowStart = i + 2;
      i++;
    } else if (rest.startsWith(')')) {
      rows.push(section.substring(rowStart, i+1));
      break;
    }
    continue;
  }
  if (ch === "'" && !inStr) { inStr = true; continue; }
}

for (const row of rows) {
  // Parse fields
  const fields = [];
  let current = '';
  let inField = false;
  let esc = false;
  
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (esc) { current += c; esc = false; continue; }
    if (c === '\\') { esc = true; current += c; continue; }
    if (c === "'" && !inField) { inField = true; continue; }
    if (c === "'" && inField) {
      if (row[i+1] === "'") { current += "'"; i++; continue; }
      inField = false;
      fields.push(current);
      current = '';
      continue;
    }
    if (inField) current += c;
  }

  if (fields.length >= 6) {
    // Convert latin1 to proper utf-8
    const coverRaw = fields[4];
    const cover = Buffer.from(coverRaw, 'latin1').toString('utf8');
    console.log('=== ' + fields[0] + ' ===');
    console.log(cover);
    console.log('');
  }
}
