import { state } from './state.js';
import {
    languages,
    languageNameToCodeMap,
    COMPETITION_WEBHOOK_URL,
    TITLE_GENERATION_WEBHOOK_URL,
    TRANSLATION_WEBHOOK_URL,
    IMAGE_TRANSLATION_WEBHOOK_URL,
    DESCRIPTION_GENERATION_WEBHOOK_URL,
    CATEGORY_ATTRIBUTES_WEBHOOK_URL,
    AI_FILL_ATTRIBUTES_WEBHOOK_URL,
    SAVE_PRODUCT_ATTRIBUTES_URL,
    GET_PRODUCT_ATTRIBUTES_URL,
    ALL_CATEGORIES_URL,
    CATEGORY_MAPPINGS_WEBHOOK_URL,
    MARKETPLACES
} from './constants.js';

// LocalStorage key pentru ordinea coloanelor marketplace — persistă între reload-uri.
const MARKETPLACE_ORDER_STORAGE_KEY = 'off-site-dev:marketplace-order';

// Aplică ordinea salvată peste array-ul MARKETPLACES IMPORTAT (mutare in-place).
// Trebuie să ruleze ÎNAINTE ca templates.js să citească MARKETPLACES — apel top-level.
// Edge case: dacă ordinea salvată nu conține toate marketplace-urile (ex: utilizator
// a făcut reorder → apoi a fost adăugat un marketplace nou), cele lipsă se duc la
// coadă (indicele 1e9), păstrând ordinea lor relativă din array-ul original.
function applyPersistedMarketplaceOrder() {
    try {
        const saved = JSON.parse(localStorage.getItem(MARKETPLACE_ORDER_STORAGE_KEY) || 'null');
        if (!Array.isArray(saved) || !saved.length) return;
        const indexOf = id => {
            const i = saved.indexOf(id);
            return i === -1 ? 1e9 : i;
        };
        MARKETPLACES.sort((a, b) => indexOf(a.id) - indexOf(b.id));
    } catch (e) { /* storage indisponibil — ignorăm */ }
}
applyPersistedMarketplaceOrder();
import { renderImageGallery, initializeSortable, templates } from './templates.js';
import { saveProductDetails, AppState, fetchProductDetailsInBulk } from './data.js';

const cleanImages = (images) =>
    [...new Set((images || []).filter(img => img))];

export function getCurrentImagesArray() {
    const key = state.activeVersionKey;
    if (key === 'origin') {
        if (!state.editedProductData.images) state.editedProductData.images = [];
        return [...state.editedProductData.images];
    }

    if (!state.editedProductData.other_versions) state.editedProductData.other_versions = {};
    if (!state.editedProductData.other_versions[key]) state.editedProductData.other_versions[key] = {};

    if (!state.editedProductData.other_versions[key].images) return null;

    return [...state.editedProductData.other_versions[key].images];
}

export function setCurrentImagesArray(imagesArray) {
    const key = state.activeVersionKey;
    if (key === 'origin') {
        state.editedProductData.images = imagesArray;
        return;
    }

    if (!state.editedProductData.other_versions) state.editedProductData.other_versions = {};
    if (!state.editedProductData.other_versions[key]) state.editedProductData.other_versions[key] = {};

    state.editedProductData.other_versions[key].images = imagesArray;
}


export function saveCurrentTabData() {
    const titleEl = document.getElementById('product-title');
    if (!titleEl) return;

    const title = titleEl.value;
    const description = state.descriptionEditorMode === 'raw'
        ? (document.getElementById('product-description-raw')?.value || '')
        : (document.getElementById('product-description-preview')?.innerHTML || '');

    const key = state.activeVersionKey;

    if (key === 'origin') {
        state.editedProductData.title = title;
        state.editedProductData.description = description;
    } else {
        if (!state.editedProductData.other_versions) state.editedProductData.other_versions = {};
        if (!state.editedProductData.other_versions[key]) state.editedProductData.other_versions[key] = {};
        state.editedProductData.other_versions[key].title = title;
        state.editedProductData.other_versions[key].description = description;
    }

    const thumbsContainer = document.getElementById('thumbnails-container');
    if (thumbsContainer) {
        const currentImages = [];
        thumbsContainer.querySelectorAll('[data-image-src]').forEach(el => {
            currentImages.push(el.dataset.imageSrc);
        });
        setCurrentImagesArray([...new Set(currentImages)]);
    }
}

export function loadTabData(versionKey) {
    saveCurrentTabData();
    state.activeVersionKey = versionKey;

    let dataToLoad = {};
    let imagesToLoad = null;

    if (versionKey === 'origin') {
        dataToLoad = state.editedProductData;
        imagesToLoad = dataToLoad.images;
        if (!imagesToLoad) imagesToLoad = [];
    } else {
        dataToLoad = state.editedProductData.other_versions?.[versionKey] || {};
        imagesToLoad = dataToLoad.images;
    }

    const titleEl = document.getElementById('product-title');
    if (titleEl) titleEl.value = dataToLoad.title || '';

    const description = dataToLoad.description || '';
    const rawEl = document.getElementById('product-description-raw');
    const previewEl = document.getElementById('product-description-preview');
    if (rawEl) rawEl.value = description;
    if (previewEl) previewEl.innerHTML = description;

    if (rawEl && previewEl) {
         rawEl.classList.remove('hidden');
         previewEl.classList.add('hidden');
         const rawBtn = document.querySelector('.desc-mode-btn[data-mode="raw"]');
         const previewBtn = document.querySelector('.desc-mode-btn[data-mode="preview"]');
         if (rawBtn) {
            rawBtn.classList.add('bg-blue-600', 'text-white');
            rawBtn.classList.remove('hover:bg-gray-100');
         }
         if (previewBtn) {
            previewBtn.classList.remove('bg-blue-600', 'text-white');
            previewBtn.classList.add('hover:bg-gray-100');
         }
         state.descriptionEditorMode = 'raw';
    }

    const galleryContainer = document.getElementById('image-gallery-container');
    if (galleryContainer) {
        galleryContainer.innerHTML = renderImageGallery(imagesToLoad);
        initializeSortable();
    }
    
    document.querySelectorAll('.version-btn').forEach(btn => {
        const isCurrent = btn.dataset.versionKey === versionKey;
        btn.classList.toggle('bg-blue-600', isCurrent);
        btn.classList.toggle('text-white', isCurrent);
    });

    const refreshBtn = document.getElementById('refresh-title-btn');
    if (refreshBtn) {
        const isRomanianTab = languageNameToCodeMap[versionKey.toLowerCase()] === 'RO';
        refreshBtn.classList.toggle('hidden', !isRomanianTab);
    }
    
    const refreshDescBtn = document.getElementById('refresh-description-btn');
    if (refreshDescBtn) {
        const isRomanianTab = languageNameToCodeMap[versionKey.toLowerCase()] === 'RO';
        refreshDescBtn.classList.toggle('hidden', !isRomanianTab);
    }
}


// --- API CALLS & HANDLERS ---
export async function fetchAndRenderCompetition(asin) {
    const container = document.getElementById('competition-container');
    if (!container) return;
    state.competitionDataCache = null;

    // Init idempotent — leagă drag-reorder pe elementele care tocmai au fost montate
    // de templates.produsDetaliu. Se poate să fi fost deja apelat din
    // loadProductAttributesFromDB (care rulează înainte), dar flag-ul `_sortableBound`
    // previne dublarea listenerilor.
    initMarketplaceReorder();

    try {
        const response = await fetch(COMPETITION_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asin })
        });

        if (!response.ok) throw new Error('Eroare la preluarea datelor de competiție');

        const rawData = await response.json();
        const data = rawData?.get_competition_v2 || rawData || {};
        state.competitionDataCache = data;
        container.innerHTML = templates.competition(data);
        populateCategorySelector();
        populateTemuCategorySelector();
    } catch (error) {
        console.error('Eroare competiție:', error);
        container.innerHTML = `<div class="p-8 text-center text-red-500">Nu s-au putut încărca produsele concurente.</div>`;
    }
}

