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

    const { firstName, lastName, phone, country, city, skills, experienceYears, educationField, desiredContracts, availableFrom } = req.body;

    const experience = experienceYears === undefined ? undefined
      : experienceYears === null || experienceYears === '' ? null : Math.max(0, Math.min(45, Number(experienceYears)));

    const availability = availableFrom === undefined ? undefined
      : availableFrom === null || availableFrom === '' ? null : new Date(availableFrom);

    const updated = await prisma.candidateProfile.update({
      where: { id: candidate.id },
      data: {
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
        ...(phone !== undefined && { phone }),
        ...(country !== undefined && { country }),
        ...(city !== undefined && { city }),
        ...(skills !== undefined && { skills }),
        ...(experience !== undefined && { experienceYears: experience }),
        ...(educationField !== undefined && { educationField }),
        ...(desiredContracts !== undefined && { desiredContracts }),
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
    if (!req.candidateImage) {
      return res.status(400).json({ error: 'Aucune image fournie.' });
    }

    const candidate = await prisma.candidateProfile.findUnique({
      where: { userId: req.user.userId },
    });
    if (!candidate) {
      return res.status(404).json({ error: 'Profil candidat introuvable.' });
    }

    if (candidate.avatarUrl) {
      const oldPath = path.join(__dirname, '../..', candidate.avatarUrl);
      await fs.unlink(oldPath).catch(() => {});
    }

    const updated = await prisma.candidateProfile.update({
      where: { id: candidate.id },
      data: { avatarUrl: req.candidateImage.url },
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

    const fields = ['firstName', 'lastName', 'phone', 'city', 'country', 'skills', 'experienceYears', 'educationField', 'cvUrl'];
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
