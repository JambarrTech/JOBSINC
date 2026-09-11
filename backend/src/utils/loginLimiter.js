const attempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function getLockoutKey(email, ip) {
  return `${email}:${ip}`;
}

function recordFailedAttempt(email, ip) {
  const key = getLockoutKey(email, ip);
  const record = attempts.get(key) || { count: 0, firstAt: Date.now() };

  if (Date.now() - record.firstAt > LOCKOUT_MS) {
    record.count = 0;
    record.firstAt = Date.now();
  }

  record.count++;
  record.lastAt = Date.now();
  attempts.set(key, record);
}

function isLocked(email, ip) {
  const key = getLockoutKey(email, ip);
  const record = attempts.get(key);
  if (!record) return false;

  if (Date.now() - record.firstAt > LOCKOUT_MS) {
    attempts.delete(key);
    return false;
  }

  return record.count >= MAX_ATTEMPTS;
}

function clearAttempts(email, ip) {
  const key = getLockoutKey(email, ip);
  attempts.delete(key);
}

function remainingSeconds(email, ip) {
  const key = getLockoutKey(email, ip);
  const record = attempts.get(key);
  if (!record || record.count < MAX_ATTEMPTS) return 0;
  const elapsed = Date.now() - record.firstAt;
  return Math.max(0, Math.ceil((LOCKOUT_MS - elapsed) / 1000));
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts) {
    if (now - record.lastAt > LOCKOUT_MS) {
      attempts.delete(key);
    }
  }
}, 60000);

module.exports = { recordFailedAttempt, isLocked, clearAttempts, remainingSeconds };
