import { state } from './state.js';
import { languages, languageNameToCodeMap, MARKETPLACES } from './constants.js';

// Renderer pentru o coloană marketplace în grid-ul de mapping categorii/caracteristici.
// Uses inline styles pentru culori (Tailwind JIT nu poate construi clase dinamice).
function renderMarketplaceColumn(mp, idx) {
    const isLast  = idx === MARKETPLACES.length - 1;
    const borderClass = isLast ? '' : 'border-r border-gray-200';
    const placeholderLabel = mp.id === 'emag' ? 'Se încarcă...' : 'Selectați o categorie...';
    return `<div class="px-2 ${borderClass} marketplace-column" data-platform="${mp.id}">
        <div class="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b border-gray-100">
            <span class="material-icons marketplace-drag-handle text-gray-400 cursor-grab select-none" title="Trage pentru a reordona coloana" style="font-size:14px;">drag_indicator</span>
            <div class="w-2 h-2 rounded-full flex-shrink-0" style="background:${mp.colorHex};"></div>
            <span class="font-semibold text-sm" style="color:${mp.colorHex};">${mp.label}</span>
        </div>
        <div class="mb-1.5">
            <div class="flex items-center gap-1">
                <select id="category-selector-${mp.id}" data-platform="${mp.id}"
                        class="flex-1 border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none min-w-0">
                    <option value="">${placeholderLabel}</option>
                </select>
                <label class="flex items-center gap-1 cursor-pointer flex-shrink-0">
                    <input type="checkbox" id="show-all-${mp.id}" data-platform="${mp.id}"
                           class="w-3 h-3 rounded cursor-pointer">
                    <span class="text-xs text-gray-500 whitespace-nowrap">Toate</span>
                </label>
            </div>
            <div id="all-categories-${mp.id}" class="hidden mt-1">
                <input type="text" id="cat-search-${mp.id}" data-platform="${mp.id}"
                       placeholder="Caută categorie ${mp.label}..."
                       class="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none">
                <div id="cat-results-${mp.id}"
                     class="mt-1 border border-gray-200 rounded max-h-40 overflow-y-auto bg-white shadow-sm text-xs"></div>
            </div>
        </div>
        <div id="${mp.id}-attributes" class="space-y-1">
            <p class="text-xs text-gray-400 italic">Selectați o categorie</p>
        </div>
    </div>`;
}

// Legend strip afișată deasupra grid-ului de mapping — explică iconițele și culorile.
function renderMappingLegend() {
    return `<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 px-2 py-1 mb-2 bg-gray-50 rounded border border-gray-200">
        <span class="font-semibold text-gray-600">Legendă:</span>
        <span class="flex items-center gap-1"><span class="inline-block px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-medium">Nume<span class="text-red-500">*</span></span>obligatoriu</span>
        <span class="flex items-center gap-1"><span class="inline-block px-1.5 py-0.5 rounded bg-gray-50 text-gray-600">Nume</span>opțional</span>
        <span class="flex items-center gap-1"><span class="bg-green-100 text-green-700 rounded px-1 leading-4">✏️</span>permite custom</span>
        <span class="flex items-center gap-1"><span class="bg-gray-200 text-gray-500 rounded px-1 leading-4">🔒</span>doar lista</span>
        <span class="flex items-center gap-1"><span class="material-icons text-gray-400" style="font-size:13px;">drag_indicator</span>trage coloana</span>
    </div>`;
}

export function initializeSortable() {
    const thumbsContainer = document.getElementById('thumbnails-container');
    if (state.sortableInstance) {
        state.sortableInstance.destroy();
        state.sortableInstance = null;
    }
    if (thumbsContainer) {
        state.sortableInstance = new Sortable(thumbsContainer, {
            animation: 150,
            ghostClass: 'bg-blue-100',
            forceFallback: true,
            onEnd: () => {
                document.dispatchEvent(new CustomEvent('images-sorted'));
            }
        });
    }
}

export function renderCompetitionStars(ratingString) {
    const rating = parseFloat(ratingString) || 0;
    let starsHTML = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            starsHTML += '<span class="material-icons text-yellow-400" style="font-size: 16px;">star</span>';
        } else if (i - 0.5 <= rating) {
            starsHTML += '<span class="material-icons text-yellow-400" style="font-size: 16px;">star_half</span>';
        } else {
            starsHTML += '<span class="material-icons text-gray-300" style="font-size: 16px;">star_border</span>';
        }
    }
    return `<div class="flex items-center">${starsHTML}</div>`;
}

