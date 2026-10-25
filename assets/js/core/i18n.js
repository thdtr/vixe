// Strings live in assets/i18n/<lang>.json; packs can merge their own.
// Inline content (level names, signs) uses objects like { "pt-BR": "...", "en": "..." }.

export const LANGS = ['pt-BR', 'en'];
const FALLBACK = 'en';

const tables = {};
let lang = FALLBACK;

export async function loadStrings(base) {
  await Promise.all(LANGS.map(async (l) => {
    const res = await fetch(`${base}${l}.json`);
    // Merged under whatever is there: packs load alongside and may have added strings already.
    tables[l] = { ...(await res.json()), ...tables[l] };
  }));
}

export function mergeStrings(byLang) {
  for (const [l, strings] of Object.entries(byLang)) tables[l] = { ...(tables[l] || {}), ...strings };
}

export function setLang(l) {
  lang = LANGS.includes(l) ? l : FALLBACK;
  document.documentElement.lang = lang;
}

export function t(key, vars) {
  let s = tables[lang]?.[key] ?? tables[FALLBACK]?.[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  return s;
}

export function loc(value) {
  if (value == null || typeof value === 'string') return value || '';
  return value[lang] ?? value[FALLBACK] ?? '';
}
