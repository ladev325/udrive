export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN', flag: 'GB' },
  { code: 'ua', label: 'Українська', short: 'UA', flag: 'UA' },
  { code: 'ru', label: 'Русский', short: 'RU', flag: 'RU' },
];

export const LOCALES = {
  en: 'en-US',
  ua: 'uk-UA',
  ru: 'ru-RU',
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