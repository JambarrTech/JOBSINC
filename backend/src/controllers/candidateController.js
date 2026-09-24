const prisma = require('../config/prisma');
const fs = require('fs/promises');
const path = require('path');

exports.getProfile = async (req, res) => {
  try {
    const candidate = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.userId },
      include: { user: { select: { email: true } } },
    });
    if (!candidate) {
      return res.status(404).json({ error: 'Profil candidat introuvable.' });
    }
    res.json({
      id: candidate.id,
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      phone: candidate.phone,
      birthDate: candidate.birthDate,
      country: candidate.country,
      city: candidate.city,
      avatarUrl: candidate.avatarUrl,
      cvUrl: candidate.cvUrl,
      skills: candidate.skills,
      experienceYears: candidate.experienceYears,
      educationLevel: candidate.educationLevel,
      educationField: candidate.educationField,
      desiredContracts: candidate.desiredContracts,
      availableFrom: candidate.availableFrom,
      email: candidate.user.email,
    });
  } catch (error) {
    console.error('Erreur getProfile:', error);
    res.status(500).json({ error: 'Impossible de récupérer le profil.' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const candidate = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.userId },
    });
    if (!candidate) {
      return res.status(404).json({ error: 'Profil candidat introuvable.' });
    }

    const { firstName, lastName, phone, country, city, skills, experienceYears, educationLevel, educationField, desiredContracts, availableFrom } = req.body;

    // Validation / sanitization
    const sanitized = {};
    if (firstName !== undefined) {
      if (typeof firstName !== 'string' || firstName.trim().length > 50) return res.status(400).json({ error: 'Prénom invalide (max 50).' });
      sanitized.firstName = firstName.trim();
    }
    if (lastName !== undefined) {
      if (typeof lastName !== 'string' || lastName.trim().length > 50) return res.status(400).json({ error: 'Nom invalide (max 50).' });
      sanitized.lastName = lastName.trim();
    }
    if (phone !== undefined) sanitized.phone = typeof phone === 'string' ? phone.trim().slice(0, 30) : phone;
    if (country !== undefined) sanitized.country = typeof country === 'string' ? country.trim().slice(0, 60) : country;
    if (city !== undefined) sanitized.city = typeof city === 'string' ? city.trim().slice(0, 60) : city;
    if (skills !== undefined) sanitized.skills = typeof skills === 'string' ? skills.slice(0, 5000) : skills;
    if (educationLevel !== undefined) sanitized.educationLevel = educationLevel;
    if (educationField !== undefined) sanitized.educationField = educationField;
    if (desiredContracts !== undefined) sanitized.desiredContracts = desiredContracts;

    let experience;
    if (experienceYears === undefined) experience = undefined;
    else if (experienceYears === null || experienceYears === '') experience = null;
    else {
      const num = Number(experienceYears);
      if (Number.isNaN(num)) return res.status(400).json({ error: 'experienceYears doit être un nombre.' });
      experience = Math.max(0, Math.min(45, num));
    }

    let availability;
    if (availableFrom === undefined) availability = undefined;
    else if (availableFrom === null || availableFrom === '') availability = null;
    else {
      const d = new Date(availableFrom);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'availableFrom invalide.' });
      availability = d;
    }

    const updated = await prisma.candidateProfile.update({
      where: { id: candidate.id },
      data: {
        ...(sanitized.firstName !== undefined && { firstName: sanitized.firstName }),
        ...(sanitized.lastName !== undefined && { lastName: sanitized.lastName }),
        ...(sanitized.phone !== undefined && { phone: sanitized.phone }),
        ...(sanitized.country !== undefined && { country: sanitized.country }),
        ...(sanitized.city !== undefined && { city: sanitized.city }),
        ...(sanitized.skills !== undefined && { skills: sanitized.skills }),
        ...(experience !== undefined && { experienceYears: experience }),
        ...(sanitized.educationLevel !== undefined && { educationLevel: sanitized.educationLevel }),
        ...(sanitized.educationField !== undefined && { educationField: sanitized.educationField }),
        ...(sanitized.desiredContracts !== undefined && { desiredContracts: sanitized.desiredContracts }),
        ...(availability !== undefined && { availableFrom: availability }),
      },
      include: { user: { select: { email: true } } },
    });

    res.json({
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      phone: updated.phone,
      birthDate: updated.birthDate,
      country: updated.country,
      city: updated.city,
      avatarUrl: updated.avatarUrl,
      cvUrl: updated.cvUrl,
      skills: updated.skills,
      experienceYears: updated.experienceYears,
      educationLevel: updated.educationLevel,
      educationField: updated.educationField,
      desiredContracts: updated.desiredContracts,
      availableFrom: updated.availableFrom,
      email: updated.user.email,
    });
  } catch (error) {
    console.error('Erreur updateProfile:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour le profil.' });
  }
};

