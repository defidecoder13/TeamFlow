import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// React Testing Library's auto-cleanup relies on a global afterEach, which is
// disabled (explicit vitest imports are used instead), so wire it manually.
afterEach(() => {
  cleanup();
});
