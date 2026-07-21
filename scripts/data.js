import { GET_FINANCIAL_WEBHOOK_URL, GET_PALLETS_WEBHOOK_URL } from './constants.js';

const DATA_FETCH_URL = 'https://automatizare.comandat.ro/webhook/5a447557-8d52-463e-8a26-5902ccee8177';
const PRODUCT_DETAILS_URL = 'https://automatizare.comandat.ro/webhook/v2-product-details';
const PRODUCT_UPDATE_URL = 'https://automatizare.comandat.ro/webhook/v2-update-product';

const productCache = {};

// Cache în memorie peste sessionStorage — commands/financialData erau re-parsate din
// JSON la FIECARE apel (13+ call site-uri, adesea de 2 ori consecutiv în același
// handler). Invalidat doar în setCommands()/setFinancialData(), la fel cum
// productCache e deja invalidat explicit.
let commandsCache = null;
let commandsById = null;
let productsByCommand = null; // Map<commandId, Map<uniqueId, product>>
let financialCache = null;

function indexCommands(commands) {
    commandsById = new Map();
    productsByCommand = new Map();
    commands.forEach(c => {
        commandsById.set(c.id, c);
        productsByCommand.set(c.id, new Map((c.products || []).map(p => [p.uniqueId, p])));
    });
}

function ensureCommandsCache() {
    if (commandsCache === null) {
        commandsCache = JSON.parse(sessionStorage.getItem('liveCommandsData') || '[]');
        indexCommands(commandsCache);
    }
}

const enforceHttps = (url) =>
    url && typeof url === 'string' && url.startsWith('http://')
        ? url.replace(/^http:\/\//i, 'https://')
        : url;

const sanitizeImages = (images) =>
    Array.isArray(images) ? images.map(enforceHttps) : [];

export const AppState = {
    getCommands: () => { ensureCommandsCache(); return commandsCache; },
    setCommands: (commands) => {
        commandsCache = commands;
        indexCommands(commands);
        sessionStorage.setItem('liveCommandsData', JSON.stringify(commands));
    },
    // O(1) în loc de .find() liniar peste array-ul (re)parsat de fiecare dată.
    getCommandById: (id) => { ensureCommandsCache(); return commandsById.get(id) || null; },
    // Scopat pe commandId (nu global) — uniqueId nu e garantat unic ÎNTRE comenzi diferite.
    getProductByUniqueId: (commandId, uniqueId) => {
        ensureCommandsCache();
        return productsByCommand.get(commandId)?.get(uniqueId) || null;
    },

    getProductDetails: (asin) => productCache[asin] || null,
    setProductDetails: (asin, data) => { productCache[asin] = data; },
    clearProductCache: (asin) => {
        if (asin && productCache[asin]) {
            delete productCache[asin];
            console.log(`Cache invalidat pentru ASIN: ${asin}`);
        }
    },

    getFinancialData: () => {
        if (financialCache === null) {
            financialCache = JSON.parse(sessionStorage.getItem('financialData') || '[]');
        }
        return financialCache;
    },
    setFinancialData: (data) => {
        financialCache = data;
        sessionStorage.setItem('financialData', JSON.stringify(data));
    },
};

function processServerData(data) {
    if (!data) return [];
    return Object.keys(data).map(commandId => ({
        id: commandId,
        name: `Comanda #${commandId.substring(0, 12)}`,
        products: (data[commandId] || []).map(p => ({
            id: p.productsku,
            uniqueId: `${p.productsku}::${p.manifestsku || 'N/A'}`,
            asin: p.asin,
            expected: p.orderedquantity || 0,
            found: (p.bncondition || 0) + (p.vgcondition || 0) + (p.gcondition || 0) + (p.broken || 0),
            manifestsku: p.manifestsku || null,
            listingReady: p.listingready || false,
            bncondition: p.bncondition || 0,
            vgcondition: p.vgcondition || 0,
            gcondition: p.gcondition || 0,
            broken: p.broken || 0,
            stockcode: p.stockcode,
            unitweight: p.unitweight,
            estimatedsalevaluewithvat: p.estimatedsalevaluewithvat,
            verificationready: p.verificationready,
            // Notițele introduse în on-site — același webhook 5a447557 le întoarce deja,
            // le afișăm read-only în detaliul produsului (produsDetaliu).
            notes: Array.isArray(p.notes) ? p.notes : []
        }))
    }));
}

export async function fetchDataAndSyncState() {
    const accessCode = sessionStorage.getItem('lastAccessCode');
    if (!accessCode) return false;
    try {
        const response = await fetch(DATA_FETCH_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ code: accessCode }), cache: 'no-store' });
        if (!response.ok) throw new Error(`Eroare de rețea: ${response.status}`);
        
        const responseData = await response.json();
        if (responseData.status !== 'success' || !responseData.data) throw new Error('Răspuns invalid de la server');
        
        const processedData = processServerData(responseData.data);
        AppState.setCommands(processedData);
        return true;
    } catch (error) { console.error('Sincronizarea datelor a eșuat:', error); return false; }
}

