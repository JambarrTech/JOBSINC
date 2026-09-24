const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const DEMO_COMPANIES = [
  {
    name: 'Jumia',
    sector: 'E-commerce & Logistique',
    city: 'Casablanca',
    country: 'Maroc',
    description: 'Leader du e-commerce en Afrique. Jumia offre une plateforme complète de ventes en ligne, logistique et services financiers à travers 11 pays africains.',
    logo: '/uploads/companies/jumia-logo.png',
    jobs: [
      {
        title: 'Responsable Logistique',
        description: 'Pilotez les opérations logistiques au Maroc. Gestion des entrepôts, livraison last-mile et optimisation des coûts.',
        location: 'Casablanca, Maroc',
        contractType: 'CDI',
        department: 'Logistique',
        workMode: 'ONSITE',
        experience: '5-8 ans',
        salaryMin: 350000,
        salaryMax: 550000,
        currency: 'MAD',
        skills: 'Supply Chain,Gestion d\'entrepôt,Livraison,Excel,SAP',
        responsibilities: 'Superviser les opérations entrepôt et livraison\nOptimiser les circuits logistiques\nGérer les équipes terrain\nNégocier avec les partenaires transporteurs',
      },
      {
        title: 'Data Analyst E-commerce',
        description: 'Exploitez les données de la plus grande plateforme e-commerce africaine pour optimiser l\'expérience client et la performance commerciale.',
        location: 'Casablanca, Maroc',
        contractType: 'CDI',
        department: 'Data & Analytics',
        workMode: 'ONSITE',
        experience: '2-4 ans',
        salaryMin: 250000,
        salaryMax: 400000,
        currency: 'MAD',
        skills: 'SQL,Python,Tableau,Excel,Power BI,A/B Testing',
        responsibilities: 'Analyser les données de ventes et de trafic\nCréer des tableaux de bord et reports automatisés\nIdentifier les opportunités de croissance\nAppuyer la prise de décision produit',
      },
    ],
  },
  {
    name: 'Flutterwave',
    sector: 'Fintech & Paiements',
    city: 'Lagos',
    country: 'Nigeria',
    description: 'Fintech panafricaine de paiements numériques. Flutterwave permet aux entreprises et particuliers de réaliser des transactions sécurisées dans plus de 30 pays africains et au-delà.',
    logo: '/uploads/companies/flutterwave-logo.png',
    jobs: [
      {
        title: 'Product Designer',
        description: 'Donnez vie aux expériences de paiement utilisées par des millions d\'Africains. Design thinking, prototypage et recherches utilisateurs.',
        location: 'Accra, Ghana',
        contractType: 'CDI',
        department: 'Design',
        workMode: 'REMOTE',
        experience: '3-5 ans',
        salaryMin: 55000,
        salaryMax: 85000,
        currency: 'USD',
        skills: 'Figma,Design System,User Research,Prototyping,UX Writing',
        responsibilities: 'Concevoir des interfaces utilisateur intuitives\nRéaliser des recherches utilisateurs qualitatives et quantitatives\nMaintenir et faire évoluer le design system\nCollaborer étroitement avec l\'équipe produit',
      },
      {
        title: 'Backend Engineer - Payments',
        description: 'Construisez les API de paiement qui connectent l\'Afrique au monde. Systèmes distribués haute disponibilité, transactions temps réel.',
        location: 'Lagos, Nigeria',
        contractType: 'CDI',
        department: 'Engineering',
        workMode: 'HYBRID',
        experience: '3-5 ans',
        salaryMin: 70000,
        salaryMax: 110000,
        currency: 'USD',
        skills: 'Go,Java,PostgreSQL,Redis,Kafka,Microservices',
        responsibilities: 'Concevoir et développer des API de paiement haute disponibilité\nGarantir la sécurité et la conformité PCI-DSS\nOptimiser les performances et la latence\nParticiper aux astreintes production',
      },
    ],
  },
  {
    name: 'Andela',
    sector: 'Technologies & Ingénierie',
    city: 'Lagos',
    country: 'Nigeria',
    description: 'Plateforme mondiale de talents technologiques. Andela connecte les meilleures ingénieurs africains avec des entreprises leaders du marché pour des missions à forte valeur ajoutée.',
    logo: '/uploads/companies/andela-logo.png',
    jobs: [
      {
        title: 'Mobile Developer Flutter',
        description: 'Développez des applications mobiles cross-platform pour des clients internationaux. Rejoignez une communauté de plus de 100 000 développeurs africains.',
        location: 'Nairobi, Kenya',
        contractType: 'CDI',
        department: 'Mobile',
        workMode: 'REMOTE',
        experience: '2-4 ans',
        salaryMin: 50000,
        salaryMax: 80000,
        currency: 'USD',
        skills: 'Flutter,Dart,Firebase,REST API,State Management,CI/CD',
        responsibilities: 'Développer des applications Flutter haute qualité\nÉcrire des tests unitaires et d\'intégration\nOptimiser les performances mobiles\nCollaborer avec le design system',
      },
      {
        title: 'Senior Full-Stack Developer',
        description: 'Rejoignez Andela pour travailler sur des projets d\'envergure pour nos clients Fortune 500. Stack React/Node.js, environnement international.',
        location: 'Lagos, Nigeria',
        contractType: 'CDI',
        department: 'Engineering',
        workMode: 'REMOTE',
        experience: '4-7 ans',
        salaryMin: 80000,
        salaryMax: 120000,
        currency: 'USD',
        skills: 'React,Node.js,TypeScript,PostgreSQL,GraphQL,REST API',
        responsibilities: 'Développer des applications full-stack performantes\nParticiper aux revues de code et mentorer les juniors\nCollaborer avec les équipes produit et design\nContribuer à l\'architecture technique',
      },
    ],
  },
  {
    name: 'Orange Telecom',
    sector: 'Télécommunications',
    city: 'Paris',
    country: 'France',
    description: 'Opérateur de télécommunications leader en Afrique et en Europe. Orange accompagne la transformation numérique avec des solutions mobiles, internet et cloud pour des millions de clients.',
    logo: '/uploads/companies/orange-logo.png',
    jobs: [
      {
        title: 'Chef de Projet Digital',
        description: 'Pilotez le développement de nos applications mobiles et web grand public. Gestion d\'équipe Agile, recettes fonctionnelles et suivi des KPI.',
        location: 'Abidjan, Côte d\'Ivoire',
        contractType: 'CDI',
        department: 'Digital',
        workMode: 'ONSITE',
        experience: '4-7 ans',
        salaryMin: 3500000,
        salaryMax: 5000000,
        currency: 'XOF',
        skills: 'Gestion de projet,Agile,Jira,Analyse fonctionnelle,SQL',
        responsibilities: 'Piloter le cycle de vie des projets digitaux\nCoordonner les équipes techniques et fonctionnelles\nRédiger les spécifications et valider les livrables\nAssurer le reporting auprès de la direction',
      },
      {
        title: 'Ingénieur DevOps Cloud',
        description: 'Rejoignez notre équipe infrastructure pour déployer et maintenir nos services cloud de nouvelle génération. Vous travaillerez sur des clusters Kubernetes, du CI/CD et de l\'observabilité.',
        location: 'Paris, France',
        contractType: 'CDI',
        department: 'Infrastructure',
        workMode: 'HYBRID',
        experience: '3-5 ans',
        salaryMin: 52000,
        salaryMax: 68000,
        currency: 'EUR',
        skills: 'Kubernetes,Docker,AWS,Terraform,CI/CD,Linux',
        responsibilities: 'Déployer et maintenir les infrastructures cloud\nAutomatiser les pipelines CI/CD\nMonitorer les performances des services\nParticiper aux astreintes technique',
      },
    ],
  },
];

