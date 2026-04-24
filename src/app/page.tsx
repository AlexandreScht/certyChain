import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ProblemSection from "@/components/ProblemSection";
import HowItWorksSection from "@/components/HowItWorksSection";
import SchoolFocusSection from "@/components/SchoolFocusSection";
import CryptoSection from "@/components/CryptoSection";
import FeaturesGrid from "@/components/FeaturesGrid";
import PricingSection from "@/components/PricingSection";
import WaitlistSection from "@/components/WaitlistSection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <Navbar />
      <HeroSection />
      <ProblemSection />
      <HowItWorksSection />
      <SchoolFocusSection />
      <CryptoSection />
      <FeaturesGrid />
      <PricingSection />
      <WaitlistSection />
      <Footer />
    </main>
  );
}
