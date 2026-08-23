import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Showcase } from "@/components/landing/Showcase";
import { Features } from "@/components/landing/Features";
import { CtaBand } from "@/components/landing/CtaBand";

export default function HomePage() {
  return (
    <>
      {/* overHero: no header at all until the hero has scrolled away */}
      <Header overHero />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Showcase />
        <Features />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}