exports.uploadCv = async (req, res) => {
  try {
    if (!req.cvFile) {
      return res.status(400).json({ error: 'Aucun fichier CV fourni.' });
    }

    const candidate = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.userId },
    });
    if (!candidate) {
      return res.status(404).json({ error: 'Profil candidat introuvable.' });
    }

    if (candidate.cvUrl) {
      if (candidate.cvUrl.startsWith('/uploads/')) {
        const { removeLocal } = require('../services/storageService');
        await removeLocal(candidate.cvUrl).catch(() => {});
      } else {
        const oldPath = path.join(__dirname, '../..', '.' + candidate.cvUrl);
        await fs.unlink(oldPath).catch(() => {});
      }
    }
    const updated = await prisma.candidateProfile.update({
      where: { id: candidate.id },
      data: { cvUrl: req.cvFile.url },
    });

    res.json({
      message: 'CV uploadé avec succès.',
      cvUrl: updated.cvUrl,
    });
  } catch (error) {
    console.error('Erreur uploadCv:', error);
    res.status(500).json({ error: 'Impossible d\'uploader le CV.' });
  }
};

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.avatarFile) {
      return res.status(400).json({ error: 'Aucune image fournie.' });
    }

    const candidate = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.userId },
    });
    if (!candidate) {
      return res.status(404).json({ error: 'Profil candidat introuvable.' });
    }

    if (candidate.avatarUrl) {
      if (candidate.avatarUrl.startsWith('/uploads/')) {
        const { removeLocal } = require('../services/storageService');
        await removeLocal(candidate.avatarUrl).catch(() => {});
      } else {
        const oldPath = path.join(__dirname, '../..', '.' + candidate.avatarUrl);
        await fs.unlink(oldPath).catch(() => {});
      }
    }

    const updated = await prisma.candidateProfile.update({
      where: { id: candidate.id },
      data: { avatarUrl: req.avatarFile.url },
    });

    res.json({
      message: 'Photo de profil mise à jour.',
      avatarUrl: updated.avatarUrl,
    });
  } catch (error) {
    console.error('Erreur uploadAvatar:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour la photo de profil.' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const candidate = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.userId },
    });
    if (!candidate) {
      return res.status(404).json({ error: 'Profil candidat introuvable.' });
    }

    const [totalApplications, interviewCount, acceptedCount, rejectedCount, savedCount, profile] =
      await Promise.all([
        prisma.application.count({ where: { candidateProfileId: candidate.id } }),
        prisma.application.count({ where: { candidateProfileId: candidate.id, status: 'INTERVIEW' } }),
        prisma.application.count({ where: { candidateProfileId: candidate.id, status: 'ACCEPTED' } }),
        prisma.application.count({ where: { candidateProfileId: candidate.id, status: 'REJECTED' } }),
        prisma.savedJob.count({ where: { userId: req.user.userId } }),
        prisma.candidateProfile.findUnique({ where: { id: candidate.id } }),
      ]);

    const fields = ['firstName', 'lastName', 'phone', 'city', 'country', 'skills', 'experienceYears', 'educationLevel', 'educationField', 'cvUrl'];
    const filled = fields.filter((f) => profile[f] != null && profile[f] !== '').length;
    const completion = Math.round((filled / fields.length) * 100);

    const interviewRate = totalApplications > 0 ? Math.round((interviewCount / totalApplications) * 100) : 0;
    const acceptRate = totalApplications > 0 ? Math.round((acceptedCount / totalApplications) * 100) : 0;

    res.json({
      totalApplications,
      interviewCount,
      acceptedCount,
      rejectedCount,
      savedCount,
      profileCompletion: completion,
      interviewRate,
      acceptRate,
    });
  } catch (error) {
    console.error('Erreur getStats:', error);
    res.status(500).json({ error: 'Impossible de charger les statistiques.' });
  }
};
