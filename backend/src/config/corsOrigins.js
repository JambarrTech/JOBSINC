function normalizeOrigin(value) {
  if (!value || typeof value !== 'string') return '';
  return value.trim().replace(/\/$/, '');
}

function getCorsOrigins(env = process.env) {
  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
    'http://localhost:5505',
    'http://127.0.0.1:5505',
    'http://localhost:8080',
    'http://127.0.0.1:8080',
  ];

  const envOrigins = (env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  return [...new Set([...defaultOrigins, ...envOrigins])];
}

module.exports = { getCorsOrigins };
