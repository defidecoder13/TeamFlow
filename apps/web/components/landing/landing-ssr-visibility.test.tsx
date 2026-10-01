import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewLandingFinalCta } from './NewLandingFinalCta';
import { NewLandingHero } from './NewLandingHero';
import { NewLandingPrinciples } from './NewLandingPrinciples';
import { NewLandingPrivacy } from './NewLandingPrivacy';
import { NewLandingSearch } from './NewLandingSearch';
import { NewLandingSteps } from './NewLandingSteps';
import { NewLandingValuePillars } from './NewLandingValuePillars';

// Pre-hydration contract: the client is not ready, so no reveal may hide
// content. SSR HTML (and any no-JS renderer) must ship fully visible.
vi.mock('./motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./motion')>();
  return { ...actual, useClientReady: () => false };
});

function mockMatchMedia(matches = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  mockMatchMedia(false);
});

const SECTIONS = [
  ['hero', <NewLandingHero />],
  ['principles', <NewLandingPrinciples />],
  ['steps', <NewLandingSteps />],
  ['pillars', <NewLandingValuePillars />],
  ['search', <NewLandingSearch />],
  ['privacy', <NewLandingPrivacy />],
  ['final-cta', <NewLandingFinalCta />],
] as const;

describe('landing pre-hydration visibility', () => {
  it.each(SECTIONS)('renders %s with no hidden states before hydration', (_name, section) => {
    const { container } = render(section);
    expect(container.innerHTML).not.toMatch(/opacity:0/);
  });
});