export async function saveProductCoreData() {
    try {
        saveCurrentTabData();

        state.editedProductData.brand = document.getElementById('product-brand').value;
        const priceValue = document.getElementById('product-price').value;
        state.editedProductData.price = priceValue.trim() === '' ? null : priceValue;

        const localCopy = JSON.parse(JSON.stringify(state.editedProductData));
        localCopy.images = cleanImages(localCopy.images);

        if (localCopy.other_versions) {
            for (const langName in localCopy.other_versions) {
                localCopy.other_versions[langName].images = cleanImages(localCopy.other_versions[langName].images);
            }
        }

        const payloadForServer = JSON.parse(JSON.stringify(localCopy));
        if (payloadForServer.other_versions) {
            const converted = {};
            for (const [langName, langData] of Object.entries(payloadForServer.other_versions)) {
                const langCode = (languageNameToCodeMap[langName.toLowerCase()] || langName).toLowerCase();
                converted[langCode] = langData;
            }
            payloadForServer.other_versions = converted;
        }

        const asin = document.getElementById('product-asin').value;
        const success = await saveProductDetails(asin, payloadForServer);

        if (success) {
            state.editedProductData = localCopy;
            await saveAttributesToDB(asin);
            return true;
        }
        return false;
    } catch (error) {
        console.error("Eroare în saveProductCoreData:", error);
        return false;
    }
}


export async function handleProductSave(actionButton) {
    const originalText = actionButton.textContent;
    actionButton.textContent = 'Se salvează...';
    actionButton.disabled = true;
    
    const success = await saveProductCoreData(); 
    
    if (success) {
        alert('Salvat cu succes!');
        actionButton.textContent = originalText;
        actionButton.disabled = false;
        return true;
    } else {
        alert('Eroare la salvare!');
        actionButton.textContent = originalText;
        actionButton.disabled = false;
        return false;
    }
}

export async function handleTitleRefresh(actionButton) {
    const refreshIcon = actionButton.querySelector('.refresh-icon');
    const refreshSpinner = actionButton.querySelector('.refresh-spinner');

    const originTitle = state.editedProductData.title;
    const originDescription = state.editedProductData.description;
    const currentAsin = document.getElementById('product-asin')?.value;

    if (!originTitle || !originDescription || !currentAsin) {
        alert('Eroare: Datele minime necesare (Titlu, Descriere, ASIN) nu sunt disponibile.');
        return;
    }

    refreshIcon.classList.add('hidden');
    refreshSpinner.classList.remove('hidden');
    actionButton.disabled = true;

    const competitors = (state.competitionDataCache?.competitors || [])
        .map(c => c.name)
        .filter(Boolean);

    const payload = {
        asin: currentAsin,
        title: originTitle,
        description: originDescription,
        competitors
    };

    try {
        const response = await fetch(TITLE_GENERATION_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`Eroare HTTP: ${response.status}`);

        const result = await response.json();

        if (result.output) {
            document.getElementById('product-title').value = result.output;
            const roKey = 'Romanian';
            if (!state.editedProductData.other_versions) state.editedProductData.other_versions = {};
            if (!state.editedProductData.other_versions[roKey]) state.editedProductData.other_versions[roKey] = {};
            state.editedProductData.other_versions[roKey].title = result.output;
        } else {
            throw new Error('Răspuns invalid de la server.');
        }
    } catch (error) {
        console.error('Eroare la generarea titlului:', error);
        alert(`A apărut o eroare la generarea titlului: ${error.message}`);
    } finally {
        refreshIcon.classList.remove('hidden');
        refreshSpinner.classList.add('hidden');
        actionButton.disabled = false;
    }
}

export async function handleDescriptionRefresh(actionButton) {
    const refreshIcon = actionButton.querySelector('.refresh-icon');
    const refreshSpinner = actionButton.querySelector('.refresh-spinner');

    const originTitle = state.editedProductData.title;
    const originDescription = state.editedProductData.description;

    if (!originTitle || !originDescription) {
        alert('Eroare: Titlul sau descrierea "origin" nu sunt disponibile.');
        return;
    }

    refreshIcon.classList.add('hidden');
    refreshSpinner.classList.remove('hidden');
    actionButton.disabled = true;

    try {
        const response = await fetch(DESCRIPTION_GENERATION_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: originTitle, description: originDescription })
        });
        if (!response.ok) throw new Error(`Eroare HTTP: ${response.status}`);

        const result = await response.json();

        if (result.output) {
            const rawEl = document.getElementById('product-description-raw');
            const previewEl = document.getElementById('product-description-preview');
            if (rawEl) rawEl.value = result.output;
            if (previewEl) previewEl.innerHTML = result.output;

            const roKey = 'Romanian';
            if (!state.editedProductData.other_versions) state.editedProductData.other_versions = {};
            if (!state.editedProductData.other_versions[roKey]) state.editedProductData.other_versions[roKey] = {};
            state.editedProductData.other_versions[roKey].description = result.output;
        } else {
            throw new Error('Răspuns invalid de la server.');
        }
    } catch (error) {
        console.error('Eroare la generarea descrierii:', error);
        alert(`A apărut o eroare la generarea descrierii: ${error.message}`);
    } finally {
        refreshIcon.classList.remove('hidden');
        refreshSpinner.classList.add('hidden');
        actionButton.disabled = false;
    }
}


export async function handleTranslationInit(languageOption) {
    if (languageOption.hasAttribute('data-processing')) return;

    saveCurrentTabData();

    const langCode = languageOption.dataset.langCode;
    const langName = languageOption.textContent;
    const asin = document.getElementById('product-asin').value;

    const originTitle = state.editedProductData.title || '';
    const originDescription = state.editedProductData.description || '';
    const originImages = cleanImages(state.editedProductData.images);

    const resetUI = () => {
        languageOption.removeAttribute('data-processing');
        languageOption.innerHTML = langName;
        languageOption.classList.remove('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
        languageOption.style.pointerEvents = 'auto';
    };

    if (originDescription.trim().length < 50) {
        alert(`Eroare: Descrierea este prea scurtă (${originDescription.trim().length} caractere). Minim necesar: 50.`);
        return;
    }
    if (originTitle.trim().length < 10) {
        alert(`Eroare: Titlul este prea scurt (${originTitle.trim().length} caractere). Minim necesar: 10.`);
        return;
    }
    if (originImages.length < 3) {
        alert(`Eroare: Produsul are doar ${originImages.length} imagini. Sunt necesare minim 3 imagini.`);
        return;
    }

    languageOption.setAttribute('data-processing', 'true');
    languageOption.style.pointerEvents = 'none';
    languageOption.classList.add('bg-gray-100', 'text-gray-400', 'cursor-not-allowed');
    languageOption.innerHTML = `
        <div class="flex items-center justify-between">
            <span>${langName}</span>
            <div class="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin ml-2"></div>
        </div>`;

    try {
        const competitors = state.competitionDataCache?.competitors || [];
        const competitionPayload = {};
        competitors.slice(0, 5).forEach((c, i) => {
            competitionPayload[`competition_${i + 1}_title`] = c.name || '';
        });

        const response = await fetch(TRANSLATION_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                asin,
                language: langCode,
                title: originTitle,
                description: originDescription,
                images: originImages,
                ...competitionPayload
            })
        });

        if (response.ok) {
            languageOption.innerHTML = `
                <div class="flex items-center justify-between text-green-600">
                    <span>${langName}</span>
                    <span class="material-icons text-sm">check</span>
                </div>`;
            setTimeout(() => {
                alert(`Traducere pentru ${langCode.toUpperCase()} a fost inițiată cu succes.`);
                languageOption.closest('.dropdown-menu')?.classList.add('hidden');
                resetUI();
            }, 500);
        } else {
            alert('Eroare la inițierea traducerii (Răspuns server invalid).');
            resetUI();
        }
    } catch (error) {
        console.error('Eroare Webhook:', error);
        alert('Eroare de rețea la inițierea traducerii.');
        resetUI();
    }
}


