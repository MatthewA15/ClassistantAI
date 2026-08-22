import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Hero } from "@/components/landing/Hero";
import { SchoolStrip } from "@/components/landing/SchoolStrip";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Showcase } from "@/components/landing/Showcase";
import { Features } from "@/components/landing/Features";
import { Escalation } from "@/components/landing/Escalation";
import { Schools } from "@/components/landing/Schools";
import { Safety } from "@/components/landing/Safety";
import { Faq } from "@/components/landing/Faq";
import { CtaBand } from "@/components/landing/CtaBand";

export default function HomePage() {
  return (
    <>
      <Header />
      <main id="main">
        <Hero />
        <SchoolStrip />
        <HowItWorks />
        <Showcase />
        <Features />
        <Escalation />
        <Schools />
        <Safety />
        <Faq />
        <CtaBand />
      </main>
      <Footer />
    </>
  );
}
