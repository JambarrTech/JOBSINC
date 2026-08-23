const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function error(res, status, message) {
  return res.status(status).json({ error: message });
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function candidateDto(candidate) {
  if (!candidate) return null;
  return {
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    phone: candidate.phone,
    birthDate: candidate.birthDate,
    country: candidate.country,
    city: candidate.city,
    avatarUrl: candidate.avatarUrl,
    cvUrl: candidate.cvUrl,
    skills: candidate.skills,
  };
}

function userDto(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    candidate: candidateDto(user.candidate),
  };
}

function createToken(user) {
  return jwt.sign(
    { userId: user.id, id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' },
  );
}

exports.registerCandidate = async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) return error(res, 500, 'Configuration de sécurité incomplète.');

    const email = clean(req.body.email).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const firstName = clean(req.body.firstName);
    const lastName = clean(req.body.lastName);
    const phone = clean(req.body.phone);
    const country = clean(req.body.country);
    const city = clean(req.body.city);
    const birthDate = req.body.birthDate ? new Date(req.body.birthDate) : null;

    if (!emailPattern.test(email)) return error(res, 400, 'Veuillez saisir une adresse email valide.');
    if (password.length < 8) return error(res, 400, 'Le mot de passe doit contenir au moins 8 caractères.');
    if (firstName.length < 2 || lastName.length < 2) return error(res, 400, 'Le prénom et le nom doivent contenir au moins 2 caractères.');
    if (!phone || phone.replace(/\D/g, '').length < 8) return error(res, 400, 'Veuillez saisir un numéro de téléphone valide.');
    if (!country || !city) return error(res, 400, 'Le pays et la ville sont obligatoires.');
    if (!birthDate || Number.isNaN(birthDate.getTime())) return error(res, 400, 'Veuillez saisir une date de naissance valide.');

    const now = new Date();
    let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
    const birthdayThisYear = new Date(Date.UTC(now.getUTCFullYear(), birthDate.getUTCMonth(), birthDate.getUTCDate()));
    if (now < birthdayThisYear) age -= 1;
    if (age < 16 || age > 100) return error(res, 400, 'Vous devez avoir entre 16 et 100 ans pour créer un compte.');

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return error(res, 409, 'Cette adresse email est déjà utilisée.');

    const avatarUrl = req.candidateImage ? req.candidateImage.url : null;

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'CANDIDATE',
        candidate: { create: { firstName, lastName, phone, birthDate, country, city, avatarUrl } },
      },
      include: { candidate: true },
    });

    const token = createToken(user);

    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          title: 'Bienvenue sur JOBSINC !',
          body: `Bienvenue ${firstName} ! Créez votre profil complet pour maximiser vos chances.`,
          type: 'GENERAL',
        },
        {
          userId: user.id,
          title: 'Complétez votre profil',
          body: 'Ajoutez votre CV et vos compétences pour attirer les recruteurs.',
          type: 'GENERAL',
        },
        {
          userId: user.id,
          title: 'Explorez les offres',
          body: 'Des milliers d\'offres d\'emploi vous attendent. Commencez votre recherche maintenant !',
          type: 'APPLICATION',
        },
      ],
    });

    return res.status(201).json({ message: 'Compte créé avec succès.', token, user: userDto(user) });
  } catch (cause) {
    console.error('Erreur inscription:', cause);
    return error(res, 500, 'Impossible de créer le compte pour le moment.');
  }
};

exports.loginCandidate = async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) return error(res, 500, 'Configuration de sécurité incomplète.');
    const email = clean(req.body.email).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) return error(res, 400, 'L’adresse email et le mot de passe sont obligatoires.');

    const user = await prisma.user.findUnique({ where: { email }, include: { candidate: true } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return error(res, 401, 'Identifiants invalides.');

    if (user.role !== 'CANDIDATE') {
      return error(res, 403, 'Accès réservé aux candidats.');
    }

    return res.json({ message: 'Connexion réussie.', token: createToken(user), user: userDto(user) });
  } catch (cause) {
    console.error('Erreur connexion:', cause);
    return error(res, 500, 'Impossible de vous connecter pour le moment.');
  }
};

exports.registerCompany = async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) return error(res, 500, 'Configuration de sécurité incomplète.');

    const email = clean(req.body.email).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const companyName = clean(req.body.companyName);

    if (!emailPattern.test(email)) return error(res, 400, 'Veuillez saisir une adresse email valide.');
    if (password.length < 8) return error(res, 400, 'Le mot de passe doit contenir au moins 8 caractères.');
    if (companyName.length < 2) return error(res, 400, 'Le nom de l\'entreprise doit contenir au moins 2 caractères.');

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return error(res, 409, 'Cette adresse email est déjà utilisée.');

    const passwordHash = await bcrypt.hash(password, 12);
    
    const companyImagesData = req.companyImages && req.companyImages.length > 0
        ? {
            create: req.companyImages.map((img, index) => ({
              url: img.url,
              sortOrder: index,
              isPrimary: index === 0
            }))
          }
        : undefined;

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'RECRUITER',
        company: {
          create: {
            name: companyName,
            logo: req.companyLogo?.url || null,
            images: companyImagesData,
          }
        },
      },
    });

    return res.status(201).json({ message: 'Compte entreprise créé avec succès.', token: createToken(user), user: { id: user.id, email: user.email, role: user.role } });
  } catch (cause) {
    console.error('Erreur inscription entreprise:', cause);
    return error(res, 500, 'Impossible de créer le compte pour le moment.');
  }
};

exports.loginCompany = async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) return error(res, 500, 'Configuration de sécurité incomplète.');
    const email = clean(req.body.email).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!email || !password) return error(res, 400, 'L’adresse email et le mot de passe sont obligatoires.');

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return error(res, 401, 'Identifiants invalides.');

    if (user.role !== 'RECRUITER' && user.role !== 'EMPLOYER' && user.role !== 'ADMIN') {
      return error(res, 403, 'Accès réservé aux entreprises.');
    }

    return res.json({ message: 'Connexion réussie.', token: createToken(user), user: { id: user.id, email: user.email, role: user.role } });
  } catch (cause) {
    console.error('Erreur connexion entreprise:', cause);
    return error(res, 500, 'Impossible de vous connecter pour le moment.');
  }
};

exports.getMe = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return error(res, 401, 'Session invalide ou expirée.');
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { candidate: true } });
    if (!user) return error(res, 404, 'Utilisateur introuvable.');
    return res.json({ success: true, user: userDto(user) });
  } catch (cause) {
    console.error('Erreur session:', cause);
    return error(res, 500, 'Impossible de récupérer votre session.');
  }
};
