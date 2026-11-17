import esCommon from './locales/es/common.json' with { type: 'json' }
import esTime from './locales/es/time.json' with { type: 'json' }
import esLocation from './locales/es/location.json' with { type: 'json' }
import esSearch from './locales/es/search.json' with { type: 'json' }
import esSky from './locales/es/sky.json' with { type: 'json' }
import esErrors from './locales/es/errors.json' with { type: 'json' }
import esInspector from './locales/es/inspector.json' with { type: 'json' }
import enCommon from './locales/en/common.json' with { type: 'json' }
import enTime from './locales/en/time.json' with { type: 'json' }
import enLocation from './locales/en/location.json' with { type: 'json' }
import enSearch from './locales/en/search.json' with { type: 'json' }
import enSky from './locales/en/sky.json' with { type: 'json' }
import enErrors from './locales/en/errors.json' with { type: 'json' }
import enInspector from './locales/en/inspector.json' with { type: 'json' }
import esAbout from './locales/es/about.json' with { type: 'json' }
import enAbout from './locales/en/about.json' with { type: 'json' }
import esShare from './locales/es/share.json' with { type: 'json' }
import enShare from './locales/en/share.json' with { type: 'json' }

export const languages = [
  { value: 'es', label: 'Español', shortLabel: 'ES', lang: 'es' },
  { value: 'en', label: 'English', shortLabel: 'EN', lang: 'en' },
]

export const fallbackLanguage = 'en'
export const resources = {
  es: { common: esCommon, time: esTime, location: esLocation, search: esSearch, sky: esSky, errors: esErrors, inspector: esInspector, about: esAbout, share: esShare },
  en: { common: enCommon, time: enTime, location: enLocation, search: enSearch, sky: enSky, errors: enErrors, inspector: enInspector, about: enAbout, share: enShare },
}
