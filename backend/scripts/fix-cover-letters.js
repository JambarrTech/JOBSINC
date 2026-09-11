const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const cover1 = `Objet : Candidature au poste de Développeur Web & Mobile

Madame, Monsieur,

Actuellement étudiant en informatique, spécialisé dans les systèmes, réseaux et télécommunications, je souhaite rejoindre JambarrTech en tant que Développeur Web & Mobile.

Passionné par le développement logiciel et les nouvelles technologies, je possède des connaissances en développement web avec HTML, CSS et JavaScript, ainsi qu'en développement mobile avec Flutter et Dart. Je m'intéresse également au développement backend avec Node.js et Express.js, à la conception d'API REST et à l'utilisation de bases de données SQL.

À travers mes projets personnels et académiques, j'ai eu l'occasion de travailler sur la conception d'applications web et mobiles, la gestion des utilisateurs, les interfaces, les API et les bases de données. Ces expériences m'ont permis de développer mon autonomie, ma capacité à résoudre des problèmes techniques et ma volonté d'apprendre continuellement.

Intégrer JambarrTech représente pour moi une excellente opportunité de participer à des projets numériques concrets et innovants, tout en développant mes compétences au sein d'une équipe dynamique. Je suis particulièrement motivé à contribuer à la conception de solutions adaptées aux besoins des utilisateurs et aux réalités du marché sénégalais.

Sérieux, curieux, motivé et doté d'un bon esprit d'équipe, je suis prêt à m'investir pleinement dans les missions qui me seront confiées.

Je serais heureux de pouvoir échanger avec vous afin de vous présenter plus en détail mon parcours, mes compétences et mes projets.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

Matar MBOW
Téléphone : 787575341
Email : mbowmatar00@gmail.com
Thiès, Sénégal`;

const cover2 = `Objet : Candidature au poste de Développeur Full Stack Junior

Madame, Monsieur,

Passionné par le développement web et mobile, je souhaite mettre mes compétences au service de JambarrTech en tant que Développeur Full Stack Junior.

Maîtrisant les technologies front-end (HTML, CSS, JavaScript, React) et back-end (Node.js, Express.js, bases de données SQL), je suis capable de concevoir et développer des applications web complètes. Mes projets personnels et académiques m'ont permis de travailler sur la conception d'API REST, la gestion d'utilisateurs et l'intégration de solutions numériques innovantes.

Motivé et curieux, je suis prêt à m'investir pleinement dans les missions qui me seront confiées et à contribuer activement au développement de solutions adaptées aux besoins des utilisateurs.

Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.

Matar MBOW
Téléphone : 787575341
Email : mbowmatar00@gmail.com
Thiès, Sénégal`;

async function main() {
  await p.application.update({
    where: { id: '24a09c0c-f2e3-4037-963f-08ed7286bec3' },
    data: { coverLetter: cover1 },
  });
  console.log('✓ Application 1 mise à jour');

  await p.application.update({
    where: { id: 'c2e5725e-1465-4c31-9c68-0192d6451e65' },
    data: { coverLetter: cover2 },
  });
  console.log('✓ Application 2 mise à jour');
}

main().finally(() => p.$disconnect());
