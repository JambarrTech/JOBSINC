const fs = require('fs');
const buf = fs.readFileSync('backups/JOBSINC_2026-08-23_1802.sql');
const sql = buf.toString('utf-8');

// Find the job INSERT section
const jobStart = sql.indexOf("INSERT INTO `job` VALUES");
const jobEnd = sql.indexOf("UNLOCK TABLES;", jobStart);
const jobSection = sql.substring(jobStart, jobEnd);

// Extract fields between VALUES and the end
const valuesStart = jobSection.indexOf("('") + 1;

function extractRow(str, startIdx) {
  const fields = [];
  let current = '';
  let inField = false;
  let i = startIdx;
  
  while (i < str.length) {
    const c = str[i];
    if (c === '\\' && inField) { current += str[i+1]; i += 2; continue; }
    if (c === "'" && !inField) { inField = true; i++; continue; }
    if (c === "'" && inField) {
      if (str[i+1] === "'") { current += "'"; i += 2; continue; }
      fields.push(current);
      current = '';
      inField = false;
      i++;
      // skip comma
      if (str[i] === ',') i++;
      // check for end of row
      if (str[i] === ')') { i++; break; }
      continue;
    }
    if (inField) { current += c; }
    i++;
  }
  return { fields, nextIdx: i };
}

let idx = valuesStart;
let count = 0;
while (idx < jobSection.length && count < 10) {
  if (jobSection[idx] === ' ') { idx++; continue; }
  if (jobSection[idx] !== "'") break;
  const result = extractRow(jobSection, idx);
  if (result.fields.length < 10) break;
  const [id, companyId, title, description, location, jobType, contractType, department, workMode, experience, salaryMin, salaryMax, currency, deadline, responsibilities, skills] = result.fields;
  console.log('=== JOB:', title, '===');
  console.log('description:', description);
  console.log('skills:', skills);
  console.log('responsibilities:', responsibilities);
  console.log('');
  idx = result.nextIdx;
  count++;
}
