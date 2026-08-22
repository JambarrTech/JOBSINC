const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./src/routes/authRoutes');
const companyRoutes = require('./src/routes/companyRoutes');
const publicCompanyRoutes = require('./src/routes/publicCompanyRoutes');
const jobRoutes = require('./src/routes/jobRoutes');
const applicationRoutes = require('./src/routes/applicationRoutes');
const interviewRoutes = require('./src/routes/interviewRoutes');
const candidateRoutes = require('./src/routes/candidateRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const statsRoutes = require('./src/routes/statsRoutes');
const messageRoutes = require('./src/routes/messageRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const path = require('path');

const app = express();

// Autoriser le frontend Next.js (port 3000)
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/companies', publicCompanyRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/candidate', candidateRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/company/messages', messageRoutes);
app.use('/api/admin', adminRoutes);

app.use((error, req, res, next) => {
  if (error?.status === 400) return res.status(400).json({ error: error.message });
  console.error('Erreur API:', error);
  return res.status(500).json({ error: 'Erreur serveur.' });
});

app.get('/', (req, res) => {
  res.send('🚀 Serveur JOBSYNC opérationnel !');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Serveur démarré sur http://0.0.0.0:${PORT}`);
});
