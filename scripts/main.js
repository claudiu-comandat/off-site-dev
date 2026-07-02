// scripts/main.js
import { state } from './state.js';
import { renderView, isRenderInFlight } from './viewRenderer.js';
import { initGlobalListeners } from './lightbox.js';
import {
    sendReadyToList,
    handleUploadSubmit,
    handleAsinUpdate,
    saveFinancialDetails,
    generateNIR,
    sendToBalance,
    pushFirstAsinToOpenSales,
    pushAllAsinsToOpenSales
} from './api.js';
import { AppState, fetchDataAndSyncState, fetchProductDetailsInBulk } from './data.js';
import { templates } from './templates.js';
import { GET_PALLETS_WEBHOOK_URL } from './constants.js';

// Selectarea rapidă a altei comenzi în dropdown-ul Financiar, înainte ca fetch-ul
// anterior să se termine, ar suprascrie ecranul cu date vechi (race condition) —
// tokenul de mai jos garantează că doar cea mai recentă selecție ajunge pe ecran.
let financiarSelectToken = 0;
import {
    loadTabData,
    handleProductSave,
    handleTitleRefresh,
    handleTranslationInit,
    handleImageActions,
    handleDescriptionToggle,
    saveCurrentTabData,
    saveProductCoreData,
    handleImageTranslation,
    handleDescriptionRefresh,
    handleCategoryChange,
    handleAiFillAttributes,
    handleAllCategoriesToggle,
    handleCategorySearch,
    translateAllMissingRoInOrder
} from './product-details.js';

// --- FUNCȚIE HELPER PENTRU PALEȚI ---
async function fetchPalletsData(commandId) {
    try {
        const response = await fetch(GET_PALLETS_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commandId: commandId })
        });
        
        if (!response.ok) {
            console.error(`Eroare la preluarea paleților: ${response.status}`);
            return [];
        }
        
        const data = await response.json();
        return Array.isArray(data) ? data : (data.pallets || []);
    } catch (error) {
        console.error("Eroare network paleți:", error);
        return [];
    }
}