export async function handleImageTranslation(button) {
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>';

    try {
        const asin = document.getElementById('product-asin')?.value;
        const activeKey = state.activeVersionKey;
        const originImages = cleanImages(state.editedProductData.images).slice(0, 5);
        const langCode = (languageNameToCodeMap[activeKey.toLowerCase()] || activeKey).toLowerCase();

        if (!asin) throw new Error("ASIN-ul produsului nu a fost găsit.");
        if (!langCode || langCode === 'origin') throw new Error("Limba selectată este invalidă pentru traducere.");
        if (originImages.length === 0) throw new Error("Nu există imagini 'origin' de tradus.");

        const response = await fetch(IMAGE_TRANSLATION_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([{ asin, lang: langCode, images: originImages }])
        });

        if (!response.ok) throw new Error(`Eroare HTTP: ${response.status}`);

        const result = await response.json();
        if (result.status === 'success') {
            alert('Traducerea imaginilor a fost inițiată cu succes!');
            return true;
        }
        throw new Error('Webhook-ul a răspuns, dar nu cu status "success".');
    } catch (error) {
        console.error('Eroare la inițierea traducerii imaginilor:', error);
        alert(`A apărut o eroare: ${error.message}`);
        return false;
    } finally {
        button.disabled = false;
        button.innerHTML = originalText;
    }
}


// --- EVENT HANDLERS (PENTRU A FI APELATE DIN main.js) ---

export function handleImageActions(action, actionButton) {
    let currentImages; 

    if (action === 'delete-image') {
        currentImages = getCurrentImagesArray(); 
        if (currentImages === null) currentImages = []; 

        const imageSrc = actionButton.dataset.imageSrc;
        if (!imageSrc) return;
        
        const indexToDelete = currentImages.indexOf(imageSrc);
        if (indexToDelete > -1) {
            currentImages.splice(indexToDelete, 1);
        }
    }
    else if (action === 'add-image-url') {
        currentImages = getCurrentImagesArray(); 
        if (currentImages === null) currentImages = []; 

        const validImages = currentImages.filter(img => img);
        if (validImages.length >= 5) {
            alert("Puteți adăuga maxim 5 imagini.");
            return;
        }
        const newImageUrl = prompt("Vă rugăm introduceți URL-ul noii imagini:");
        if (newImageUrl) {
            if (currentImages.includes(newImageUrl)) {
                alert("Această imagine este deja în galerie.");
                return;
            }
            currentImages.push(newImageUrl);
        }
    }
    else if (action === 'copy-origin-images') {
        currentImages = [...(state.editedProductData.images || [])].filter(img => img);
    }
    else {
        return;
    }

    setCurrentImagesArray(currentImages); 
    const galleryContainer = document.getElementById('image-gallery-container');
    if (galleryContainer) {
        galleryContainer.innerHTML = renderImageGallery(currentImages);
        initializeSortable();
    }
}

export function handleDescriptionToggle(descModeButton) {
    const mode = descModeButton.dataset.mode;
    if (mode === state.descriptionEditorMode) return;

    const rawEl = document.getElementById('product-description-raw');
    const previewEl = document.getElementById('product-description-preview');

    if (mode === 'preview') {
        previewEl.innerHTML = rawEl.value;
        rawEl.classList.add('hidden');
        previewEl.classList.remove('hidden');
        state.descriptionEditorMode = 'preview';
    } else {
        rawEl.value = previewEl.innerHTML;
        previewEl.classList.add('hidden');
        rawEl.classList.remove('hidden');
        state.descriptionEditorMode = 'raw';
    }

    document.querySelectorAll('.desc-mode-btn').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('hover:bg-gray-100');
    });
    descModeButton.classList.add('bg-blue-600', 'text-white');
    descModeButton.classList.remove('hover:bg-gray-100');
}

// --- CATEGORII & CARACTERISTICI + DRAG-CONNECT ---

const mappingState = {
    // Categorii și savedValues: construite dinamic din MARKETPLACES → generalizare
    // spre adăugarea ulterioară de marketplace-uri noi fără edit aici.
    categories: Object.fromEntries(MARKETPLACES.map(m => [m.id, null])),
    // savedValues[platform][categoryId] = { attrId: value, ... }
    // Indexat pe categoryId ca să nu se piardă munca la switch accidental de categorie.
    savedValues: Object.fromEntries(MARKETPLACES.map(m => [m.id, {}])),
    // categoryNames[platform] = { name, nameRo } — sursa de adevăr pentru numele
    // categoriei salvate, INDEPENDENTĂ de DOM. Re-popularea containerului de
    // competiție (templates.competition) recreează <select>-ul și șterge dataset-urile,
    // așa că populateCategorySelector trebuie să citească numele de aici, nu din DOM.
    categoryNames: Object.fromEntries(MARKETPLACES.map(m => [m.id, null])),
    // variations[platform] = array de blocuri non-attribute venite din DB
    // (ex: temu.variations = [{ parentSpecId, specId, specName }]). Frontend-ul NU
    // le regenerează, deci le ținem aici ca să le re-emitem la save și să nu fie
    // șterse din listing_data.
    variations: Object.fromEntries(MARKETPLACES.map(m => [m.id, null])),
    searchTimers: {},
    // Când e true, schimbarea categoriei eMAG NU declanșează lookup automat
    // de mapări pe Trendyol/Temu. Folosit la restore din DB ca să respectăm
    // ce a salvat userul anterior.
    _suppressEmagMappingLookup: false
};

// Cache pentru valorile predefinite ale atributelor: key = `${platform}-${attrId}`
const attrValuesCache = new Map();

// Închide toate dropdown-urile când se dă click în afară
document.addEventListener('click', () => {
    document.querySelectorAll('.attr-dropdown-list').forEach(l => l.classList.add('hidden'));
});

