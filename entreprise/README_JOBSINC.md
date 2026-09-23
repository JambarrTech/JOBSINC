# JOBSINC - Frontend Entreprise

Bienvenue dans le frontend entreprise de JOBSINC, la plateforme de recrutement moderne et performante.

## 🚀 Technologies

- **Next.js 16.3.0** - Framework React avec SSR/SSG
- **React 19.2.8** - Bibliothèque UI
- **TypeScript** - Typage statique
- **Tailwind CSS 4** - Utilitaires CSS
- **ESLint** - Linting du code

## 📁 Structure du Projet

```
entreprise/
├── app/
│   ├── page.tsx              # Page d'accueil
│   ├── layout.tsx            # Layout principal
│   ├── globals.css           # Styles globaux
│   ├── login/page.tsx        # Page de connexion
│   └── register/page.tsx     # Page d'inscription
├── components/
│   ├── layout/
│   │   ├── Header.tsx        # En-tête avec navigation
│   │   └── Footer.tsx        # Pied de page
│   ├── home/
│   │   ├── Hero.tsx          # Section héro
│   │   ├── Stats.tsx         # Section statistiques
│   │   ├── Solutions.tsx     # Section solutions
│   │   ├── HowItWorks.tsx    # Section processus
│   │   ├── CompanyCarousel.tsx # Carousel entreprises
│   │   ├── WhyJobsinc.tsx    # Section avantages
│   │   └── FinalCTA.tsx      # Appel à l'action final
│   └── ui/
│       └── Button.tsx        # Composant bouton réutilisable
├── lib/
│   └── api.js               # Configuration API (prêt pour backend)
├── public/
│   ├── logo.png             # Logo JOBSINC
│   └── images/              # Images du site
└── package.json

```

## 🎨 Identité Visuelle

Palette de couleurs JOBSINC :

- **Bleu principal** : `#0B5FE0`
- **Bleu nuit (navy)** : `#071D3A`
- **Bleu clair (accent)** : `#3B8BFF`
- **Fond** : `#F4F7FB`
- **Blanc** : `#FFFFFF`
- **Sémantique conservée** : rouge (`#E74C3C`) erreurs/rejets, ambre (`#F7B731`) alertes/avertissements.

## 🏠 Sections de la Page d'Accueil

### 1. **Header**
Navigation sticky avec menu responsive et CTAs

### 2. **Hero**
Message principal : "Connectez les bons talents à vos ambitions"
- Sous-titre explicatif
- CTAs principales (Créer un compte, Découvrir)
- Illustration de plateforme

### 3. **Statistiques**
Chiffres clés avec animations :
- +1 000 candidats
- +150 entreprises
- +300 offres
- +500 recrutements

### 4. **Solutions**
4 fonctionnalités principales :
- Publier vos offres
- Gérer vos candidatures
- Identifier les meilleurs profils
- Suivre votre recrutement

### 5. **Processus (How It Works)**
Timeline 4 étapes :
1. Créez votre espace entreprise
2. Publiez vos opportunités
3. Recevez les candidatures
4. Trouvez votre talent

### 6. **Carousel Entreprises**
Défilement automatique des logos clients

### 7. **Pourquoi JOBSINC**
6 avantages majeurs avec emojis

### 8. **Appel à l'Action Final**
Section CTA avec boutons d'action

### 9. **Footer**
- Logo et description
- Sections de navigation
- Liens légaux
- Réseaux sociaux
- Copyright

## 📱 Responsive Design

La page est entièrement responsive pour :
- Desktop (1440px+)
- Laptop (1280px)
- Tablette (768px)
- Mobile (375-390px)

## 🚀 Installation

### Prérequis
- Node.js 18+
- npm ou yarn

### Installation
```bash
cd entreprise
npm install
```

### Développement
```bash
npm run dev
```
L'application sera accessible à `http://localhost:3000`

### Build Production
```bash
npm run build
```

### Linting
```bash
npm run lint
```

## 📝 Métadonnées SEO

- Title: "JOBSINC — Connecter les talents & les opportunités"
- Description: "JOBSINC aide les entreprises à recruter les meilleurs talents..."
- Keywords: recrutement, emploi, talents, plateforme RH, candidats
- Open Graph configuré

## 🔗 Routes Disponibles

- `/` - Page d'accueil
- `/login` - Connexion (placeholder)
- `/register` - Inscription (placeholder)

## 🎯 Prochaines Étapes

Cette première version propose la landing page complète. Les prochaines étapes incluront :

- [ ] Dashboard entreprise
- [ ] Gestion des candidatures
- [ ] Recherche de candidats
- [ ] Pipeline de recrutement
- [ ] Intégration avec le backend

## 🔐 Architecture Backend

La plateforme est préparée pour se connecter à :
- `http://localhost:5000/api`

Structure préparée dans `lib/api.js` pour les futures appels API.

## ✨ Détails Techniques

### Animations
- Transitions fluides (200ms)
- Respect de `prefers-reduced-motion`
- Scroll behavior smoothe
- Hover states discrets

### Accessibilité
- HTML sémantique
- Alt text sur les images
- Navigation au clavier
- Contraste suffisant

### Performance
- Optimisé avec Next.js (SSG/SSR)
- Images optimisées
- CSS purgé
- Code-splitting automatique

## 📄 Licence

JOBSINC © 2026 - Tous droits réservés

---

**Développé avec ❤️ pour les entreprises modernes**
