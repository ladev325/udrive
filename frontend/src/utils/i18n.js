export const LANGUAGES = [
  { code: 'ru', label: 'Русский', short: 'RU', flag: '🇷🇺' },
  { code: 'ua', label: 'Українська', short: 'UA', flag: '🇺🇦' },
  { code: 'en', label: 'English', short: 'EN', flag: '🇬🇧' },
];

export const LOCALES = {
  ru: 'ru-RU',
  ua: 'uk-UA',
  en: 'en-US',
};

export function localeFor(lang) {
  return LOCALES[lang] || LOCALES.en;
}

export function interpolate(template, values = {}) {
  if (typeof template !== 'string') return '';
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (values[key] === undefined || values[key] === null) return match;
    return String(values[key]);
  });
}