// --- LOGICA DE CALCUL FINANCIAR (CU RAPORTARE ERORI) ---
function performFinancialCalculations(commandId, products, palletsData) {
    console.group("--- START CALCULE FINANCIARE ---");

    // 1. Preluare input-uri financiare
    const currencyEl = document.getElementById('financiar-moneda');
    const rateEl = document.getElementById('financiar-rata-schimb');
    const transportEl = document.getElementById('financiar-cost-transport');
    const discountEl = document.getElementById('financiar-reducere');
    
    const currency = (currencyEl ? currencyEl.value : '') || 'RON';
    let exchangeRate = 1;

    if (currency !== 'RON' && currency !== 'LEI') {
        const rawRate = rateEl ? parseFloat(rateEl.value) : 0;
        if (!rawRate || rawRate <= 0 || rawRate === 1) {
             alert("EROARE CRITICĂ: Cursul valutar este invalid sau nesetat.");
             console.groupEnd();
             return null;
        }
        exchangeRate = rawRate;
    }

    // 2. Mapare Costuri Paleți
    const palletMap = {}; 
    palletsData.forEach(p => {
        if (String(p.orderid) !== String(commandId)) return; 
        if(p.manifestsku) {
             if (!palletMap[p.manifestsku]) {
                 const cost = parseFloat(p.costwithoutvat || 0) * exchangeRate;
                 palletMap[p.manifestsku] = { cost: cost, totalSales: 0, hasItems: false };
             }
        }
    });

    // 3. Validare Produse - COLECTARE ERORI
    const validProducts = [];
    const errorMessages = []; // Aici strângem toate problemele
    let totalValidQty = 0;

    for (const p of products) {
        const totalReceived = (p.bncondition || 0) + (p.vgcondition || 0) + (p.gcondition || 0) + (p.broken || 0);
        const qty = totalReceived - (p.broken || 0);

        // Ignorăm produsele care nu există fizic (cantitate 0)
        if (qty <= 0) continue; 

        const details = AppState.getProductDetails(p.asin) || {};
        const price = parseFloat(details.price) || 0;
        const manifestSku = p.manifestsku;

        // Verificări punctuale
        if (!manifestSku) {
            errorMessages.push(`- Produs ${p.asin}: Lipsește Manifest SKU`);
        } else if (price <= 0) {
            errorMessages.push(`- Produs ${p.asin} (SKU: ${manifestSku}): Preț estimat este 0`);
        } else if (!palletMap[manifestSku]) {
            errorMessages.push(`- Produs ${p.asin} (SKU: ${manifestSku}): Nu există palet asociat pentru această comandă`);
        } else {
            palletMap[manifestSku].totalSales += (price * qty);
            palletMap[manifestSku].hasItems = true;
            validProducts.push({ ...p, price, qty, manifestSku });
            totalValidQty += qty;
        }
    }

    // --- STOP SI RAPORTARE ERORI ---
    if (errorMessages.length > 0) {
        const msg = `Nu se pot efectua calculele! Au fost găsite următoarele probleme:\n\n${errorMessages.slice(0, 15).join('\n')}${errorMessages.length > 15 ? '\n... și altele.' : ''}\n\nVă rugăm să corectați prețul sau datele acestor produse și să încercați din nou.`;
        alert(msg);
        console.warn("Calcule oprite din cauza erorilor:", errorMessages);
        console.groupEnd();
        return null;
    }

    if (totalValidQty === 0) {
        alert("Nu există produse valide (cu cantitate > 0) pentru a efectua calculul.");
        console.groupEnd();
        return null;
    }

    // 4. Calculăm ȚINTA REALĂ — includem TOȚI paleții (și cei fără produse valide)
    let activePalletsTotalCost = 0;
    let orphanPalletCost = 0;
    Object.keys(palletMap).forEach(sku => {
        activePalletsTotalCost += palletMap[sku].cost;
        if (!palletMap[sku].hasItems) {
            orphanPalletCost += palletMap[sku].cost;
        }
    });

    const transportRaw = parseFloat(transportEl ? transportEl.value : 0) || 0;
    const discountRaw = parseFloat(discountEl ? discountEl.value : 0) || 0;

    const transportCostTotal = transportRaw * exchangeRate;
    const discountTotal = discountRaw * exchangeRate;
    const finalTransportCost = transportCostTotal - discountTotal;

    const TARGET_TOTAL = activePalletsTotalCost + finalTransportCost;

    // 5. Calcul Brut per Produs
    // Costul paletilor fara produse valide (ex: tot broken) e redistribuit
    // proportional dupa valoarea estimata a produselor valide.
    const totalGlobalSales = validProducts.reduce((sum, p) => sum + (p.price * p.qty), 0);

    let currentCalculatedSum = 0;
    const resultsBuffer = [];
    const transportPerUnit = finalTransportCost / totalValidQty;

    validProducts.forEach(p => {
        const pal = palletMap[p.manifestSku];
        let percent = 0;
        let palletComponentTotal = 0;

        if (pal && pal.totalSales > 0) {
            const lineValue = p.price * p.qty;
            const lineShare = lineValue / pal.totalSales;
            palletComponentTotal = lineShare * pal.cost;
            percent = lineShare * 100;
        }

        // Redistribuie costul paletilor orphani proportional pe toate produsele valide
        if (orphanPalletCost > 0 && totalGlobalSales > 0) {
            palletComponentTotal += (p.price * p.qty / totalGlobalSales) * orphanPalletCost;
        }

        const transportComponentTotal = transportPerUnit * p.qty;
        const lineTotalCost = palletComponentTotal + transportComponentTotal;
        
        currentCalculatedSum += lineTotalCost;

        resultsBuffer.push({
            uniqueId: p.uniqueId,
            qty: p.qty,
            lineTotalCost: lineTotalCost,
            percentDisplay: percent
        });
    });

    // 6. Corecția de "Centimă"
    const diff = TARGET_TOTAL - currentCalculatedSum;
    if (resultsBuffer.length > 0) {
        resultsBuffer[0].lineTotalCost += diff;
    }

    // 7. Finalizare
    const finalResults = {};
    resultsBuffer.forEach(res => {
        const finalUnitCost = res.lineTotalCost / res.qty;
        finalResults[res.uniqueId] = {
            percentDisplay: parseFloat(res.percentDisplay.toFixed(4)),
            unitCost: finalUnitCost, 
            totalCost: res.lineTotalCost 
        };
    });

    console.groupEnd();
    return finalResults;
}