async function main() {
  console.log('🌱 Seed démo JOBSINC — 4 entreprises / 8 offres');
  const passwordHash = await bcrypt.hash('Demo1234!', 10);

  for (const comp of DEMO_COMPANIES) {
    const email = `${comp.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@demo.jobsinc.com`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash,
        role: 'RECRUITER',
        emailVerified: true,
      },
    });

    const company = await prisma.company.upsert({
      where: { userId: user.id },
      update: {
        name: comp.name,
        sector: comp.sector,
        city: comp.city,
        country: comp.country,
        description: comp.description,
        logo: comp.logo,
        isApproved: true,
      },
      create: {
        userId: user.id,
        name: comp.name,
        sector: comp.sector,
        city: comp.city,
        country: comp.country,
        description: comp.description,
        logo: comp.logo,
        isApproved: true,
      },
    });

    for (const j of comp.jobs) {
      const existing = await prisma.job.findFirst({ where: { companyId: company.id, title: j.title } });
      if (existing) {
        console.log(`⏭ Offre existante : ${j.title} @ ${comp.name}`);
        continue;
      }
      await prisma.job.create({
        data: {
          companyId: company.id,
          title: j.title,
          description: j.description,
          location: j.location,
          contractType: j.contractType,
          jobType: 'FULL_TIME',
          department: j.department,
          workMode: j.workMode,
          experience: j.experience,
          salaryMin: j.salaryMin,
          salaryMax: j.salaryMax,
          currency: j.currency,
          skills: j.skills,
          responsibilities: j.responsibilities,
          isOpen: true,
        },
      });
      console.log(`✅ Offre créée : ${j.title} @ ${comp.name}`);
    }
  }

  const counts = await Promise.all([prisma.company.count(), prisma.job.count(), prisma.user.count()]);
  console.log(`\n📊 Résumé : ${counts[0]} entreprises, ${counts[1]} offres, ${counts[2]} users`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