const EMPTY_PRODUCT = Object.freeze({
    title: 'N/A', images: [], description: '', features: {},
    brand: '', price: '', category: '', categoryId: null, other_versions: {}
});

export async function fetchProductDetailsInBulk(asins, { forceRefresh = false } = {}) {
    const results = {};
    const asinsToFetch = [];

    asins.forEach(asin => {
        const cached = !forceRefresh && AppState.getProductDetails(asin);
        if (cached) results[asin] = cached;
        else asinsToFetch.push(asin);
    });

    if (asinsToFetch.length === 0) return results;

    try {
        const response = await fetch(PRODUCT_DETAILS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asins: asinsToFetch })
        });
        if (!response.ok) throw new Error(`Eroare la preluarea detaliilor`);

        const responseData = await response.json();
        const bulkData = responseData?.get_product_details_v2?.products || {};

        asinsToFetch.forEach(asin => {
            const raw = bulkData[asin];
            if (raw) {
                const productData = { ...raw, images: sanitizeImages(raw.images) };
                AppState.setProductDetails(asin, productData);
                results[asin] = productData;
            } else {
                // NU cache-uim un produs lipsă din răspuns — dacă backend-ul îl completează
                // mai târziu, vrem să-l recitim la următorul fetch, nu să rămânem blocați
                // cu stub-ul gol pentru tot restul sesiunii.
                results[asin] = { ...EMPTY_PRODUCT };
            }
        });
    } catch (error) {
        console.error('Eroare la preluarea detaliilor produselor:', error);
        asinsToFetch.forEach(asin => {
            results[asin] = { ...EMPTY_PRODUCT, title: 'Eroare' };
        });
    }
    return results;
}

export async function saveProductDetails(asin, updatedData) {
    const payload = { asin, updatedData };
    try {
        const response = await fetch(PRODUCT_UPDATE_URL, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            console.error(`Salvarea a eșuat:`, await response.text());
            return false;
        }
        AppState.setProductDetails(asin, updatedData);
        return true;
    } catch (error) {
        console.error('Eroare de rețea la salvare:', error);
        return false;
    }
}

export async function fetchFinancialData() {
    try {
        const response = await fetch(GET_FINANCIAL_WEBHOOK_URL, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) throw new Error(`Eroare HTTP: ${response.status}`);

        const data = await response.json();
        
        if (Array.isArray(data)) {
            AppState.setFinancialData(data);
            return true;
        } else if (data && typeof data === 'object' && (data.orderid || Object.keys(data).length > 0)) {
            AppState.setFinancialData([data]);
            return true;
        } else {
            console.error("Format date financiare invalid:", data);
            return false;
        }
    } catch (error) {
        console.error('Eroare la preluarea datelor financiare:', error);
        return false;
    }
}

// Singura implementare — exista anterior și o copie locală neexportată în main.js
// care trimitea { commandId } în loc de { orderId } către ACELAȘI webhook (cod mort
// divergent: main.js nu importa niciodată această funcție). Contractul { commandId }
// e cel dovedit funcțional în producție (era cel efectiv apelat), deci a fost păstrat aici.
export async function fetchPalletsData(commandId) {
    if (!commandId) return [];
    try {
        const response = await fetch(GET_PALLETS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commandId })
        });

        if (!response.ok) {
            console.error(`Fetch pallets error: ${response.status}`);
            return [];
        }

        const data = await response.json();
        return Array.isArray(data) ? data : (data.pallets || data.data || []);
    } catch (error) {
        console.error("Eroare fetch pallets:", error);
        return [];
    }
}