export function renderImageGallery(images) {
    const isEffectivelyEmpty = (
        images === undefined || 
        images === null || 
        (Array.isArray(images) && images.every(img => !img))
    );
    
    if (isEffectivelyEmpty) {
        let buttonsHTML = `
            <button data-action="add-image-url" class="mt-4 w-full flex items-center justify-center space-x-2 p-2 text-sm text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                <span class="material-icons text-base">add_link</span>
                <span>Adaugă Imagine (URL)</span>
            </button>
        `;

        if (state.activeVersionKey !== 'origin') {
            buttonsHTML += `
                <div class="mt-2 grid grid-cols-2 gap-2">
                    <button data-action="copy-origin-images" class="p-2 text-sm text-center text-white bg-gray-600 rounded-lg hover:bg-gray-700 transition-colors">
                        Copiaza pozele din Origin
                    </button>
                    <button data-action="translate-ai-images" class="p-2 text-sm text-center text-white bg-gray-500 rounded-lg hover:bg-gray-600 transition-colors">
                        Adauga poze cu Traducere AI
                    </button>
                </div>
            `;
        }

        return `
            <div class="flex flex-col items-center justify-center h-48 text-gray-500">
                <span class="material-icons text-4xl">photo_library</span>
                <p class="mt-2">Nu ai stabilit niste poze pentru aceasta tara.</p>
            </div>
            ${buttonsHTML}
        `;
    }

    const filteredImages = images.filter(img => img);
    const uniqueImages = [...new Set(filteredImages)];
    const imagesToRender = uniqueImages;
    const mainImageSrc = imagesToRender[0] || '';
    
    let thumbnailsHTML = '';

    for (let i = 0; i < 5; i++) {
        const img = uniqueImages[i];
        if (img) {
            thumbnailsHTML += `
                <div class="relative group aspect-square" data-image-src="${img}">
                    <img src="${img}"
                         class="w-full h-full object-cover rounded-md thumbnail-image ${mainImageSrc === img ? 'border-2 border-blue-600' : ''}">
                    <div data-action="select-thumbnail" data-src="${img}" class="absolute inset-0 cursor-pointer z-0"></div>
                    <button data-action="delete-image" data-image-src="${img}"
                            class="absolute top-0 right-0 -mt-1 -mr-1 p-0.5 bg-red-600 text-white rounded-full hidden group-hover:block hover:bg-red-700 transition-all opacity-90 hover:opacity-100 z-10">
                        <span class="material-icons" style="font-size: 16px;">close</span>
                    </button>
                </div>
            `;
        } else {
            thumbnailsHTML += `
                <div class="aspect-square border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center">
                    <span class="material-icons text-gray-300">add</span>
                </div>
            `;
        }
    }

    let addButtonHTML = '';
    if (uniqueImages.length < 5) {
        addButtonHTML = `
            <button data-action="add-image-url" class="mt-4 w-full flex items-center justify-center space-x-2 p-2 text-sm text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                <span class="material-icons text-base">add_link</span>
                <span>Adaugă Imagine (URL)</span>
            </button>
        `;
    }

    return `
        <img id="main-image" data-action="open-lightbox" alt="Imaginea principală" class="w-[85%] mx-auto h-auto object-cover rounded-lg aspect-[4/3] cursor-pointer" src="${mainImageSrc}">
        <div id="thumbnails-container" class="grid grid-cols-5 gap-2 mt-4">${thumbnailsHTML}</div>
        ${addButtonHTML}
    `;
}

