const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ where: { role: 'CANDIDATE' } });

  if (users.length === 0) {
    console.log('Aucun candidat trouvé. Inscrivez-vous d\'abord.');
    return;
  }

  for (const user of users) {
    const count = await prisma.notification.count({ where: { userId: user.id } });
    if (count > 0) {
      console.log(`⏭ ${user.email} a déjà ${count} notifications.`);
      continue;
    }

    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          title: 'Bienvenue sur JOBSINC !',
          body: 'Merci de votre inscription. Complétez votre profil pour maximiser vos chances.',
          type: 'GENERAL',
        },
        {
          userId: user.id,
          title: 'Nouvelle offre : Développeur Flutter Senior',
          body: 'TechCorp Solutions recrute un Développeur Flutter Senior à Paris. Offre correspondant à votre profil.',
          type: 'APPLICATION',
          link: '/candidate/home',
        },
        {
          userId: user.id,
          title: 'Candidature reçue',
          body: 'Votre candidature pour Backend Developer chez DataFlow a bien été reçue. Nous l\'examinerons sous 48h.',
          type: 'APPLICATION',
        },
        {
          userId: user.id,
          title: 'Entretien planifié',
          body: 'Entretien video prévu demain à 14h00 avec TechCorp Solutions pour le poste Développeur Flutter Senior.',
          type: 'INTERVIEW',
          link: '/candidate/home',
        },
        {
          userId: user.id,
          title: 'Nouveau message de RecruitPro',
          body: 'Vous avez reçu un nouveau message de la part du recruteur chez RecruitPro.',
          type: 'MESSAGE',
        },
        {
          userId: user.id,
          title: 'Profil à 60%',
          body: 'Votre profil est complet à 60%. Ajoutez vos compétences et votre CV pour atteindre 100%.',
          type: 'GENERAL',
        },
        {
          userId: user.id,
          title: 'Offre sauvegardée bientôt expirée',
          body: 'L\'offre "DevOps Engineer" chez CloudBase que vous avez sauvegardée expire dans 3 jours.',
          type: 'APPLICATION',
          link: '/candidate/home',
        },
      ],
    });

    console.log(`✅ 7 notifications créées pour ${user.email}`);
  }
}

main()
  .catch((e) => { console.error('Erreur:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
