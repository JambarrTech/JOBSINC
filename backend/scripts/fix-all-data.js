const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Job 1 - Developpeur Full Stack Junior
  await p.job.update({
    where: { id: '395b80a8-85f6-4b41-96fa-6d50d3877699' },
    data: {
      description: `JambarrTech recherche un(e) Développeur(se) Full Stack Junior motivé(e) pour rejoindre son équipe et participer à la conception et au développement de solutions numériques innovantes.\n\nVous participerez à la création et à l'amélioration d'applications web et mobiles destinées à répondre à des besoins concrets des entreprises, organisations et utilisateurs.\n\nCe stage représente une opportunité de développer vos compétences techniques, de travailler sur des projets réels et d'évoluer dans un environnement technologique dynamique.`,
      skills: `Connaissances en développement web et/ou mobile.\nBonne maîtrise d'au moins un langage de programmation.\nConnaissances en JavaScript/TypeScript, Node.js, Flutter ou technologies similaires appréciées.\nNotions de bases de données SQL.\nConnaissances de Git et GitHub appréciées.\nCapacité à apprendre rapidement et à résoudre des problèmes.\nEsprit d'équipe, autonomie et curiosité.\nMotivation pour travailler sur des projets technologiques innovants.`,
      responsibilities: `Participer à la conception et au développement de nouvelles fonctionnalités.\nDévelopper et maintenir des applications web et mobiles.\nParticiper au développement et à l'intégration d'API REST.\nConcevoir et utiliser des bases de données SQL.\nCorriger les bugs et améliorer les performances des applications.\nParticiper aux tests, à la documentation et au déploiement des solutions.\nCollaborer avec les autres membres de l'équipe technique.\nProposer des améliorations techniques et fonctionnelles.`,
    },
  });
  console.log('✓ Job 1 (Developpeur Full Stack Junior) mis à jour');

  // Job 2 - Stagiaire SSI
  await p.job.update({
    where: { id: 'f15065f0-cd64-4639-bb69-3317c6b23018' },
    data: {
      description: `JambarrTech recherche un(e) Stagiaire en Sécurité des Systèmes d'Information (SSI) pour rejoindre son équipe technique.\n\nVous participerez à la sécurisation des systèmes d'information de l'entreprise, à l'analyse des vulnérabilités et à la mise en place de solutions de protection.\n\nCe stage est une opportunité d'acquérir une expérience pratique en cybersécurité au sein d'une entreprise technologique dynamique.`,
      skills: `Notions en sécurité informatique.\nConnaissance des réseaux informatiques.\nFamiliarité avec les systèmes d'exploitation Linux et Windows.\nIntérêt pour la cybersécurité et la protection des données.\nCapacité d'analyse et de rigueur.\nEsprit d'équipe et curiosité technique.`,
      responsibilities: `Participer à l'audit de sécurité des systèmes d'information.\nAnalyser les vulnérabilités et proposer des solutions.\nAssister à la mise en place de politiques de sécurité.\nParticiper au monitoring et à la détection d'intrusions.\nDocumenter les procédures et les bonnes pratiques de sécurité.`,
    },
  });
  console.log('✓ Job 2 (Stagiaire SSI) mis à jour');

  // Application 1 cover letter
  await p.application.update({
    where: { id: '24a09c0c-f2e3-4037-963f-08ed7286bec3' },
    data: {
      coverLetter: `Objet : Candidature au poste de Stagiaire Sécurité des Systèmes d'Information (SSI)\n\nMadame, Monsieur,\n\nActuellement étudiant en informatique, spécialisé dans les systèmes, réseaux et télécommunications, je souhaite rejoindre JambarrTech en tant que Stagiaire Sécurité des Systèmes d'Information.\n\nPassionné par la cybersécurité et la protection des systèmes d'information, je possède des connaissances en réseaux informatiques, systèmes d'exploitation et notions de sécurité. Je m'intéresse particulièrement à l'analyse des vulnérabilités, à la protection des données et aux bonnes pratiques en matière de sécurité informatique.\n\nÀ travers mes projets personnels et académiques, j'ai eu l'occasion de travailler sur la configuration de réseaux, l'administration de systèmes et la sécurisation d'infrastructures. Ces expériences m'ont permis de développer mon autonomie, ma capacité à résoudre des problèmes techniques et ma volonté d'apprendre continuellement.\n\nIntégrer JambarrTech représente pour moi une excellente opportunité de participer à des projets de sécurité concrets et innovants, tout en développant mes compétences au sein d'une équipe dynamique.\n\nSérieux, curieux, motivé et doté d'un bon esprit d'équipe, je suis prêt à m'investir pleinement dans les missions qui me seront confiées.\n\nJe vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.\n\nMatar MBOW\nTéléphone : 787575341\nEmail : mbowmatar00@gmail.com\nThiès, Sénégal`,
    },
  });
  console.log('✓ Application 1 cover letter mise à jour');

  // Application 2 cover letter
  await p.application.update({
    where: { id: 'c2e5725e-1465-4c31-9c68-0192d6451e65' },
    data: {
      coverLetter: `Objet : Candidature au poste de Développeur Full Stack Junior\n\nMadame, Monsieur,\n\nPassionné par le développement web et mobile, je souhaite mettre mes compétences au service de JambarrTech en tant que Développeur Full Stack Junior.\n\nMaîtrisant les technologies front-end (HTML, CSS, JavaScript, Flutter) et back-end (Node.js, Express.js, bases de données SQL), je suis capable de concevoir et développer des applications web et mobiles complètes. Mes projets personnels et académiques m'ont permis de travailler sur la conception d'API REST, la gestion d'utilisateurs et l'intégration de solutions numériques innovantes.\n\nMotivé et curieux, je suis prêt à m'investir pleinement dans les missions qui me seront confiées et à contribuer activement au développement de solutions adaptées aux besoins des utilisateurs et aux réalités du marché sénégalais.\n\nSérieux, curieux, motivé et doté d'un bon esprit d'équipe, je suis prêt à m'investir pleinement dans les missions qui me seront confiées.\n\nJe serais heureux de pouvoir échanger avec vous afin de vous présenter plus en détail mon parcours, mes compétences et mes projets.\n\nJe vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.\n\nMatar MBOW\nTéléphone : 787575341\nEmail : mbowmatar00@gmail.com\nThiès, Sénégal`,
    },
  });
  console.log('✓ Application 2 cover letter mise à jour');
}

main().finally(() => p.$disconnect());
