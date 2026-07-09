const BASE = 'https://automatizare.comandat.ro/webhook';

export const N8N_UPLOAD_WEBHOOK_URL = `${BASE}/d92efbca-eaf1-430e-8748-cc6466c82c6e`;
export const COMPETITION_WEBHOOK_URL = `${BASE}/v2-competition`;
export const TITLE_GENERATION_WEBHOOK_URL = `${BASE}/v2-ai-title`;
export const ASIN_UPDATE_WEBHOOK_URL = `${BASE}/v2-register-product`;
export const READY_TO_LIST_WEBHOOK_URL = `${BASE}/124682e2-5f91-4c0a-adf6-4cedf16c2c19`;
export const TRANSLATION_WEBHOOK_URL = `${BASE}/v2-multilang-generate`;
// Recuperare descriere origin lipsă (via APIGURU) — necesită ca n8n să returneze
// { updates: [{asin, description}] } (SQL cu RETURNING), altfel off-site nu poate
// ști pe care ASIN s-a reparat și cu ce descriere nouă.
export const UPDATE_DESCRIPTION_WEBHOOK_URL = `${BASE}/update-description`;
export const DESCRIPTION_GENERATION_WEBHOOK_URL = `${BASE}/v2-remake-description`;
export const IMAGE_TRANSLATION_WEBHOOK_URL = `https://image-translation-module-torii-production.up.railway.app/v2-image-translation`;

export const CATEGORY_ATTRIBUTES_WEBHOOK_URL = `${BASE}/v2-category-attributes`;
export const AI_FILL_ATTRIBUTES_WEBHOOK_URL = `${BASE}/v2-ai-fill-attributes`;
export const SAVE_PRODUCT_ATTRIBUTES_URL = `${BASE}/v2-save-product-attributes`;
export const GET_PRODUCT_ATTRIBUTES_URL = `${BASE}/v2-get-product-attributes`;
export const ALL_CATEGORIES_URL = `${BASE}/v2-all-categories`;
export const CATEGORY_MAPPINGS_WEBHOOK_URL = `${BASE}/v2-category-mappings`;

export const GET_FINANCIAL_WEBHOOK_URL = `${BASE}/get-financial`;
export const SAVE_FINANCIAL_WEBHOOK_URL = `${BASE}/save-financial`;
export const GET_PALLETS_WEBHOOK_URL = `${BASE}/get-pallets`;
export const INSERT_BALANCE_WEBHOOK_URL = `${BASE}/insert-balanta`;

// OpenSales — off-site trimite DOAR ASIN-uri către acest webhook n8n. n8n face
// fetch + asamblare payload OpenSales (vezi docs/opensales-product-schema.md) și
// trimite mai departe către serverul OpenSales.
export const PUSH_TO_OPENSALES_URL = `${BASE}/push-to-opensales`;

// Prelistare eMAG — payload minim, fără categorie/caracteristici (POST /import/products/prelist
// pe OpenSales). eMAG atribuie categoria automat la validare; categoria + caracteristicile
// primite înapoi ajung în listing_data.emag prin webhook-ul separat `prelist-validat`.
export const PRELIST_TO_OPENSALES_URL = `${BASE}/push-to-opensales-prelist`;

export const languages = {
    'bg': 'Bulgarian', 'de': 'German', 'ro': 'Romanian', 'hu': 'Hungarian',
    'el': 'Greek', 'sq': 'Albanian', 'be': 'Belarusian', 'bs': 'Bosnian',
    'ca': 'Catalan', 'hr': 'Croatian', 'cs': 'Czech', 'da': 'Danish',
    'nl': 'Dutch', 'en': 'English', 'et': 'Estonian', 'fi': 'Finnish',
    'fr': 'French', 'ga': 'Irish', 'it': 'Italian', 'lv': 'Latvian',
    'lt': 'Lithuanian', 'lb': 'Luxembourgish', 'mk': 'Macedonian', 'mt': 'Maltese',
    'mo': 'Moldovan', 'no': 'Norwegian', 'pl': 'Polish', 'pt': 'Portuguese',
    'ru': 'Russian', 'sr': 'Serbian', 'sk': 'Slovak', 'sl': 'Slovenian',
    'es': 'Spanish', 'sv': 'Swedish', 'tr': 'Turkish', 'uk': 'Ukrainian', 'cy': 'Welsh'
};

export const languageNameToCodeMap = Object.entries(languages).reduce((acc, [code, name]) => {
    acc[name.toLowerCase()] = code.toUpperCase();
    return acc;
}, {});

// Marketplace registry — sursa de adevăr pentru ce coloane apar în UI-ul de mapping
// categorii/caracteristici. Pentru a adăuga un marketplace nou:
//   1. adaugă un obiect aici cu un id unic;
//   2. creează workflow-urile n8n corespunzătoare (v2-category-attributes trebuie să
//      recunoască `platform` → `<id>_ro`);
//   3. noua coloană apare automat în UI după reload.
// `colorHex` e folosit inline (Tailwind JIT nu poate construi clase dinamice).
// `position` e istoric (left/middle/right) — noul layout permite reordonare liberă
// via drag-and-drop, deci poziția DOM efectivă e determinată de array-ul MARKETPLACES
// (eventual rearanjat dintr-un localStorage).
export const MARKETPLACES = [
    { id: 'emag',     label: 'eMAG',     colorHex: '#3b82f6', position: 'left'   },
    { id: 'trendyol', label: 'Trendyol', colorHex: '#f97316', position: 'middle' },
    { id: 'temu',     label: 'Temu',     colorHex: '#ef4444', position: 'right'  }
];
