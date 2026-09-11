import type { Metadata } from 'next';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Hero from '@/components/home/Hero';
import Stats from '@/components/home/Stats';
import Solutions from '@/components/home/Solutions';
import HowItWorks from '@/components/home/HowItWorks';
import AvantApres from '@/components/home/AvantApres';
import Testimonials from '@/components/home/Testimonials';
import CompanyCarousel from '@/components/home/CompanyCarousel';
import WhyJobsinc from '@/components/home/WhyJobsinc';
import FAQ from '@/components/home/FAQ';
import FinalCTA from '@/components/home/FinalCTA';
import Jobs from '@/components/home/Jobs';

export const metadata: Metadata = { title: 'JOBSINC — Les talents qui feront grandir votre entreprise', description: 'JOBSINC aide les entreprises à trouver, évaluer et engager les bons talents.', keywords: ['recrutement', 'talents', 'entreprises', 'JOBSINC'] };
export default function Home() { return <><Header /><main><Hero /><Stats /><Solutions /><HowItWorks /><AvantApres /><Jobs /><Testimonials /><CompanyCarousel /><WhyJobsinc /><FAQ /><FinalCTA /></main><Footer /></>; }
