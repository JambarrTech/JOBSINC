'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import logo from './logo.png';

const navItems = [['Solutions', '#solutions'], ['Entreprises', '#companies'], ['Comment ça marche', '#how'], ['À propos', '#about']];

export default function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          setScrolled(window.scrollY > 12);
          ticking = false;
        });
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return <header className={`site-header ${scrolled ? 'site-header-scrolled' : ''}`}>
    <div className="container header-inner">
      <Link href="/" className="brand" aria-label="JOBSINC accueil">
        <span className="brand-mark"><Image src={logo} alt="" width={48} height={48} priority /></span>
        <span className="brand-name">JOB<span>SINC</span></span>
      </Link>
      <nav className="desktop-nav" aria-label="Navigation principale">
        <Link href="#home">Accueil</Link>
        {navItems.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
      <div className="header-actions">
        <Link href="/login" className="login-link">Se connecter</Link>
        <Link href="/register" className="button button-primary button-small">Créer un compte</Link>
      </div>
      <button className="menu-toggle" type="button" aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={open} onClick={() => setOpen(!open)}><span /><span /><span /></button>
    </div>
    <div className={`mobile-menu ${open ? 'mobile-menu-open' : ''}`}>
      <nav aria-label="Navigation mobile">
        <Link href="#home" onClick={() => setOpen(false)}>Accueil</Link>
        {navItems.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)}>{label}</Link>)}
        <div className="mobile-actions"><Link href="/login" onClick={() => setOpen(false)}>Se connecter</Link><Link href="/register" className="button button-primary" onClick={() => setOpen(false)}>Créer un compte entreprise</Link></div>
      </nav>
    </div>
  </header>;
}