export function populateCategorySelector() {
    const categories = [...(state.competitionDataCache?.suggested_categories || [])];
    categories.sort((a, b) => (b.count || 0) - (a.count || 0));
    const selector = document.getElementById('category-selector-emag');
    if (!selector) return;

    const savedEmagId = mappingState.categories.emag;

    if (categories.length === 0 && !savedEmagId) {
        selector.innerHTML = '<option value="">Nu există categorii disponibile</option>';
        return;
    }

    // Dacă avem o categorie deja încărcată din DB și nu apare în suggestions,
    // păstrăm opțiunea ei. Sursa de adevăr pentru nume e mappingState.categoryNames
    // (populat de loadProductAttributesFromDB), care supraviețuiește re-randării
    // containerului de competiție. Fallback pe DOM/dataset doar dacă lipsește.
    if (savedEmagId && !categories.find(c => String(c.id) === String(savedEmagId))) {
        const cached = mappingState.categoryNames?.emag;
        const existingOpt = selector.querySelector(`option[value="${savedEmagId}"]`);
        const savedName = (cached?.name)
            || (existingOpt?.dataset?.name || existingOpt?.textContent || '').trim()
            || `Categorie ${savedEmagId}`;
        const savedNameRo = cached?.nameRo || existingOpt?.dataset?.nameRo || null;
        const display = savedNameRo ? `${savedNameRo} (${savedName})` : savedName;
        categories.unshift({ id: savedEmagId, name: savedName, _display: display, _nameRo: savedNameRo });
    }

    // Dedup: competiția eMAG poate returna un ID greșit (ex: 554) cu același nume ca
    // ID-ul canonic salvat (820). Eliminăm duplicatele după nume, păstrând savedEmagId.
    if (savedEmagId) {
        const seen = new Map();
        const deduped = [];
        for (const cat of categories) {
            const key = String(cat.name || '').trim().toLowerCase();
            if (!key) { deduped.push(cat); continue; }
            const prev = seen.get(key);
            if (!prev) {
                seen.set(key, cat);
                deduped.push(cat);
            } else if (String(cat.id) === String(savedEmagId)) {
                // înlocuim varianta deja adăugată cu cea salvată
                const idx = deduped.indexOf(prev);
                if (idx >= 0) deduped[idx] = cat;
                seen.set(key, cat);
            }
            // altfel: ignorăm duplicatul
        }
        categories.length = 0;
        categories.push(...deduped);
    }

    selector.innerHTML = categories.map(cat => {
        const safeName = String(cat.name || '').replace(/"/g, '&quot;');
        const safeNameRo = cat._nameRo ? String(cat._nameRo).replace(/"/g, '&quot;') : '';
        const display = (cat._display || cat.name || '').toString().replace(/"/g, '&quot;');
        const roAttr = safeNameRo ? ` data-name-ro="${safeNameRo}"` : '';
        const isSelected = savedEmagId
            ? String(cat.id) === String(savedEmagId)
            : cat === categories[0];
        return `<option value="${cat.id}" data-name="${safeName}"${roAttr}${isSelected ? ' selected' : ''}>${display}</option>`;
    }).join('');

    // Sincronizăm selector-ul pe categoria activă explicit (fallback)
    if (savedEmagId) {
        selector.value = String(savedEmagId);
    }

    // Dacă n-aveam deja o categorie salvată din DB, inițializăm cu prima sugestie —
    // asta va declanșa și lookup-ul de mapări pe Trendyol/Temu prin handleCategoryChange.
    if (!savedEmagId) {
        handleCategoryChange('emag', String(categories[0].id));
    }
}

// Temu: recomandările vin per-produs de la Temu API (pre-calculate la inserare ordin)
// și sunt returnate de v2-competition în `temu_recommendations` (deja îmbogățite cu
// nume RO/EN prin JOIN pe catalogs.categories). Structura item: { categoryId, categoryName, nameRo, isBest }.
// NU depind de categoria eMAG aleasă — de aceea sunt excluse din applyCategoryMappings.
export function populateTemuCategorySelector() {
    const list = [...(state.competitionDataCache?.temu_recommendations || [])];
    const selector = document.getElementById('category-selector-temu');
    if (!selector) return;

    const savedTemuId = mappingState.categories.temu;

    // Produs fără recomandări Temu și fără nimic salvat → dropdown gol.
    // User-ul are butonul "Toate" care apelează v2-all-categories pentru căutare manuală.
    if (list.length === 0 && !savedTemuId) {
        selector.innerHTML = '<option value="">Selectați o categorie...</option>';
        return;
    }

    // Dacă produsul are deja o categorie Temu salvată care nu e în recomandări,
    // o păstrăm ca opțiune selectată (evităm pierderea alegerii user-ului).
    // Sursa de adevăr: mappingState.categoryNames.temu (vezi populateCategorySelector).
    if (savedTemuId && !list.find(m => String(m.categoryId) === String(savedTemuId))) {
        const cached = mappingState.categoryNames?.temu;
        const existingOpt = selector.querySelector(`option[value="${savedTemuId}"]`);
        const savedName = (cached?.name)
            || (existingOpt?.dataset?.name || existingOpt?.textContent || '').trim()
            || `Categorie ${savedTemuId}`;
        const savedNameRo = cached?.nameRo || existingOpt?.dataset?.nameRo || null;
        list.unshift({ categoryId: savedTemuId, categoryName: savedName, nameRo: savedNameRo });
    }

    const targetId = savedTemuId ? String(savedTemuId) : null;
    populateMappedCategoryDropdown('temu', list, targetId);

    // Dacă n-avea nimic salvat, aplicăm prima recomandare (cea mai bună conform Temu API) —
    // declanșează fetch-ul de atribute pentru acea categorie.
    if (!savedTemuId && list.length) {
        const best = list.find(m => m.isBest) || list[0];
        if (best && best.categoryId) {
            handleCategoryChange('temu', String(best.categoryId));
        }
    }
}

export async function handleCategoryChange(platform, categoryId) {
    if (!categoryId) return;

    const prevCategoryId = mappingState.categories[platform];

    // 1. Salvează valorile actuale în memorie, indexate pe (platform, categoryId)
    if (prevCategoryId) {
        if (!mappingState.savedValues[platform]) mappingState.savedValues[platform] = {};
        mappingState.savedValues[platform][prevCategoryId] = collectAttributeValuesForPlatform(platform);
    }

    // 2. Actualizează categoria (cu ID-ul original)
    mappingState.categories[platform] = categoryId;

    // Defensiv: dacă selector-ul nu e deja pe categoryId (ex: apel programmatic),
    // îl sincronizăm și adăugăm opțiunea dacă lipsește.
    const selectorSync = document.getElementById(`category-selector-${platform}`);
    if (selectorSync && String(selectorSync.value) !== String(categoryId)) {
        if (!selectorSync.querySelector(`option[value="${categoryId}"]`)) {
            const opt = document.createElement('option');
            opt.value = String(categoryId);
            opt.textContent = `Categorie ${categoryId}`;
            opt.dataset.name = `Categorie ${categoryId}`;
            selectorSync.appendChild(opt);
        }
        selectorSync.value = String(categoryId);
    }

    const el = document.getElementById(`${platform}-attributes`);
    if (el) el.innerHTML = '<p class="text-xs text-gray-400 italic">Se încarcă...</p>';
    const fetchResult = await fetchAndRenderAttributes(platform, categoryId);

    // Dacă webhook-ul a rezolvat un alt ID de categorie (ex: căutare după nume),
    // actualizăm mappingState cu ID-ul rezolvat și salvăm valorile sub cheia corectă.
    const resolvedCategoryId = fetchResult?.resolvedCategoryId || categoryId;
    if (resolvedCategoryId !== categoryId) {
        // Mută valorile salvate sub cheia originală la cheia rezolvată, dacă există
        if (mappingState.savedValues[platform]?.[categoryId]) {
            mappingState.savedValues[platform][resolvedCategoryId] =
                mappingState.savedValues[platform][categoryId];
            delete mappingState.savedValues[platform][categoryId];
        }
        mappingState.categories[platform] = resolvedCategoryId;
    }

    // 4. Restaurează valorile pentru noua categorie (dacă au mai fost pe ea)
    const restoredValues = mappingState.savedValues[platform]?.[resolvedCategoryId] || {};
    restoreAttributeValues(platform, restoredValues);

    initMarketplaceReorder();

    // 6. La schimbarea activă a categoriei eMAG, caută mapări pe Trendyol/Temu
    //    și pre-populează dropdown-urile + fetch caracteristici pentru cea mai bună.
    //    Folosim resolvedCategoryId (ID-ul canonic din DB) pentru lookup în mappings.
    if (platform === 'emag' && !mappingState._suppressEmagMappingLookup) {
        await applyCategoryMappings(resolvedCategoryId);
    }
}

async function applyCategoryMappings(emagCategoryId) {
    try {
        const res = await fetch(CATEGORY_MAPPINGS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePlatform: 'emag', sourceCategoryId: String(emagCategoryId) })
        });
        if (!res.ok) return;
        const data = await res.json();
        const mappings = data?.mappings || {};
        // Iterăm peste toate marketplace-urile în afară de eMAG (sursa).
        // Când adaugi un marketplace nou în MARKETPLACES, va primi automat mapping lookup
        // pentru noul `<id>_ro` dacă workflow-ul v2-category-mappings îl returnează.
        // Temu are propriul flux de recomandări (per-produs, via Temu API) încărcat în
        // populateTemuCategorySelector, NU derivat din categoria eMAG. Îl excludem aici
        // ca să nu suprascriem recomandarea specifică produsului la schimbarea categoriei eMAG.
        // Includem TOATE platformele (mai puțin sursa = eMAG). Mapările salvate manual
        // de user au prioritate față de recomandările Temu API per-produs (care pot fi
        // goale, ca în cazul când temu_recommendations vine []).
        const targetPlatforms = MARKETPLACES.map(m => m.id).filter(id => id !== 'emag');
        for (const targetPlatform of targetPlatforms) {
            const list = Array.isArray(mappings[targetPlatform]) ? mappings[targetPlatform] : [];
            if (!list.length) continue;

            // Dacă există deja o categorie setată pentru acea platformă (ex: user-ul a salvat
            // ceva pentru produs), preferăm să o păstrăm selectată în loc să o suprascriem cu cea auto.
            const existingId = mappingState.categories[targetPlatform];
            const listHasExisting = existingId && list.some(m => String(m.categoryId) === String(existingId));
            const targetId = listHasExisting ? String(existingId) : null;

            populateMappedCategoryDropdown(targetPlatform, list, targetId);

            // Dacă user-ul nu avea deja o categorie salvată, aplicăm recomandarea "best"
            if (!listHasExisting) {
                const best = list.find(m => m.isBest) || list[0];
                if (best && best.categoryId) {
                    // IMPORTANT: actualizăm și categoryNames cu numele mapării noi.
                    // Altfel populateTemuCategorySelector (re-rulat după re-randarea competiției)
                    // ar reciti numele vechi din DB ("Handheld Steamers") și ar suprascrie
                    // afișarea peste mapare (care e pe alt ID, ex: 11634 "Steam Cleaners").
                    mappingState.categoryNames[targetPlatform] = {
                        name:   best.categoryName || mappingState.categoryNames[targetPlatform]?.name || null,
                        nameRo: best.nameRo       || mappingState.categoryNames[targetPlatform]?.nameRo || null
                    };
                    await handleCategoryChange(targetPlatform, String(best.categoryId));
                }
            } else {
                // Altfel, doar ne asigurăm că selector-ul arată categoria deja activă.
                // Refresh categoryNames din mapping (poate avea nameRo mai bun decât listing_data).
                const matched = list.find(m => String(m.categoryId) === String(existingId));
                if (matched) {
                    mappingState.categoryNames[targetPlatform] = {
                        name:   matched.categoryName || mappingState.categoryNames[targetPlatform]?.name || null,
                        nameRo: matched.nameRo       || mappingState.categoryNames[targetPlatform]?.nameRo || null
                    };
                }
                const selector = document.getElementById(`category-selector-${targetPlatform}`);
                if (selector) selector.value = String(existingId);
            }
        }
    } catch (err) {
        console.error('Eroare lookup mapări categorii:', err);
    }
}

