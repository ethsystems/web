// Central site config for EthSystems chrome (nav, footer, meta).
// Mirrors the ethsystems design system's site.ts.
export const site = {
  name: 'EthSystems',
  domain: 'https://ethsystems.org',
  contactFormUrl: 'https://forms.gle/24Ec9Grk5VgFMLX29',
  github: 'https://github.com/ethsystems',
  x: 'https://x.com/eth_systems',
  linkedin: 'https://www.linkedin.com/company/ethsystems/',
  email: 'hello@ethsystems.org',
  careersEmail: 'join@ethsystems.org',
  // Source repos for the map + PoC content.
  mapRepo: 'https://github.com/ethsystems/map',
  pocsRepo: 'https://github.com/ethsystems/pocs',
} as const;
