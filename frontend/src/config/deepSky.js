export const DEEP_SKY = {
  enabled: true,
  opacity: 0.3,
  maxTextureSize: 512,
}

// Separate assets allow the browser to cache each illustration independently.
export const deepSkyTextures = {
  orion: new URL('../assets/deep-sky/orion-v2.png', import.meta.url).href,
  lagoon: new URL('../assets/deep-sky/lagoon-v2.png', import.meta.url).href,
  carina: new URL('../assets/deep-sky/carina-v2.png', import.meta.url).href,
  'north-america': new URL('../assets/deep-sky/north-america-v2.png', import.meta.url).href,
  pleiades: new URL('../assets/deep-sky/pleiades-v2.png', import.meta.url).href,
  'omega-centauri': new URL('../assets/deep-sky/omega-centauri-v2.png', import.meta.url).href,
}