function populateMappedCategoryDropdown(platform, list, selectedId = null) {
    const selector = document.getElementById(`category-selector-${platform}`);
    if (!selector) return;
    const best = list.find(m => m.isBest) || list[0];
    const targetId = selectedId != null ? String(selectedId) : (best ? String(best.categoryId) : '');
    const emptyOpt = '<option value="">Selectați o categorie...</option>';
    const opts = list.map(m => {
        const badge = m.confidence === 'manual' ? ' ✓' : '';
        // EN-only în data-name: fetchAndRenderAttributes folosește dataset.name ca fallback
        // pentru lookup-ul de categorii în v2-category-attributes (care caută după numele
        // oficial EN, nu după traducere). Afișarea însă poate fi bilingvă.
        const enName = (m.categoryName || ('Categorie ' + m.categoryId)).replace(/"/g, '&quot;');
        const displayName = m.nameRo
            ? `${String(m.nameRo).replace(/"/g, '&quot;')} (${enName})`
            : enName;
        const isSel = String(m.categoryId) === targetId ? ' selected' : '';
        return `<option value="${m.categoryId}" data-name="${enName}"${isSel}>${displayName}${badge}</option>`;
    }).join('');
    selector.innerHTML = emptyOpt + opts;
    if (targetId) selector.value = targetId;
}

async function fetchAndRenderAttributes(platform, categoryId) {
    const container = document.getElementById(`${platform}-attributes`);
    if (!container) return null;
    // Trimitem și numele categoriei (ENGLEZĂ, oficial din catalogs) ca fallback
    // pentru căutarea după nume în DB. Dacă option-ul are data-name (cazul search bilingv),
    // îl folosim pe acela — textContent poate fi "RO (EN)" sau alte variante afișate.
    const selector = document.getElementById(`category-selector-${platform}`);
    const selectedOpt = selector?.selectedOptions?.[0];
    let categoryName = selectedOpt?.dataset?.name || selectedOpt?.text?.trim() || '';
    // Cleanup compatibilitate:
    //   - șterge sufix ` (123)` (vechi, număr de produse)
    //   - șterge ` ✓` (badge confidence=manual)
    //   - extrage partea din paranteză dacă formatul e "Nume RO (Nume EN)" → doar "Nume EN"
    categoryName = categoryName
        .replace(/\s*✓\s*$/, '')
        .replace(/\s*\(\d+\)\s*$/, '');
    // Dacă textContent e "Nume RO (Nume EN)" și nu avem data-name, extragem EN din paranteze
    if (!selectedOpt?.dataset?.name) {
        const parenMatch = categoryName.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
        if (parenMatch) categoryName = parenMatch[2].trim();
    }
    try {
        const response = await fetch(CATEGORY_ATTRIBUTES_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform, categoryId, categoryName })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const attrs = Array.isArray(data.attributes) ? data.attributes : [];
        // Populăm cache-ul de valori pentru dropdown-uri
        attrValuesCache.clear();
        attrs.forEach(attr => {
            const attrId = String(attr.id ?? attr.name ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
            if (Array.isArray(attr.values) && attr.values.length > 0) {
                attrValuesCache.set(`${platform}-${attrId}`, attr.values);
            }
        });
        container.innerHTML = attrs.length
            ? attrs.map(attr => renderAttributeRow(attr, platform)).join('')
            : '<p class="text-xs text-gray-400 italic">Nu există caracteristici pentru această categorie</p>';
        initAttrDropdowns(platform);
return {
    resolvedCategoryId: data.resolvedCategoryId ? String(data.resolvedCategoryId) : categoryId,
    resolvedCategoryName: data.resolvedCategoryName || categoryName,
    resolvedCategoryNameRo: data.resolvedCategoryNameRo || data.resolved_category_name_ro || null
};
    } catch {
        container.innerHTML = '<p class="text-xs text-red-400 italic">Caracteristicile vor fi disponibile după configurarea webhook-ului</p>';
        return null;
    }
}

function renderAttributeRow(attr, platform) {
    const attrId = String(attr.id ?? attr.name ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const isRequired = attr.required === true;
    const allowsCustom = attr.allowsCustom === true;
    const hasValues = Array.isArray(attr.values) && attr.values.length > 0;

    const requiredMark = isRequired ? '<span class="text-red-500 text-xs ml-0.5">*</span>' : '';
    const bgClass = isRequired ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50';
    const labelClass = isRequired ? 'text-amber-800' : 'text-gray-600';
    const borderClass = isRequired ? 'border-amber-300 focus:border-amber-500' : 'border-gray-300 focus:border-blue-400';

    // Badge allowsCustom — apare doar dacă există valori predefinite
    const customBadge = hasValues
        ? (allowsCustom
            ? `<span class="flex-shrink-0 text-xs bg-green-100 text-green-700 rounded px-1 leading-4 cursor-default" title="Poți introduce și valori personalizate">✏️</span>`
            : `<span class="flex-shrink-0 text-xs bg-gray-200 text-gray-500 rounded px-1 leading-4 cursor-default" title="Doar valori din listă">🔒</span>`)
        : '';

    let inputHtml;
    if (hasValues) {
        // Dropdown cu search — mereu editabil pentru filtrare; custom values sunt blocate
        // la blur dacă allowsCustom=false (input revert la ultima valoare validă).
        const placeholder = isRequired ? 'Caută (obligatoriu)...' : 'Caută valoare...';
        inputHtml = `<div class="attr-search-dropdown flex-1 relative" data-attr-id="${attrId}" data-platform="${platform}" data-allow-custom="${allowsCustom}" data-required="${isRequired}">
            <input type="text" class="attr-value-input w-full text-xs bg-transparent border-0 border-b ${borderClass} focus:outline-none px-0 min-w-0 cursor-pointer"
                   data-attr-id="${attrId}" data-platform="${platform}" placeholder="${placeholder}" value="${attr.value || ''}" autocomplete="off">
            <div class="attr-dropdown-list hidden absolute left-0 right-0 bg-white border border-gray-200 rounded shadow-lg max-h-44 overflow-y-auto" style="top:calc(100% + 2px); z-index:100;"></div>
        </div>`;
    } else {
        // Input text simplu
        const placeholder = isRequired ? 'Obligatoriu...' : 'Valoare...';
        inputHtml = `<input type="text" class="attr-value-input flex-1 text-xs bg-transparent border-0 border-b ${borderClass} focus:outline-none px-0 min-w-0"
               data-attr-id="${attrId}" data-platform="${platform}" placeholder="${placeholder}" value="${attr.value || ''}">`;
    }


    // Display bilingv: dacă există nameRo (din catalogs.characteristics.name_ro),
    // arată "Nume RO (Nume EN)". Altfel, doar EN. Titlul tooltip-ului e RO dacă există,
    // ca să confirme exact ce a generat Gemini pe hover.
    const nameEn = escapeHtmlAttr(attr.name || '');
    const nameRo = attr.nameRo ? escapeHtmlAttr(attr.nameRo) : '';
    const displayName = nameRo
        ? `${nameRo} <span class="text-gray-400 font-normal">(${nameEn})</span>`
        : nameEn;
    const tooltipName = nameRo
        ? `${attr.nameRo}${isRequired ? ' (obligatoriu)' : ''} — EN: ${attr.name}`
        : `${attr.name}${isRequired ? ' (obligatoriu)' : ''}`;

    return `<div class="attr-row" data-attr-id="${attrId}" data-platform="${platform}" data-required="${isRequired}">
        <div class="flex items-center gap-1.5 ${bgClass} rounded px-2 py-0.5 min-w-0">
            <span class="text-xs ${labelClass} font-medium flex-shrink-0 truncate" style="width:40%" title="${escapeHtmlAttr(tooltipName)}">${displayName}${requiredMark}</span>
            ${customBadge}
            ${inputHtml}
        </div>
    </div>`;
}

function initAttrDropdowns(platform) {
    const container = document.getElementById(`${platform}-attributes`);
    if (!container) return;

    container.querySelectorAll('.attr-search-dropdown').forEach(wrapper => {
        const input = wrapper.querySelector('.attr-value-input');
        const list = wrapper.querySelector('.attr-dropdown-list');
        const allowCustom = wrapper.dataset.allowCustom === 'true';
        const isRequired = wrapper.dataset.required === 'true';
        const key = `${platform}-${wrapper.dataset.attrId}`;
        const values = attrValuesCache.get(key) || [];

        // Ultima valoare confirmată — folosită pentru revert la blur dacă !allowCustom
        let savedVal = input.value || '';

        function renderList(filter) {
            const search = (filter || '').toLowerCase().trim();
            const filtered = search
                ? values.filter(v => v.name.toLowerCase().includes(search))
                : values;

            let html = '';

            // Opțiune de deselect — doar dacă nu e obligatoriu și există o valoare salvată
            if (!isRequired && savedVal) {
                html += `<div class="attr-dropdown-item px-2 py-1.5 hover:bg-red-50 cursor-pointer text-xs text-red-500 border-b border-gray-100" data-val="">✕ Șterge selecția</div>`;
            }

            html += filtered
                .map(v => {
                    const isCurrent = v.name === savedVal;
                    return `<div class="attr-dropdown-item px-2 py-1.5 hover:bg-blue-50 cursor-pointer text-xs${isCurrent ? ' bg-blue-50 font-medium' : ''}" data-val="${v.name.replace(/"/g, '&quot;')}">${v.name}</div>`;
                })
                .join('');

            // Opțiune de valoare personalizată — doar dacă allowCustom și textul nu e deja în listă
            if (allowCustom && filter && !filtered.some(v => v.name.toLowerCase() === filter.toLowerCase())) {
                html += `<div class="attr-dropdown-item px-2 py-1.5 hover:bg-green-50 cursor-pointer text-xs text-green-700 italic border-t border-gray-100" data-val="${filter.replace(/"/g, '&quot;')}">✏️ Valoare personalizată: "${filter}"</div>`;
            }

            list.innerHTML = html;
            list.classList.toggle('hidden', !html);
        }

        // Focus: selectează tot textul existent ca utilizatorul să poată tasta imediat
        input.addEventListener('focus', (e) => {
            e.stopPropagation();
            input.select();
            renderList('');
        });
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            renderList(input.value);
        });

        // Filtrare live — pentru toți (nu doar allowCustom)
        input.addEventListener('input', () => renderList(input.value));

        // Selectare item
        list.addEventListener('mousedown', (e) => {
            // mousedown în loc de click ca să nu pierdem focus-ul înainte de selecție
            const item = e.target.closest('.attr-dropdown-item');
            if (!item) return;
            e.preventDefault();
            input.value = item.dataset.val;
            savedVal = item.dataset.val;
            list.classList.add('hidden');
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Blur: ascunde lista și, dacă !allowCustom, revert la savedVal
        // dacă ce s-a scris nu se regăsește exact în lista de valori valide.
        input.addEventListener('blur', () => {
            setTimeout(() => {
                list.classList.add('hidden');
                if (!allowCustom) {
                    const typedVal = input.value;
                    const isValid = typedVal === '' || values.some(v => v.name === typedVal);
                    if (!isValid) {
                        input.value = savedVal;
                    } else {
                        savedVal = typedVal;
                    }
                }
            }, 150);
        });
    });
}

// Drag-reorder coloane marketplace folosind SortableJS (deja încărcat global via CDN).
// Idempotent: leagă Sortable o singură dată per element #marketplace-grid, ca să nu
// dubleze listenerii la remount-uri consecutive ale template-ului.
function initMarketplaceReorder() {
    if (typeof Sortable === 'undefined') return;
    const grid = document.getElementById('marketplace-grid');
    if (!grid || grid._sortableBound) return;
    grid._sortableBound = true;

    Sortable.create(grid, {
        animation: 150,
        handle: '.marketplace-drag-handle',
        draggable: '.marketplace-column',
        ghostClass: 'opacity-50',
        chosenClass: 'ring-2',
        onEnd: () => {
            // Citim noua ordine direct din DOM (sursa de adevăr post-drag)
            const newOrder = Array.from(grid.querySelectorAll('.marketplace-column'))
                .map(el => el.dataset.platform)
                .filter(Boolean);
            if (!newOrder.length) return;
            // Persistăm în localStorage pentru reload
            try {
                localStorage.setItem(MARKETPLACE_ORDER_STORAGE_KEY, JSON.stringify(newOrder));
            } catch (e) { /* storage indisponibil — ignorăm */ }
            // Mutăm in-memory array-ul MARKETPLACES (preserves identity — alte module
            // care importă MARKETPLACES vor vedea noua ordine fără reimport)
            MARKETPLACES.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
        }
    });
}

function collectAttributeValuesForPlatform(platform) {
    const result = {};
    document.querySelectorAll(`.attr-value-input[data-platform="${platform}"]`).forEach(input => {
        if (input.value) result[input.dataset.attrId] = input.value;
    });
    const selector = document.getElementById(`category-selector-${platform}`);
    if (selector?.value) result.__categoryId = selector.value;
    return result;
}

function collectAllAttributeValues() {
    const result = {};
    MARKETPLACES.forEach(mp => {
        const platform = mp.id;
        const values = collectAttributeValuesForPlatform(platform);
        const categoryId = mappingState.categories[platform];
        const selector = document.getElementById(`category-selector-${platform}`);
        const selectedOpt = selector?.selectedOptions?.[0];
        const categoryName = selectedOpt?.dataset?.name || selectedOpt?.textContent?.trim() || null;
        result[platform] = { categoryId: categoryId || null, categoryName: categoryName || null, attributes: values };
        // Re-emitem variations (array, ex: Temu) păstrate din DB, ca să nu le ștergem la save.
        if (mappingState.variations[platform]?.length) {
            result[platform].variations = mappingState.variations[platform];
        }
    });
    return result;
}

function restoreAttributeValues(platform, values) {
    Object.entries(values).forEach(([attrId, value]) => {
        if (attrId === '__categoryId') return;
        const input = document.querySelector(`.attr-value-input[data-platform="${platform}"][data-attr-id="${attrId}"]`);
        if (!input) return;
        // value poate fi:
        //   - string: "Negru" (colectat din inputs, înainte de save)
        //   - obiect: { value_name, value_id } (din DB, după enrichment SQL)
        input.value = (value && typeof value === 'object') ? (value.value_name ?? '') : value;
    });
}

async function saveAttributesToDB(asin) {
    try {
        const listingData = collectAllAttributeValues();
        const payload = { asin, listingData };
        await fetch(SAVE_PRODUCT_ATTRIBUTES_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error('Eroare la salvarea atributelor:', err);
    }
}

export async function loadProductAttributesFromDB(asin) {
    // CRITICAL: mappingState e la nivel de modul, nu per-produs. Trebuie resetat
    // complet la începutul fiecărei încărcări de produs altfel datele produsului
    // anterior rămân în memorie și contaminează produsul curent. Scenariu clasic:
    // Produs A salvat cu Temu=500, apoi deschis Produs B care NU are Temu salvat;
    // fără reset, categories.temu rămâne 500 din A și la save-ul lui B se trimite
    // accidental Temu=500 deși user-ul nu a ales nimic pe Temu pentru B.
    mappingState.categories = Object.fromEntries(MARKETPLACES.map(m => [m.id, null]));
    mappingState.savedValues = Object.fromEntries(MARKETPLACES.map(m => [m.id, {}]));
    mappingState.categoryNames = Object.fromEntries(MARKETPLACES.map(m => [m.id, null]));
    mappingState.variations = Object.fromEntries(MARKETPLACES.map(m => [m.id, null]));
    mappingState.searchTimers = {};
    mappingState._suppressEmagMappingLookup = false;

    try {
        const res = await fetch(GET_PRODUCT_ATTRIBUTES_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asin })
        });
        if (!res.ok) return;
        const raw = await res.json();
        // Răspunsul poate veni în mai multe forme:
        //   - array:  [{ get_product_attributes_v2: { listing_data } }]  (forma curentă din n8n)
        //   - obiect: { get_product_attributes_v2: { listing_data } }
        //   - direct: { listing_data }
        const root = Array.isArray(raw) ? (raw[0] || {}) : (raw || {});
        const data = root.get_product_attributes_v2 || root;
        const listingData = data?.listing_data || {};
        if (!Object.keys(listingData).length) return;
        // Suprimă lookup-ul automat de mapări cât timp restaurăm datele salvate —
        // userul a confirmat deja categoriile pentru acest produs, nu le rescriem.
        mappingState._suppressEmagMappingLookup = true;
        try {
            // Restaurare categorii și valori per platformă
            const platforms = MARKETPLACES.map(m => m.id);
            for (const platform of platforms) {
                const platformData = listingData[platform];
                if (!platformData) continue;
                // Păstrăm variations (ex: Temu = [{ parentSpecId, specId, specName }])
                // ca să le re-emitem la save — frontend-ul nu le regenerează.
                // Acceptăm și forma veche singular (variation:{...}) pentru compatibilitate.
                if (Array.isArray(platformData.variations)) {
                    mappingState.variations[platform] = platformData.variations;
                } else if (platformData.variation) {
                    mappingState.variations[platform] = [platformData.variation];
                }
                if (!platformData.categoryId) continue;
                // Salvăm valorile din DB indexate pe (platform, categoryId)
                if (!mappingState.savedValues[platform]) mappingState.savedValues[platform] = {};
                mappingState.savedValues[platform][platformData.categoryId] = platformData.attributes || {};
                mappingState.categories[platform] = platformData.categoryId;
                mappingState.categoryNames[platform] = {
                    name: platformData.categoryName || null,
                    nameRo: platformData.categoryNameRo || null
                };
                const selector = document.getElementById(`category-selector-${platform}`);
                let opt = null;
                if (selector) {
                    const catName = platformData.categoryName || `Categorie ${platformData.categoryId}`;
                    // Adaugă opțiunea dacă nu există deja
                    opt = selector.querySelector(`option[value="${platformData.categoryId}"]`);
                    if (!opt) {
                        opt = document.createElement('option');
                        opt.value = platformData.categoryId;
                        opt.textContent = catName;
                        opt.dataset.name = catName;
                        selector.appendChild(opt);
                    }
                    selector.value = platformData.categoryId;
                }
                const fetchResult = await fetchAndRenderAttributes(platform, platformData.categoryId);
                // Aplică ID-ul și numele rezolvate de backend (name-based lookup când ID-ul din
                // competiție eMAG e greșit dar numele e corect → backend găsește ID-ul canonical).
                if (fetchResult) {
                    const resolvedId = fetchResult.resolvedCategoryId || platformData.categoryId;
                    const resolvedName = fetchResult.resolvedCategoryName;
                    const resolvedNameRo = fetchResult.resolvedCategoryNameRo || null;
                    if (resolvedId !== platformData.categoryId) {
                        mappingState.categories[platform] = resolvedId;
                        if (!mappingState.savedValues[platform]) mappingState.savedValues[platform] = {};
                        if (mappingState.savedValues[platform][platformData.categoryId]) {
                            mappingState.savedValues[platform][resolvedId] = mappingState.savedValues[platform][platformData.categoryId];
                            delete mappingState.savedValues[platform][platformData.categoryId];
                        }
                    }
                    // Update categoryNames cu valorile rezolvate de backend (sursa canonică).
                    // Asta supraviețuiește re-randării containerului de competiție, deci
                    // populateCategorySelector poate citi numele de aici după re-render.
                    mappingState.categoryNames[platform] = {
                        name: resolvedName || mappingState.categoryNames[platform]?.name || null,
                        nameRo: resolvedNameRo || mappingState.categoryNames[platform]?.nameRo || null
                    };
                    if (resolvedName && selector) {
                        const currentOpt = selector.querySelector(`option[value="${resolvedId}"]`) || opt;
                        if (currentOpt) {
                            const display = resolvedNameRo
                                ? `${resolvedNameRo} (${resolvedName})`
                                : resolvedName;
                            currentOpt.textContent = display;
                            currentOpt.dataset.name = resolvedName;
                            if (resolvedNameRo) currentOpt.dataset.nameRo = resolvedNameRo;
                        }
                        selector.value = resolvedId;
                    }
                }
                restoreAttributeValues(platform, platformData.attributes || {});
            }
            initMarketplaceReorder();
        } finally {
            mappingState._suppressEmagMappingLookup = false;
        }

        // După restaurare: dacă produsul are eMAG salvat dar NU are salvare pe vreo altă
        // platformă, declanșăm lookup-ul de mapări ca să pre-populăm dropdown-urile de pe
        // celelalte platforme (feature cerut explicit: auto-mapping pe baza eMAG la page load).
        // IMPORTANT: folosim ID-ul REZOLVAT din mappingState (canonic, ex: 820),
        // NU pe cel raw din DB (poate fi greșit, ex: 554 din vechea logică eMAG).
        // mappingState.categories.emag a fost actualizat în loop după fetchAndRenderAttributes.
        const emagId = mappingState.categories.emag || listingData.emag?.categoryId;
        const otherPlatforms = MARKETPLACES.map(m => m.id).filter(id => id !== 'emag');
        const missingTarget = emagId && otherPlatforms.some(p => !listingData[p]?.categoryId);
        if (missingTarget) {
            await applyCategoryMappings(String(emagId));
        }
    } catch (err) {
        console.error('Eroare la încărcarea atributelor:', err);
    }
}

