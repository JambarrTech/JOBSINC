import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import HeroOverviewCard from './HeroOverviewCard';

export default function Hero() {
  return <section id="home" className="hero"><div className="container hero-grid">
    <div>
      <div className="eyebrow">La nouvelle façon de recruter</div>
      <h1>Les talents qui feront grandir <span className="gradient-text">votre entreprise.</span></h1>
      <p className="hero-copy">JOBSINC donne à vos équipes les bons outils pour trouver, évaluer et engager les profils qui font vraiment la différence.</p>
      <div className="hero-actions"><Link href="/register" className="button button-primary">Créer mon compte entreprise <Icon name="arrow" size={17} /></Link><Link href="#how" className="button button-outline">Découvrir JOBSINC</Link></div>
      <p className="microcopy">Inscription gratuite <span>•</span> Gestion simple <span>•</span> Recrutement intelligent</p>
    </div>
    <div className="hero-visual" aria-label="Aperçu du tableau de bord de recrutement">
      <HeroOverviewCard />
    </div>
  </div></section>;
}