export const templates = {

    financiarInput: (id, label, value = '', readonly = false, type = 'text') => `
        <div class="col-span-1">
            <label for="${id}" class="block text-sm font-medium text-gray-500">${label}</label>
            <input type="${type}" id="${id}" name="${id}" value="${value}" 
                   class="no-spinner mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm 
                          ${readonly ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : 'bg-white'} focus:ring-blue-500 focus:border-blue-500" 
                   ${readonly ? 'readonly' : ''}
                   ${type === 'number' ? 'step="0.01"' : ''}>
        </div>
    `,

financiarProductTable: (products, detailsMap, commandId, calculatedData = null) => {
        if (!products || products.length === 0) return '';

        const processedProducts = products.map(p => {
            // Formula: Total Recepționat - Broken
            const totalReceived = (p.bncondition || 0) + (p.vgcondition || 0) + (p.gcondition || 0) + (p.broken || 0);
            const displayQty = totalReceived - (p.broken || 0);

            if (displayQty <= 0) return null;

            const details = detailsMap[p.asin] || {};
            const roData = details.other_versions?.['Romanian'] || {};
            
            const title = (roData.title || '').trim();
            const mainImage = (roData.images && roData.images[0]) ? roData.images[0] : ((details.images && details.images[0]) ? details.images[0] : '');
            const price = parseFloat(details.price) || 0;
            const manifestSku = p.manifestsku || '';

            const errors = [];
            if (!manifestSku) errors.push("Lipsește ManifestSKU");
            if (!title || title === "N/A" || title.length < 10) {
                errors.push("Titlu RO lipsă sau invalid");
            } else if (title.length > 255) {
                errors.push("Titlu RO prea lung (> 255 caractere)");
            }
            if (price <= 0) errors.push("Preț estimat <= 0");

            // Date calculate
            const calc = calculatedData ? calculatedData[p.uniqueId] : null;

            return {
                ...p,
                displayTitle: title || 'N/A',
                displayImage: mainImage,
                displayPrice: price,
                displayQty: displayQty,
                manifestSku: manifestSku,
                errors: errors,
                hasErrors: errors.length > 0,
                calcPercent: calc ? calc.percentDisplay : '-',
                calcUnitCost: calc ? calc.unitCost.toFixed(2) : '-',
                calcTotalCost: calc ? calc.totalCost.toFixed(2) : '-'
            };
        }).filter(p => p !== null);

        processedProducts.sort((a, b) => {
            if (a.hasErrors && !b.hasErrors) return -1;
            if (!a.hasErrors && b.hasErrors) return 1;
            return 0;
        });

        // --- CALCUL TOTAL FINAL ---
        const totalSum = processedProducts.reduce((sum, p) => {
            const val = parseFloat(p.calcTotalCost);
            return sum + (isNaN(val) ? 0 : val);
        }, 0);
        // --------------------------

        const rowsHTML = processedProducts.map(p => {
            const rowClass = p.hasErrors ? 'bg-red-50 hover:bg-red-100 border-l-4 border-red-500' : 'hover:bg-gray-50';
            
            let warningIcon = '';
            if (p.hasErrors) {
                const errorMsg = p.errors.join(', ');
                warningIcon = `
                    <div class="relative group flex items-center justify-center">
                        <span class="material-icons text-red-600 cursor-help">error</span>
                        <div class="absolute left-6 top-0 w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 whitespace-normal">
                            ${errorMsg}
                        </div>
                    </div>
                `;
            }

            const colManifest = `
                <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                    <div class="flex items-center space-x-2">
                        ${warningIcon}
                        <span>${p.manifestSku || '<span class="text-red-500 italic">Lipsă</span>'}</span>
                    </div>
                </td>`;

            const colAsin = `
                <td class="px-4 py-4 whitespace-nowrap text-sm">
                    <button data-action="go-to-product" 
                            data-command-id="${commandId}" 
                            data-product-id="${p.uniqueId}" 
                            class="text-blue-600 hover:text-blue-900 font-bold hover:underline">
                        ${p.asin}
                    </button>
                </td>`;

            const colImage = `
                <td class="px-4 py-4 whitespace-nowrap">
                    <div class="h-16 w-16 flex-shrink-0">
                         <img class="h-16 w-16 rounded object-cover border border-gray-200" src="${p.displayImage || 'https://placehold.co/64x64?text=No+Img'}" alt="Produs">
                    </div>
                </td>`;

            const colTitle = `
                <td class="px-4 py-4 text-sm text-gray-500">
                    <div class="line-clamp-2 max-w-xs" title="${p.displayTitle}">${p.displayTitle}</div>
                </td>`;

            const priceClass = p.displayPrice <= 0 ? 'text-red-600 font-bold' : 'text-gray-900';
            const colPrice = `
                <td class="px-4 py-4 whitespace-nowrap text-sm ${priceClass}">
                    ${p.displayPrice.toFixed(2)}
                </td>`;

            const colQty = `
                <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-900 text-center font-bold">
                    ${p.displayQty}
                </td>`;

            const colPercent = `
                <td class="px-4 py-4 whitespace-nowrap text-sm text-gray-600 text-center bg-yellow-50">
                    ${p.calcPercent !== '-' ? p.calcPercent : '-'}
                </td>`;
            
            const colUnitCost = `
                <td class="px-4 py-4 whitespace-nowrap text-sm text-blue-800 font-bold text-right bg-yellow-50">
                    ${p.calcUnitCost}
                </td>`;

            const colTotalCost = `
                <td class="px-4 py-4 whitespace-nowrap text-sm text-green-800 font-bold text-right bg-yellow-50">
                    ${p.calcTotalCost}
                </td>`;

            return `<tr class="${rowClass}">${colManifest}${colAsin}${colImage}${colTitle}${colPrice}${colQty}${colPercent}${colUnitCost}${colTotalCost}</tr>`;
        }).join('');

        return `
            <div class="mt-8">
                <h3 class="text-lg font-bold text-gray-800 mb-4">Lista Produse Recepționate</h3>
                <div class="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg" style="overflow-y: visible;"> 
                    <table class="min-w-full divide-y divide-gray-300">
                        <thead class="bg-gray-50">
                            <tr>
                                <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manifest SKU</th>
                                <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ASIN</th>
                                <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Imagine</th>
                                <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Titlu (RO)</th>
                                <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Preț Est.</th>
                                <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                                <th scope="col" class="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider bg-yellow-100">Procent Palet</th>
                                <th scope="col" class="px-4 py-3 text-right text-xs font-medium text-blue-800 uppercase tracking-wider bg-yellow-100">Cost Unitar</th>
                                <th scope="col" class="px-4 py-3 text-right text-xs font-medium text-green-800 uppercase tracking-wider bg-yellow-100">Cost Total</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 bg-white">
                            ${rowsHTML}
                        </tbody>
                        <tfoot class="bg-gray-100 font-bold border-t-2 border-gray-300">
                            <tr>
                                <td colspan="8" class="px-4 py-3 text-right text-gray-700 uppercase">Total Calculat:</td>
                                <td class="px-4 py-3 text-right text-green-800 text-lg">${totalSum.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
    },

    financiarDetails: (commandData, financialData, detailsMap, palletsData, calculatedData = null) => {
        if (!commandData) {
            return '<p class="text-gray-500 text-center col-span-full">Selectați o comandă pentru a vedea detaliile.</p>';
        }

        const noSpinnerStyle = `
            <style>
                .no-spinner::-webkit-inner-spin-button, 
                .no-spinner::-webkit-outer-spin-button { 
                    -webkit-appearance: none; 
                    margin: 0; 
                }
                .no-spinner {
                    -moz-appearance: textfield;
                }
            </style>
        `;

        const data = {
            orderid: financialData?.orderid || commandData.id,
            orderdate: financialData?.orderdate ? financialData.orderdate.split('T')[0] : '2025-01-01', 
            total_no_vat: financialData?.totalordercostwithoutvat || 0,
            total_with_vat: financialData?.totalordercostwithvat || 0,
            transport: financialData?.transportcost || 0,
            discount: financialData?.discount || 0,
            currency: financialData?.currency || 'RON',
            rate: financialData?.exchangerate || '',
        };

        const formHTML = `
            ${noSpinnerStyle}
            <input type="hidden" id="financiar-order-id" value="${data.orderid}">

            <div class="col-span-1">
                <label class="block text-sm font-medium text-gray-500">Data Comenzii</label>
                <input type="text" value="${data.orderdate}" 
                       class="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 text-gray-600 cursor-not-allowed" readonly>
            </div>
            
            ${templates.financiarInput('financiar-total-fara-tva', 'Total Comandă (fără TVA)', data.total_no_vat, false, 'number')}
            ${templates.financiarInput('financiar-total-cu-tva', 'Total Comandă (cu TVA)', data.total_with_vat, false, 'number')}
            
            ${templates.financiarInput('financiar-cost-transport', 'Cost Transport', data.transport, false, 'number')}
            ${templates.financiarInput('financiar-reducere', 'Reducere', data.discount, false, 'number')}
            
            ${templates.financiarInput('financiar-moneda', 'Monedă', data.currency, false, 'text')}
            ${templates.financiarInput('financiar-rata-schimb', 'Rată de Schimb (opțional)', data.rate, false, 'number')}
        `;

        let palletsHTML = '';
        if (palletsData && palletsData.length > 0) {
            const productCounts = commandData.products.reduce((acc, p) => {
                const sku = p.manifestsku;
                if (sku) {
                    acc[sku] = (acc[sku] || 0) + 1;
                }
                return acc;
            }, {});

            const processedPallets = palletsData
                .filter(p => p.orderid === commandData.id) 
                .map(p => ({
                    palletId: p.manifestsku,
                    productCount: productCounts[p.manifestsku] || 0,
                    cost: parseFloat(p.costwithoutvat || 0).toFixed(2),
                }))
                .sort((a, b) => b.productCount - a.productCount); 

            const palletsRows = processedPallets.map(p => `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-2 text-sm text-gray-900 font-medium">${p.palletId || 'N/A'}</td>
                    <td class="px-4 py-2 text-sm text-gray-700">${p.productCount}</td>
                    <td class="px-4 py-2 text-sm text-gray-900 text-right font-bold">${p.cost} RON</td>
                </tr>
            `).join('');

            palletsHTML = `
                <div class="col-span-full mt-8 mb-4">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Detalii Paleți & Costuri</h3>
                    <div class="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                        <table class="min-w-full divide-y divide-gray-300">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID Palet</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nr. Produse</th>
                                    <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">COST</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-200 bg-white">
                                ${palletsRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } else if (palletsData && Array.isArray(palletsData)) {
             palletsHTML = `<div class="col-span-full mt-8 mb-4"><p class="text-sm text-gray-500 italic">Nu există date despre paleți asociate acestei comenzi în sistemul de costuri.</p></div>`;
        }

        const tableHTML = templates.financiarProductTable(commandData.products, detailsMap || {}, commandData.id, calculatedData);

        return `
            <div class="col-span-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${formHTML}
            </div>
            ${palletsHTML}
            <div class="col-span-full">
                ${tableHTML}
            </div>
        `;
    },

    financiar: (commands) => {
        const optionsHTML = commands.map(cmd => 
            `<option value="${cmd.id}">${cmd.name}</option>`
        ).join('');

        return `
        <div class="p-6 sm:p-8 h-full flex flex-col">
            <h2 class="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <span class="material-icons text-3xl text-blue-600">payments</span>
                Panou Financiar
            </h2>
            
            <div class="flex flex-col md:flex-row md:items-end gap-4 mb-6 border-b pb-6">
                <div class="flex-1 w-full md:max-w-xl">
                    <label for="financiar-command-select" class="block text-sm font-medium text-gray-700 mb-2">Selectați Comanda</label>
                    <select id="financiar-command-select" class="w-full p-2 border border-gray-300 rounded-md shadow-sm bg-white focus:ring-blue-500 focus:border-blue-500">
                        <option value="">Alegeți o comandă...</option>
                        ${optionsHTML}
                    </select>
                </div>

                <div class="flex gap-2">
                     <button id="save-financial-btn" data-action="save-financial" class="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm disabled:bg-gray-400">
                        <span class="material-icons text-sm">save</span>
                        <span>Salvează Date</span>
                    </button>
                    
                    <button id="run-calculations-btn" data-action="run-calculations" class="px-4 py-2 bg-orange-600 text-white font-bold rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 shadow-sm disabled:bg-gray-400">
                        <span class="material-icons text-sm">calculate</span>
                        <span>Rulează Calcule</span>
                    </button>

                    <button id="generate-nir-btn" data-action="generate-nir" class="px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 shadow-sm disabled:bg-gray-400 disabled:cursor-not-allowed">
                        <span class="material-icons text-sm">receipt_long</span>
                        <span>Generează NIR</span>
                    </button><button id="send-balance-btn" data-action="send-to-balance" class="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm disabled:bg-gray-400 disabled:cursor-not-allowed">
                        <span class="material-icons text-sm">account_balance</span>
                        <span>Trimite în Balanță</span>
                    </button>

                    <button id="opensales-first-btn" data-action="opensales-first" disabled class="px-4 py-2 bg-teal-600 text-white font-bold rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 shadow-sm disabled:bg-gray-400 disabled:cursor-not-allowed">
                        <span class="material-icons text-sm">upload</span>
                        <span>OpenSales (primul)</span>
                    </button>

                    <button id="opensales-all-btn" data-action="opensales-all" disabled class="px-4 py-2 bg-teal-700 text-white font-bold rounded-lg hover:bg-teal-800 transition-colors flex items-center gap-2 shadow-sm disabled:bg-gray-400 disabled:cursor-not-allowed">
                        <span class="material-icons text-sm">cloud_upload</span>
                        <span>OpenSales (toate)</span>
                    </button>
                </div>
            </div>
            
            <div id="financiar-details-container" class="p-6 bg-white rounded-lg shadow-md min-h-[400px]">
                ${templates.financiarDetails(null, null, null, null)}
            </div>
        </div>
        `;
    },

    comenzi: (commands) => {
        const commandsHTML = commands.length > 0
            ? commands.map(cmd => {
                const allProductsReady = cmd.products.length > 0 && cmd.products.every(p => p.listingReady);
                const actionText = allProductsReady ? "Anulează Marcaj Toate" : "Marchează Toate Gata";
                const iconClass = allProductsReady ? "text-yellow-600" : "text-green-600";
                const iconName = allProductsReady ? "cancel" : "task_alt";

                return `
                    <div class="bg-white p-4 rounded-lg shadow-sm hover:shadow-md transition-shadow relative">
                        <div class="cursor-pointer" data-command-id="${cmd.id}">
                            <h3 class="font-bold text-gray-800 pr-10">${cmd.name}</h3>
                            <p class="text-sm text-gray-500">${cmd.products.length} produse</p>
                        </div>

                        <div class="absolute top-2 right-2 dropdown command-options-dropdown">
                            <button class="p-2 rounded-full hover:bg-gray-200 dropdown-toggle">
                                <span class="material-icons text-gray-600">more_vert</span>
                            </button>
                            <div class="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl hidden dropdown-menu z-20 border border-gray-200">
                                <a href="#"
                                   data-action="ready-to-list-command"
                                   data-command-id="${cmd.id}"
                                   data-current-status="${allProductsReady}" class="flex items-center space-x-2 block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                                    <span class="material-icons text-base ${iconClass}">${iconName}</span>
                                    <span>${actionText}</span>
                                </a>
                            </div>
                        </div>
                    </div>`;
             }).join('')
            : `<p class="col-span-full text-gray-500">Nu există comenzi de afișat.</p>`;
        return `<div class="p-6 sm:p-8">
            <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
                <h2 class="text-3xl font-bold text-gray-800">Panou de Comenzi</h2>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${commandsHTML}</div>
        </div>`;
    },

    import: () => `<div class="p-6 sm:p-8"><h2 class="text-3xl font-bold text-gray-800 mb-6">Import Comandă Nouă</h2><div class="max-w-md bg-white p-8 rounded-lg shadow-md"><form id="upload-form"><div class="mb-5"><label for="zip-file" class="block mb-2 text-sm font-medium">Manifest (.zip):</label><input type="file" id="zip-file" name="zipFile" accept=".zip" required class="w-full text-sm border-gray-300 rounded-lg cursor-pointer bg-gray-50"></div><div class="mb-6"><label for="pdf-file" class="block mb-2 text-sm font-medium">Factura (.pdf):</label><input type="file" id="pdf-file" name="pdfFile" accept=".pdf" required class="w-full text-sm border-gray-300 rounded-lg cursor-pointer bg-gray-50"></div><p id="upload-status" class="mt-4 text-center text-sm font-medium min-h-[20px]"></p><button id="upload-button" type="submit" class="w-full mt-2 flex justify-center items-center px-4 py-3 text-lg font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300"><span class="button-text">Trimite fișierele 🚀</span><div class="button-loader hidden w-6 h-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div></button></form></div></div>`,

    paleti: (command, details) => {
        const paleti = {};
        command.products.forEach(p => {
            const sku = p.manifestsku || 'No ManifestSKU';
            if (!paleti[sku]) paleti[sku] = { products: [], allReady: true };
            paleti[sku].products.push(p);
            if (!p.listingReady) {
                paleti[sku].allReady = false;
            }
        });

        const sortedPaletiEntries = Object.entries(paleti).sort(([, palletA], [, palletB]) => {
            return (palletA.allReady === palletB.allReady) ? 0 : palletA.allReady ? 1 : -1;
        });

        const paletiHTML = sortedPaletiEntries.map(([sku, palletData]) => {
            const { products, allReady } = palletData;
            const firstProduct = products[0];
            const firstProductDetails = firstProduct ? details[firstProduct.asin] : null;
            const firstImage = (firstProductDetails?.images || []).filter(img => img)[0] || ''; 
            const readyClass = allReady ? 'bg-green-50' : 'bg-white';
            const readyIcon = allReady ? '<span class="material-icons text-green-500 absolute top-2 right-2" title="Palet Gata">task_alt</span>' : '';

            return `
            <div class="relative ${readyClass} p-4 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow w-40 flex flex-col items-center" data-manifest-sku="${sku}">
                ${readyIcon}
                <img src="${firstImage}" alt="Imagine palet" class="w-32 h-32 object-contain rounded-md bg-gray-200 mb-4">
                <h3 class="font-bold text-gray-800 text-center">${sku}</h3>
                <p class="text-sm text-gray-500">${products.length} produse</p>
            </div>`;
        }).join('');

        const noResultsHTML = paletiHTML.length === 0 ? `<p class="col-span-full text-gray-500">Nu s-au găsit produse care să corespundă căutării.</p>` : paletiHTML;

        return `
        <header class="sticky top-0 z-10 bg-white shadow-sm p-4 flex items-center space-x-4">
            <button data-action="back-to-comenzi" class="p-2 rounded-full hover:bg-gray-100"><span class="material-icons">arrow_back</span></button>
            <h1 class="text-xl font-bold text-gray-800 whitespace-nowrap">${command.name}</h1>
            <div class="relative">
                <button data-action="translate-missing-ro" data-command-id="${command.id}" class="flex items-center gap-1 px-3 py-2 text-sm font-semibold text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
                    <span class="material-icons text-base">translate</span> Tradu RO lipsă
                </button>
                <div id="translate-ro-progress" class="hidden absolute left-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-20"></div>
            </div>
            <div class="flex-1 relative">
                <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                <input id="product-search-input" type="text" placeholder="Caută după titlu sau ASIN..." class="w-full pl-10 pr-4 py-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" value="${state.currentSearchQuery}">
            </div>
        </header>
        <div class="p-6 sm:p-8"><div class="flex flex-wrap gap-4">${noResultsHTML}</div></div>`;
    },

    produse: (command, details, manifestSKU) => {
         let productsToShow = command.products.filter(p => {
             const sku = p.manifestsku || 'No ManifestSKU';
             return sku === manifestSKU;
         });

         productsToShow.sort((a, b) => (a.listingReady === b.listingReady) ? 0 : a.listingReady ? 1 : -1);

         const productsHTML = productsToShow.map(p => {
            const d = details[p.asin];
            const firstImage = (d?.images || []).filter(img => img)[0] || ''; 
            const readyClass = p.listingReady ? 'bg-green-50' : 'bg-white';
            const readyIcon = p.listingReady ? '<span class="material-icons text-green-500" title="Gata de listat">task_alt</span>' : '';

            return `<div class="flex items-center gap-4 ${readyClass} p-3 rounded-md shadow-sm cursor-pointer hover:bg-gray-50" data-product-id="${p.uniqueId}">
                        <img src="${firstImage}" class="w-16 h-16 object-cover rounded-md bg-gray-200">
                        <div class="flex-1">
                            <p class="font-semibold line-clamp-2">${d?.title || 'N/A'}</p>
                            <p class="text-sm text-gray-500">${p.asin}</p>
                        </div>
                        <div class="text-right">
                            <p class="font-bold text-lg">${p.found}/${p.expected}</p>
                        </div>
                        ${readyIcon}
                        <span class="material-icons text-gray-400">chevron_right</span>
                    </div>`;
        }).join('');

        const noResultsHTML = productsToShow.length === 0 ? `<p class="col-span-full text-gray-500">Nu s-au găsit produse care să corespundă căutării.</p>` : productsHTML;

        return `
        <header class="sticky top-0 z-10 bg-white shadow-sm p-4 flex items-center space-x-4">
            <button data-action="back-to-paleti" class="p-2 rounded-full hover:bg-gray-100"><span class="material-icons">arrow_back</span></button>
            <h1 class="text-xl font-bold text-gray-800 whitespace-nowrap">Produse din ${manifestSKU}</h1>
            <div class="flex-1 relative">
                <span class="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                <input id="product-search-input" type="text" placeholder="Caută după titlu sau ASIN..." class="w-full pl-10 pr-4 py-2 border rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition" value="${state.currentSearchQuery}">
            </div>
        </header>
        <div class="p-4 space-y-2">${noResultsHTML}</div>`;
    },

    competition: (competitionData) => {
        const competitors = competitionData?.competitors || [];
        if (competitors.length === 0) {
            return `<div class="p-8 text-center text-gray-500">Nu există date de competiție pentru acest produs.</div>`;
        }

        const cardsHTML = competitors.map(comp => {
            const labelText = comp.promoLabel || comp.dealType;
            const labelHTML = labelText
                ? `<span class="absolute top-2 left-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded">${labelText}</span>`
                : '';

            const oldPriceHTML = comp.oldPrice && comp.oldPrice !== comp.currentPrice
                ? `<p class="text-sm text-gray-500 line-through">${comp.oldPrice} RON</p>`
                : '';

            return `
                <div class="w-full max-w-xs bg-white rounded-lg shadow-md overflow-hidden flex flex-col">
                    <div class="relative w-full h-48">
                        <img src="${comp.image || ''}" alt="${comp.name}" class="w-full h-full object-contain p-2">
                        ${labelHTML}
                    </div>
                    <div class="p-4 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-center space-x-1 mb-1">
                                ${renderCompetitionStars(comp.rating)}
                                <span class="text-sm text-gray-500">${comp.reviews ? `(${comp.reviews})` : ''}</span>
                            </div>
                            <h3 class="font-semibold text-gray-800 text-sm h-20 overflow-hidden line-clamp-3">${comp.name}</h3>
                        </div>
                        <div>
                            <div class="mt-2 mb-3">
                                ${oldPriceHTML}
                                <p class="text-xl font-bold text-red-600">${comp.currentPrice ? comp.currentPrice + ' RON' : ''}</p>
                            </div>
                            <a href="${comp.url || '#'}" target="_blank" rel="noopener noreferrer"
                               class="block w-full text-center px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors">
                               Vezi Produsul
                            </a>
                        </div>
                    </div>
                </div>`;
        }).join('');

        return `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">${cardsHTML}</div>`;
    },

    produsDetaliu: (product, details, commandId) => {
        // --- FILTRARE BUTOANE TRADUCERE ---
        const otherVersions = details.other_versions || {};
        const existingLanguages = Object.keys(otherVersions).map(k => k.toLowerCase());

        const languageButtons = Object.entries(languages)
            .filter(([code, name]) => {
                return !existingLanguages.includes(name.toLowerCase());
            })
            .map(([code, name]) =>
                `<a href="#" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 language-option" data-lang-code="${code}">${code.toUpperCase()}</a>`
            ).join('');
        // -----------------------------------

        const versionsButtons = Object.keys(otherVersions).map(key => {
            const displayText = languageNameToCodeMap[key.toLowerCase()] || key.toUpperCase();
            return `<button data-version-key="${key}" class="px-4 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-md version-btn">${displayText}</button>`;
        }).join('');

        state.descriptionEditorMode = 'raw';

        const isProductReady = product.listingReady === true;
        const readyButtonText = isProductReady ? "Anulează Marcaj Gata" : "Marchează Gata";
        const readyButtonIcon = isProductReady ? "cancel" : "task_alt";
        const readyButtonBgColor = isProductReady ? "bg-yellow-500 hover:bg-yellow-600" : "bg-green-600 hover:bg-green-700";

        return `
        <header class="flex items-center justify-between h-16 px-6 border-b border-gray-200 bg-white sticky top-0 z-10">
            <div class="flex items-center space-x-4"><button data-action="back-to-produse" class="text-gray-600"><span class="material-icons">arrow_back</span></button><h2 class="text-lg font-semibold">Detalii Produs</h2></div>
            <div class="flex items-center space-x-4">
                <div class="relative group dropdown">
                    <button class="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors dropdown-toggle">
                        <span class="material-icons text-base">translate</span>
                        <span class="text-sm">Traduceți</span>
                        <span class="material-icons text-base">expand_more</span>
                    </button>
                    <div class="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl hidden dropdown-menu z-20 border border-gray-200">
                        <input type="text" id="language-search" placeholder="Caută o limbă..." class="w-full px-4 py-2 border-b border-gray-200 focus:outline-none">
                        <div id="language-list" class="max-h-60 overflow-y-auto">
                            ${languageButtons}
                        </div>
                    </div>
                </div>

                <button data-action="ready-to-list-single"
                        data-asin="${product.asin}"
                        data-order-id="${commandId}"
                        data-pallet-sku="${product.manifestsku}"
                        data-current-status="${isProductReady}" class="px-4 py-2 ${readyButtonBgColor} text-white rounded-lg font-semibold text-sm flex items-center space-x-2 transition-colors">
                    <span class="material-icons text-base">${readyButtonIcon}</span>
                    <span>${readyButtonText}</span>
                </button>

                <button data-action="save-product" class="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">Salvează Modificările</button>
            </div>
        </header>
        <div class="p-6 lg:p-8 flex-1">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div class="lg:col-span-1 space-y-6">
                    <div id="image-gallery-container" class="bg-white p-4 rounded-xl shadow-sm"></div>
                    <div class="bg-white p-4 rounded-xl shadow-sm space-y-4">
                        <div>
                            <label for="product-asin" class="text-sm font-medium text-gray-500">ASIN</label>
                            <div class="flex items-center space-x-2">
                                <input id="product-asin" class="mt-1 block w-full bg-gray-100 p-2 border-0 rounded-md text-gray-700" type="text" value="${product.asin}" readonly>
                                <button data-action="edit-asin" 
                                        data-productsku="${product.id}" 
                                        data-old-asin="${product.asin}"
                                        data-order-id="${commandId}"
                                        data-manifest-sku="${product.manifestsku || ''}"
                                        class="mt-1 px-3 py-1 text-xs font-semibold text-blue-600 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors">
                                    Editează
                                </button>
                            </div>
                        </div>
                        </div>
                </div>

                <div class="lg:col-span-2 bg-white rounded-xl shadow-sm">
                     <div class="flex items-center justify-between p-4 border-b border-gray-200"><div id="version-selector" class="flex space-x-1 border rounded-lg p-1"><button data-version-key="origin" class="px-4 py-1.5 text-sm font-semibold rounded-md bg-blue-600 text-white version-btn">Origin</button>${versionsButtons}</div></div>
                     <div class="p-6 space-y-6">
                        <div class="flex items-center space-x-2">
                            <div class="flex-1">
                                <label for="product-title" class="text-sm font-medium text-gray-500">Titlu</label>
                                <input id="product-title" class="mt-1 block w-full text-xl font-semibold bg-transparent p-0 border-0 border-b-2" type="text" value="${details.title || ''}">
                            </div>
                            <button id="refresh-title-btn" data-action="refresh-ro-title" class="hidden mt-6 p-2 text-blue-600 hover:bg-blue-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <span class="material-icons refresh-icon">refresh</span>
                                <div class="refresh-spinner hidden w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                        
                        <div class="flex items-start space-x-2">
                            <div class="flex-1">
                                <div class="flex justify-between items-center mb-1">
                                    <label for="product-description-raw" class="text-sm font-medium text-gray-500">Descriere</label>
                                    <div class="flex items-center space-x-1 rounded-lg p-1 border">
                                        <button data-action="toggle-description-mode" data-mode="raw" class="desc-mode-btn bg-blue-600 text-white rounded-md p-1.5">
                                            <span class="material-icons text-base">code</span>
                                        </button>
                                        <button data-action="toggle-description-mode" data-mode="preview" class="desc-mode-btn hover:bg-gray-100 rounded-md p-1.5">
                                            <span class="material-icons text-base">visibility</span>
                                        </button>
                                    </div>
                                </div>
                                <textarea id="product-description-raw" rows="12" class="mt-1 block w-full bg-gray-50 border rounded-lg p-3 font-mono">${details.description || ''}</textarea>
                                <div id="product-description-preview" contenteditable="true" class="prose prose-sm max-w-none hidden mt-1 block w-full h-[278px] overflow-y-auto bg-gray-50 border rounded-lg p-3"></div>
                            </div>
                            <button id="refresh-description-btn" data-action="refresh-ro-description" class="hidden mt-6 p-2 text-blue-600 hover:bg-blue-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <span class="material-icons refresh-icon">refresh</span>
                                <div class="refresh-spinner hidden w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            </button>
                        </div>
                        
                    </div>
                </div>

                <div class="lg:col-span-3 mt-8">
                    <h2 class="text-2xl font-bold text-gray-800 mb-4">Competiție</h2>
                    <div id="competition-container">
                        <div class="p-8 text-center text-gray-500">Se încarcă...</div>
                    </div>
                </div>

                <div class="lg:col-span-3 mt-6">
                    <div class="bg-white rounded-xl shadow-sm p-6">
                        <div class="flex items-center justify-between mb-5">
                            <h2 class="text-2xl font-bold text-gray-800">Categorii & Caracteristici</h2>
                            <button data-action="ai-fill-attributes" class="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors text-sm">
                                <span class="material-icons text-base">auto_fix_high</span>
                                Completare AI
                            </button>
                        </div>

                        <div class="grid grid-cols-2 gap-6 mb-5 pb-5 border-b border-gray-200">
                            <div>
                                <label class="text-sm font-medium text-gray-500">Brand</label>
                                <input id="product-brand" class="mt-1 block w-full bg-transparent p-0 border-0 border-b-2" type="text" value="${details.brand || ''}">
                            </div>
                            <div>
                                <label class="text-sm font-medium text-gray-500">Preț estimat</label>
                                <input id="product-price" class="mt-1 block w-full bg-transparent p-0 border-0 border-b-2" type="text" value="${details.price || ''}">
                            </div>
                        </div>

                        ${renderMappingLegend()}
                        <div id="attributes-mapping-area" class="relative overflow-y-auto border border-gray-100 rounded" style="max-height:70vh;min-height:160px;">
                            <div id="mapping-inner" class="relative">
                                <div id="marketplace-grid" class="grid relative" style="grid-template-columns: repeat(${MARKETPLACES.length}, minmax(0, 1fr)); z-index:0;">
                                    ${MARKETPLACES.map((mp, idx) => renderMarketplaceColumn(mp, idx)).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }
};