export function handleAllCategoriesToggle(checkbox) {
    const platform = checkbox.dataset.platform;
    const searchBox = document.getElementById(`all-categories-${platform}`);
    if (!searchBox) return;
    searchBox.classList.toggle('hidden', !checkbox.checked);
    if (checkbox.checked) {
        const input = document.getElementById(`cat-search-${platform}`);
        if (input) { input.value = ''; input.focus(); }
        renderCategoryResults(platform, []);
    }
}

export function handleCategorySearch(input) {
    const platform = input.dataset.platform;
    clearTimeout(mappingState.searchTimers[platform]);
    mappingState.searchTimers[platform] = setTimeout(async () => {
        const search = input.value.trim();
        try {
            const res = await fetch(ALL_CATEGORIES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform, search })
            });
            if (!res.ok) return;
            const data = await res.json();
            renderCategoryResults(platform, data.categories || []);
        } catch {
            renderCategoryResults(platform, []);
        }
    }, 300);
}

// Helper HTML escape pentru atribute și text
function escapeHtmlAttr(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
}

// Format display pentru o categorie: "Nume RO (Nume EN)" sau doar EN dacă nu e tradus.
// Folosit atât în rezultate de search cât și ca textContent al <option>.
function formatCategoryLabel(cat) {
    const en = cat.name || '';
    const ro = (cat.nameRo || '').trim();
    if (ro && ro.toLowerCase() !== en.toLowerCase()) {
        return `${ro} (${en})`;
    }
    return en;
}