document.addEventListener('DOMContentLoaded', async () => {
    const mainContent = document.getElementById('main-content');

    // Listeneri globali
    document.body.addEventListener('click', async (event) => {
        const target = event.target;
        const sidebarBtn = target.closest('.sidebar-btn');

        if (sidebarBtn) {
            const view = sidebarBtn.dataset.view;
            if (view) {
                event.stopPropagation(); 
                await renderView(view);
                return;
            }
        }
    });

    mainContent.addEventListener('click', async (event) => {
        const target = event.target;
        
        const commandCard = target.closest('[data-command-id]:not([data-action])');
        const palletCard = target.closest('[data-manifest-sku]:not([data-action])');
        const productCard = target.closest('[data-product-id]:not([data-action="go-to-product"])');
        const actionButton = target.closest('[data-action]');
        const versionButton = target.closest('.version-btn');
        const languageOption = target.closest('.language-option');
        const descModeButton = target.closest('[data-action="toggle-description-mode"]');
        const thumbnail = target.closest('[data-action="select-thumbnail"]');

        // Navigare Simplă
        if (commandCard) {
            state.currentSearchQuery = '';
            state.currentCommandId = commandCard.dataset.commandId;
            state.currentManifestSKU = null;
            state.currentProductId = null;
            await renderView('paleti', { commandId: state.currentCommandId });
            return;
        }
        if (palletCard) {
            state.currentManifestSKU = palletCard.dataset.manifestSku;
            state.currentProductId = null;
            await renderView('produse', { commandId: state.currentCommandId, manifestSKU: state.currentManifestSKU });
            return;
        }
        if (productCard) {
            state.productScrollPosition = mainContent.scrollTop;
            state.currentProductId = productCard.dataset.productId;
            await renderView('produs-detaliu', {
                commandId: state.currentCommandId,
                productId: state.currentProductId
            });
            return;
        }

        // Tab-uri și UI
        if (versionButton) { loadTabData(versionButton.dataset.versionKey); return; }
        if (descModeButton) { handleDescriptionToggle(descModeButton); return; }
        if (thumbnail) {
            const newImageSrc = thumbnail.dataset.src;
            if (!newImageSrc) return;
            const mainImg = document.getElementById('main-image');
            if (mainImg) mainImg.src = newImageSrc;
            document.querySelectorAll('.thumbnail-image').forEach(img => {
                const parent = img.closest('[data-image-src]');
                img.classList.toggle('border-blue-600', parent && parent.dataset.imageSrc === newImageSrc);
            });
            return;
        }
        if (languageOption) {
            event.preventDefault();
            handleTranslationInit(languageOption);
            return;
        }

        // Acțiuni Butoane
        if (actionButton) {
            const action = actionButton.dataset.action;

            if (action === 'go-to-product') {
                event.preventDefault(); 
                const commandId = actionButton.dataset.commandId;
                const productId = actionButton.dataset.productId; 
                state.previousView = state.currentView; 
                
                const command = AppState.getCommands().find(c => c.id === commandId);
                const product = command?.products.find(p => p.uniqueId === productId);

                if (product) {
                    state.currentCommandId = commandId;
                    state.currentManifestSKU = product.manifestsku || 'No ManifestSKU';
                    state.currentProductId = productId;
                    await renderView('produs-detaliu', { commandId: state.currentCommandId, productId: state.currentProductId });
                }
                return; 
            }
            
            if (action === 'save-financial') {
                const currentFinancials = AppState.getFinancialData().find(f => f.orderid === state.currentCommandId) || {};
                const payload = {
                    orderid: document.getElementById('financiar-order-id').value,
                    totalordercostwithoutvat: document.getElementById('financiar-total-fara-tva').value,
                    totalordercostwithvat: document.getElementById('financiar-total-cu-tva').value,
                    transportcost: document.getElementById('financiar-cost-transport').value,
                    discount: document.getElementById('financiar-reducere').value,
                    currency: document.getElementById('financiar-moneda').value,
                    exchangerate: document.getElementById('financiar-rata-schimb').value,
                    nirnumber: currentFinancials.nirnumber || null
                };
                await saveFinancialDetails(payload, actionButton);
            }
            
            if (action === 'run-calculations') {
                const commandId = state.currentCommandId;
                if (!commandId) { alert('Selectați o comandă mai întâi.'); return; }

                const command = AppState.getCommands().find(c => c.id === commandId);
                actionButton.disabled = true;
                actionButton.textContent = 'Se verifică datele...';
                
                try {
                    const palletsData = await fetchPalletsData(commandId);
                    const calculatedData = performFinancialCalculations(commandId, command.products, palletsData);
                    
                    if (calculatedData) {
                        if (!state.financialCalculations) state.financialCalculations = {};
                        state.financialCalculations[commandId] = calculatedData;

                        // Calculele există acum → activăm butoanele OpenSales.
                        ['opensales-first-btn', 'opensales-all-btn'].forEach(id => {
                            const b = document.getElementById(id);
                            if (b) b.disabled = false;
                        });

                        // Re-randare tabel cu datele calculate
                        const detailsContainer = document.getElementById('financiar-details-container');
                        const financialDataList = AppState.getFinancialData();
                        let matchedFinancial = financialDataList.find(item => item.orderid === commandId) || { orderid: commandId };
                        
                        matchedFinancial.currency = document.getElementById('financiar-moneda').value;
                        matchedFinancial.exchangerate = document.getElementById('financiar-rata-schimb').value;
                        matchedFinancial.transportcost = document.getElementById('financiar-cost-transport').value;
                        
                        const asins = command.products.map(p => p.asin);
                        const detailsMap = await fetchProductDetailsInBulk(asins);
                        
                        detailsContainer.innerHTML = templates.financiarDetails(command, matchedFinancial, detailsMap, palletsData, calculatedData);
                        alert("Calcule efectuate cu succes!");
                    }
                } catch(e) {
                    console.error(e);
                    alert("Eroare neașteptată: " + e.message);
                } finally {
                    actionButton.disabled = false;
                    actionButton.innerHTML = '<span class="material-icons text-sm">calculate</span><span>Rulează Calcule</span>';
                }
            }

            if (action === 'generate-nir') {
                if (!state.currentCommandId) { alert('Selectați o comandă mai întâi.'); return; }
                await generateNIR(state.currentCommandId, actionButton);
            }

            if (action === 'send-to-balance') {
                if (!state.currentCommandId) { alert('Selectați o comandă mai întâi.'); return; }
                await sendToBalance(state.currentCommandId, actionButton);
            }

            if (action === 'opensales-first') {
                if (!state.currentCommandId) { alert('Selectați o comandă mai întâi.'); return; }
                await pushFirstAsinToOpenSales(state.currentCommandId, actionButton);
            }

            if (action === 'opensales-all') {
                if (!state.currentCommandId) { alert('Selectați o comandă mai întâi.'); return; }
                await pushAllAsinsToOpenSales(state.currentCommandId, actionButton);
            }

            if (action === 'translate-missing-ro') {
                const commandId = actionButton.dataset.commandId;
                if (!commandId) { alert('Selectați o comandă mai întâi.'); return; }
                await translateAllMissingRoInOrder(commandId, actionButton);
            }

            // Navigare Înapoi
            if (action === 'back-to-comenzi') {
                state.currentCommandId = null; state.currentManifestSKU = null; state.currentProductId = null; state.currentSearchQuery = '';
                await renderView('comenzi');
            }
            if (action === 'back-to-paleti') {
                state.currentManifestSKU = null; state.currentProductId = null;
                await renderView('paleti', { commandId: state.currentCommandId });
            }
            if (action === 'back-to-produse') {
                state.currentProductId = null;
                if (state.previousView === 'financiar') {
                    await renderView('financiar');
                    // Restaurare selecție
                    const select = document.getElementById('financiar-command-select');
                    if (select && state.currentCommandId) {
                        select.value = state.currentCommandId;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                } else {
                    await renderView('produse', { commandId: state.currentCommandId, manifestSKU: state.currentManifestSKU });
                }
            }

            // Alte acțiuni
             if (action === 'ready-to-list-single') {
                const asin = actionButton.dataset.asin;
                const orderId = actionButton.dataset.orderId;
                const palletSku = actionButton.dataset.palletSku;
                const currentStatus = actionButton.dataset.currentStatus === 'true';
                const setReadyStatus = !currentStatus;
                
                if (confirm(`Sigur doriți să ${setReadyStatus ? "marcați" : "anulați marcajul"} acest produs?`)) {
                    let saveSuccess = true;
                    if (setReadyStatus) saveSuccess = await saveProductCoreData();
                    if (saveSuccess) {
                        const success = await sendReadyToList({ orderId, pallet: palletSku || 'N/A', asin, setReadyStatus }, actionButton);
                        if (success) await renderView('produs-detaliu', { commandId: state.currentCommandId, productId: state.currentProductId });
                    }
                }
            }
            if (action === 'ready-to-list-command') {
                const commandId = actionButton.dataset.commandId;
                const setReadyStatus = !(actionButton.dataset.currentStatus === 'true');
                if (confirm(`Sigur doriți să ${setReadyStatus ? "marcați" : "anulați"} toată comanda?`)) {
                    const success = await sendReadyToList({ orderId: commandId, setReadyStatus }, actionButton);
                    if (success) await renderView('comenzi');
                }
            }
            if (action === 'edit-asin') {
                const success = await handleAsinUpdate(actionButton);
                if (success) await renderView('produs-detaliu', { commandId: state.currentCommandId, productId: state.currentProductId });
            }
            if (action === 'refresh-ro-title') await handleTitleRefresh(actionButton);
            if (action === 'refresh-ro-description') await handleDescriptionRefresh(actionButton);
            if (action === 'ai-fill-attributes') await handleAiFillAttributes(actionButton);
            if (action === 'save-product') {
                const success = await handleProductSave(actionButton);
                if (success) {
                    if (state.previousView === 'financiar') {
                         await renderView('financiar');
                         const select = document.getElementById('financiar-command-select');
                         if(select) { select.value = state.currentCommandId; select.dispatchEvent(new Event('change')); }
                    } else {
                        await renderView('produse', { commandId: state.currentCommandId, manifestSKU: state.currentManifestSKU });
                    }
                }
            }
            if (action === 'translate-ai-images') {
                 const currentTabKey = state.activeVersionKey;
                 const success = await handleImageTranslation(actionButton);
                 if (success) {
                    AppState.clearProductCache(document.getElementById('product-asin')?.value);
                    await fetchDataAndSyncState();
                    await renderView('produs-detaliu', { commandId: state.currentCommandId, productId: state.currentProductId });
                    loadTabData(currentTabKey);
                 }
            }
            if (['delete-image', 'add-image-url', 'copy-origin-images'].includes(action)) {
                handleImageActions(action, actionButton);
            }
        }
    });

    // Listeners Input
    mainContent.addEventListener('input', (event) => {
        if (event.target.id === 'language-search') {
            const filter = event.target.value.toLowerCase();
            document.querySelectorAll('#language-list .language-option').forEach(l => l.style.display = l.textContent.toLowerCase().includes(filter) ? '' : 'none');
        }
        else if (event.target.id?.startsWith('cat-search-')) {
            handleCategorySearch(event.target);
        }
        else if (event.target.id === 'product-search-input') {
            state.currentSearchQuery = event.target.value;
            clearTimeout(state.searchTimeout);
            state.searchTimeout = setTimeout(async () => {
                // Deja e o randare în lucru (comanda tocmai se încarcă) — nu mai pornim
                // un fetch în plus; cea în curs citește query-ul curent după await și
                // aplică singură filtrul când termină.
                if (isRenderInFlight()) return;
                if (state.currentView === 'paleti') await renderView('paleti', { commandId: state.currentCommandId, silent: true });
                else if (state.currentView === 'produse') await renderView('produse', { commandId: state.currentCommandId, manifestSKU: state.currentManifestSKU, silent: true });
                const inp = document.getElementById('product-search-input');
                if(inp) { inp.focus(); const v = inp.value; inp.value = ''; inp.value = v; }
            }, 300);
        }
        else if (event.target.id === 'financiar-total-fara-tva') {
            const tvaField = document.getElementById('financiar-total-cu-tva');
            if (tvaField) tvaField.value = (parseFloat(event.target.value || 0) * 1.21).toFixed(2);
        }
    });

    // Listener Change (Dropdown Financiar)
    mainContent.addEventListener('change', async (event) => {
        if (event.target.id?.startsWith('category-selector-')) {
            const platform = event.target.id.replace('category-selector-', '');
            await handleCategoryChange(platform, event.target.value);
            return;
        }
        if (event.target.id?.startsWith('show-all-')) {
            handleAllCategoriesToggle(event.target);
            return;
        }
        if (event.target.id === 'financiar-command-select') {
            const cmdId = event.target.value;
            const myToken = ++financiarSelectToken;
            state.currentCommandId = cmdId;
            const container = document.getElementById('financiar-details-container');
            const btns = ['save-financial-btn', 'generate-nir-btn', 'run-calculations-btn', 'send-balance-btn'].map(id => document.getElementById(id));
            const opensalesBtns = ['opensales-first-btn', 'opensales-all-btn'].map(id => document.getElementById(id));

            if (!cmdId) {
                container.innerHTML = templates.financiarDetails(null);
                btns.forEach(b => { if(b) b.disabled = true; });
                opensalesBtns.forEach(b => { if(b) b.disabled = true; });
                return;
            }

            btns.forEach(b => { if(b) b.disabled = false; });
            // OpenSales: active DOAR dacă au fost rulate calculele pentru această comandă.
            const hasCalc = !!(state.financialCalculations && state.financialCalculations[cmdId]);
            opensalesBtns.forEach(b => { if(b) b.disabled = !hasCalc; });
            container.innerHTML = '<div class="text-center p-8 text-gray-500">Se actualizează datele...</div>';

            const cmdData = AppState.getCommands().find(c => c.id === cmdId);
            const financialData = AppState.getFinancialData().find(f => f.orderid === cmdId) || { orderid: cmdId };
            const palletsData = await fetchPalletsData(cmdId);
            
            // Golim cache-ul pt a forța update la preturi/titluri
            if(cmdData && cmdData.products) {
                cmdData.products.forEach(p => AppState.clearProductCache(p.asin));
            }
            
            const detailsMap = await fetchProductDetailsInBulk(cmdData.products.map(p => p.asin));
            const calculatedData = state.financialCalculations ? state.financialCalculations[cmdId] : null;

            if (myToken !== financiarSelectToken) return; // s-a selectat altă comandă între timp
            container.innerHTML = templates.financiarDetails(cmdData, financialData, detailsMap, palletsData, calculatedData);
        }
    });

    // Upload & Altele
    mainContent.addEventListener('submit', async (e) => {
        if (e.target.id === 'upload-form') {
            if (await handleUploadSubmit(e)) await renderView('comenzi');
        }
    });
    
    document.addEventListener('images-sorted', () => saveCurrentTabData());
    initGlobalListeners();

    // Restaurare View
    if (state.currentView === 'financiar') {
        await renderView('financiar');
        if (state.currentCommandId) {
            const s = document.getElementById('financiar-command-select');
            if(s) { s.value = state.currentCommandId; s.dispatchEvent(new Event('change')); }
        }
    } else {
        renderView(state.currentView || 'comenzi');
    }
});
