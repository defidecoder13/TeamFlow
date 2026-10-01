import { NewLandingNavbar } from '../components/landing/NewLandingNavbar';
import { NewLandingHero } from '../components/landing/NewLandingHero';
import { NewLandingPrinciples } from '../components/landing/NewLandingPrinciples';
import { NewLandingSteps } from '../components/landing/NewLandingSteps';
import { NewLandingValuePillars } from '../components/landing/NewLandingValuePillars';
import { NewLandingSearch } from '../components/landing/NewLandingSearch';
import { NewLandingPrivacy } from '../components/landing/NewLandingPrivacy';
import { NewLandingFinalCta } from '../components/landing/NewLandingFinalCta';
import { NewLandingFooter } from '../components/landing/NewLandingFooter';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F8F7F6] text-[#171A21] selection:bg-[#EEF2FF] selection:text-[#3157D5]">
      <NewLandingNavbar />
      <main>
        <NewLandingHero />
        <NewLandingPrinciples />
        <NewLandingSteps />
        <NewLandingValuePillars />
        <NewLandingSearch />
        <NewLandingPrivacy />
        <NewLandingFinalCta />
      </main>
      <NewLandingFooter />
    </div>
  );
}