function renderCategoryResults(platform, categories) {
    const container = document.getElementById(`cat-results-${platform}`);
    if (!container) return;
    if (!categories.length) {
        container.innerHTML = '<p class="px-2 py-1 text-gray-400 italic">Niciun rezultat</p>';
        return;
    }
    container.innerHTML = categories.map(cat => {
        const en = escapeHtmlAttr(cat.name || '');
        const ro = escapeHtmlAttr(cat.nameRo || '');
        const id = escapeHtmlAttr(cat.id);
        // Display: RO îngroșat + EN gri în paranteză, sau doar EN dacă nu există traducere
        const display = (cat.nameRo && cat.nameRo.trim() && cat.nameRo.trim().toLowerCase() !== (cat.name || '').toLowerCase())
            ? `<span class="font-medium text-gray-800">${ro}</span> <span class="text-gray-400">(${en})</span>`
            : `<span>${en}</span>`;
        return `<div class="px-2 py-1.5 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0 cat-result-item"
              data-platform="${platform}" data-id="${id}" data-name="${en}" data-name-ro="${ro}">
            ${display}
         </div>`;
    }).join('');
    container.querySelectorAll('.cat-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const catPlatform = item.dataset.platform;
            const catId = item.dataset.id;
            const catName = item.dataset.name;
            const catNameRo = item.dataset.nameRo || '';
            // Format option text identic cu rezultatele: "Nume RO (Nume EN)" sau doar EN
            const optionLabel = formatCategoryLabel({ name: catName, nameRo: catNameRo });
            const selector = document.getElementById(`category-selector-${catPlatform}`);
            if (selector) {
                let existing = selector.querySelector(`option[value="${catId}"]`);
                if (!existing) {
                    existing = document.createElement('option');
                    existing.value = catId;
                    selector.appendChild(existing);
                }
                existing.textContent = optionLabel;
                existing.dataset.nameRo = catNameRo;
                selector.value = catId;
            }
            // Ascunde search box + debifează checkbox
            const checkbox = document.getElementById(`show-all-${catPlatform}`);
            if (checkbox) checkbox.checked = false;
            document.getElementById(`all-categories-${catPlatform}`)?.classList.add('hidden');
            handleCategoryChange(catPlatform, catId);
        });
    });
}

export async function handleAiFillAttributes(button) {
    const orig = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>`;

    const asin = document.getElementById('product-asin')?.value || '';
    const title = state.editedProductData?.title || '';
    const description = state.editedProductData?.description || '';
    const images = (state.editedProductData?.images || []).slice(0, 3);

    const platforms = MARKETPLACES.map(m => m.id).filter(p => mappingState.categories[p]);
    if (!platforms.length) {
        alert('Selectează mai întâi o categorie pe cel puțin o platformă.');
        button.disabled = false;
        button.innerHTML = orig;
        return;
    }

    let anySuccess = false;
    const workflowErrors = [];
    try {
        for (const platform of platforms) {
            const categoryId = mappingState.categories[platform];
            try {
                const res = await fetch(AI_FILL_ATTRIBUTES_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ asin, platform, categoryId, title, description, images })
                });
                if (!res.ok) {
                    workflowErrors.push(`${platform}: HTTP ${res.status}`);
                    continue;
                }
                const data = await res.json();
                // Workflow-ul poate returna un _error chiar cu HTTP 200 (ex: Gemini key lipsă)
                if (data?._error) {
                    workflowErrors.push(`${platform}: ${data._error}`);
                }
                const filled = data?.attributes?.[platform] || {};
                let filledCount = 0;
                Object.entries(filled).forEach(([attrId, value]) => {
                    const safeId = String(attrId).replace(/[^a-zA-Z0-9_-]/g, '_');
                    const input = document.querySelector(
                        `.attr-value-input[data-platform="${platform}"][data-attr-id="${safeId}"]`
                    );
                    // Completăm doar câmpurile goale — nu suprascriem valorile existente.
                    if (input && !input.value.trim()) {
                        input.value = value;
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        filledCount++;
                    }
                });
                if (filledCount > 0) anySuccess = true;
            } catch (innerErr) {
                console.error(`Eroare AI fill pentru ${platform}:`, innerErr);
                workflowErrors.push(`${platform}: ${innerErr.message || innerErr}`);
            }
        }
        if (!anySuccess) {
            const detail = workflowErrors.length
                ? '\n\nDetalii:\n' + workflowErrors.join('\n')
                : '';
            alert('Nu s-a completat nicio caracteristică. Verifică webhook-ul n8n (v2-ai-fill-attributes) și GEMINI_API_KEY.' + detail);
        }
    } catch (err) {
        console.error('Eroare la completare AI:', err);
        alert('Eroare la completarea AI. Verifică consola.');
    } finally {
        button.disabled = false;
        button.innerHTML = orig;
    }
}
