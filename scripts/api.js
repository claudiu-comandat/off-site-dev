// scripts/api.js
import {
    N8N_UPLOAD_WEBHOOK_URL,
    READY_TO_LIST_WEBHOOK_URL,
    ASIN_UPDATE_WEBHOOK_URL,
    SAVE_FINANCIAL_WEBHOOK_URL,
    GENERATE_NIR_WEBHOOK_URL,
    INSERT_BALANCE_WEBHOOK_URL,
    GET_PRODUCT_ATTRIBUTES_URL,
    OPENSALES_PREVIEW_URL
} from './constants.js';
import { fetchDataAndSyncState, AppState, fetchProductDetailsInBulk } from './data.js';
import { state } from './state.js';

/**
 * Funcție helper pentru eliminarea diacriticelor.
 */
function removeDiacritics(str) {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Trimite Date către Balanță (Postgres via n8n) - UPDATE: VALORI CU TVA
 */
export async function sendToBalance(commandId, buttonElement) {
    const originalHTML = buttonElement.innerHTML;
    buttonElement.disabled = true;
    buttonElement.innerHTML = '<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>';

    try {
        // 1. Verificări și Date
        if (!state.financialCalculations || !state.financialCalculations[commandId]) {
            throw new Error("Nu există calcule financiare. Rulați 'Rulează Calcule' mai întâi.");
        }

        const command = AppState.getCommands().find(c => c.id === commandId);
        if (!command) throw new Error('Comanda nu a fost găsită.');

        const asins = command.products.map(p => p.asin);
        const detailsMap = await fetchProductDetailsInBulk(asins);
        const financials = state.financialCalculations[commandId];

        // 2. Construim Payload-ul
        const itemsPayload = [];

        const titleErrors = [];
        command.products.forEach(p => {
            const calcData = financials[p.uniqueId];
            if (!calcData || calcData.totalCost <= 0.01) return;
            const t = (detailsMap[p.asin]?.other_versions?.['Romanian']?.title || '').trim();
            if (!t || t === 'N/A' || t.length < 10) titleErrors.push(p.asin);
        });
        if (titleErrors.length > 0) {
            alert(`Nu se poate trimite în Balanță!\nUrmătoarele produse nu au titlu RO valid:\n\n${titleErrors.join('\n')}`);
            return;
        }

        command.products.forEach(p => {
            const calcData = financials[p.uniqueId];
            if (!calcData || calcData.totalCost <= 0.01) return;

            const unitCost = calcData.unitCost;
            const details = detailsMap[p.asin] || {};

            const rawTitle = (details.other_versions?.['Romanian']?.title || '').trim();
            const roTitle = removeDiacritics(rawTitle);

            // Definim sufixele
            const conditions = [
                { qty: p.bncondition, codeSuffix: "CN", nameSuffix: " - CN" },
                { qty: p.vgcondition, codeSuffix: "FB", nameSuffix: " - FB" },
                { qty: p.gcondition,  codeSuffix: "B",  nameSuffix: " - B" }
            ];

            conditions.forEach(cond => {
                if (cond.qty > 0) {
                    // Calculăm valorile CU TVA (1.21)
                    const unitCostWithTva = unitCost * 1.21;
                    const valoareTotalaWithTva = cond.qty * unitCostWithTva;
                    
                    itemsPayload.push({
                        product_code: p.asin + cond.codeSuffix,
                        product_name: roTitle + cond.nameSuffix,
                        um: "buc", 
                        quantity: cond.qty,
                        unit_price: Number(unitCostWithTva.toFixed(4)), 
                        total_value: Number(valoareTotalaWithTva.toFixed(2)) 
                    });
                }
            });
        });

        if (itemsPayload.length === 0) {
            throw new Error("Nu există date valide de trimis.");
        }

        // Calculăm data (1 a lunii trecute, ca la NIR)
        const now = new Date();
        const prevMonthFirstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        
        // FIX: Construim manual data YYYY-MM-DD folosind ora locală
        // toISOString() convertește la UTC și poate da ziua precedentă din cauza fusului orar
        const year = prevMonthFirstDay.getFullYear();
        const month = String(prevMonthFirstDay.getMonth() + 1).padStart(2, '0');
        const day = String(prevMonthFirstDay.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        const payload = {
            action: "insert_nir",
            orderId: command.id,
            movementDate: dateString,
            items: itemsPayload
        };

        console.log("Trimitere către Balanță:", payload);

        // 3. Trimite către Webhook
        const response = await fetch(INSERT_BALANCE_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Eroare server: ${response.status}`);
        }

        const resData = await response.json();
        alert("Datele au fost trimise cu succes în Balanță!");

    } catch (error) {
        console.error('Eroare trimitere balanță:', error);
        alert(`Eroare: ${error.message}`);
    } finally {
        buttonElement.disabled = false;
        buttonElement.innerHTML = originalHTML;
    }
}

/**
 * Trimite starea "Gata de listat" pentru un produs sau o comandă întreagă.
 */
export async function sendReadyToList(payload, buttonElement) {
    if (!payload) {
        alert('Nu există date de trimis.');
        return false;
    }

    let originalHTML = '';
    let targetElement = buttonElement;

    if (buttonElement && buttonElement.tagName === 'A') {
        targetElement = buttonElement.querySelector('span:last-child');
    }

    if (targetElement) {
        originalHTML = targetElement.innerHTML;
        if (buttonElement) buttonElement.style.pointerEvents = 'none';
        targetElement.innerHTML = '<div class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto"></div>';
    }

    try {
        console.log("Sending payload to ready-to-list webhook:", payload);
        const response = await fetch(READY_TO_LIST_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
             const errorText = await response.text();
             console.error("Webhook Error Response:", errorText);
             throw new Error(`Eroare HTTP: ${response.status}. ${errorText}`);
        }

        await response.json();
        await fetchDataAndSyncState(); 
        return true;

    } catch (error) {
        console.error('Eroare la trimiterea "Marchează/Anulează Marcaj Gata":', error);
        alert(`A apărut o eroare: ${error.message}`);
         if (targetElement) targetElement.innerHTML = originalHTML; 
        return false;
    } finally {
         if (buttonElement) buttonElement.style.pointerEvents = 'auto'; 
    }
}

/**
 * Gestionează submiterea formularului de upload.
 */
export async function handleUploadSubmit(event) {
    event.preventDefault();
    const uploadBtn = document.getElementById('upload-button');
    const btnText = uploadBtn.querySelector('.button-text');
    const btnLoader = uploadBtn.querySelector('.button-loader');
    const statusEl = document.getElementById('upload-status');
    const formData = new FormData(event.target);

    if (!formData.get('zipFile')?.size || !formData.get('pdfFile')?.size) { 
        statusEl.textContent = 'Selectează ambele fișiere.'; 
        statusEl.className = 'text-red-600'; 
        return false; 
    }
    
    uploadBtn.disabled = true; 
    btnText.classList.add('hidden'); 
    btnLoader.classList.remove('hidden'); 
    statusEl.textContent = 'Se trimit fișierele...'; 
    statusEl.className = '';
    
    try {
        const response = await fetch(N8N_UPLOAD_WEBHOOK_URL, { method: 'POST', body: formData });
        if (!response.ok) throw new Error(`Eroare HTTP: ${response.status}`);
        
        const resData = await response.json();
        if (resData.status === 'success') { 
            statusEl.textContent = 'Comanda a fost importată!'; 
            statusEl.className = 'text-green-600'; 
            event.target.reset(); 
            return true; 
        } else {
            throw new Error('Eroare server.');
        }
    } catch (error) { 
        statusEl.textContent = 'A apărut o eroare.'; 
        statusEl.className = 'text-red-600'; 
        return false; 
    } finally { 
        uploadBtn.disabled = false; 
        btnText.classList.remove('hidden'); 
        btnLoader.classList.add('hidden'); 
    }
}

/**
 * Gestionează actualizarea ASIN-ului.
 */
export async function handleAsinUpdate(actionButton) {
    const productsku = actionButton.dataset.productsku;
    const oldAsin = actionButton.dataset.oldAsin;
    const orderId = actionButton.dataset.orderId;
    const manifestSku = actionButton.dataset.manifestSku;

    const newAsin = prompt("Introduceți noul ASIN:", oldAsin);

    if (!newAsin || newAsin.trim() === '' || newAsin.trim() === oldAsin) {
        return false;
    }

    const confirmation = confirm("Atenție!\n\nSchimbarea ASIN-ului va reîncărca datele acestui produs și poate modifica titlul, pozele sau descrierea. Datele nesalvate se vor pierde.\n\nSigur doriți să continuați?");

    if (!confirmation) {
        return false;
    }

    const payload = {
        productsku: productsku,
        asin_vechi: oldAsin,
        asin_nou: newAsin.trim(),
        orderId: orderId,
        manifestsku: manifestSku
    };

    try {
        const response = await fetch(ASIN_UPDATE_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Eroare HTTP: ${response.status}`);
        }

        const result = await response.json();
        if (result.status === 'success') {
            alert("ASIN-ul a fost actualizat cu succes! Se reîncarcă datele...");
            await fetchDataAndSyncState(); 
            return true; 
        } else {
            alert(`Eroare la actualizare: ${result.message || 'Răspuns invalid de la server.'}`);
            return false;
        }
    } catch (error) {
        console.error('Eroare la actualizarea ASIN-ului:', error);
        alert(`A apărut o eroare de rețea: ${error.message}`);
        return false;
    }
}

// --- Salvare Date Financiare ---
export async function saveFinancialDetails(payload, buttonElement) {
    // Salvăm starea inițială
    const originalHTML = buttonElement.innerHTML;
    const originalClasses = buttonElement.className; // Salvăm clasele pentru a reveni la culoarea albastră
    
    // 1. STARE LOADING
    buttonElement.disabled = true;
    buttonElement.innerHTML = '<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>';

    try {
        const response = await fetch(SAVE_FINANCIAL_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Eroare HTTP: ${response.status}. ${errorText}`);
        }

        // Actualizare cache local (AppState)
        const currentData = AppState.getFinancialData();
        let found = false;
        const updatedData = currentData.map(item => {
            if (item.orderid === payload.orderid) {
                found = true;
                return { ...item, ...payload };
            }
            return item;
        });

        if (!found) {
            updatedData.push(payload);
        }
        
        AppState.setFinancialData(updatedData);

        // 2. STARE SUCCES (Verde + Bifa)
        // Eliminăm clasele de albastru și adăugăm verde
        buttonElement.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        buttonElement.classList.add('bg-green-600', 'hover:bg-green-700'); // Asigură-te că ai aceste clase în Tailwind sau CSS, de obicei există
        
        buttonElement.innerHTML = `
            <div class="flex items-center justify-center gap-2">
                <span class="material-icons text-white">check_circle</span>
                <span>Salvat!</span>
            </div>
        `;

        // Așteptăm 2 secunde
        await new Promise(resolve => setTimeout(resolve, 2000));

        return true;

    } catch (error) {
        console.error('Eroare la salvarea datelor financiare:', error);
        alert(`Eroare la salvare: ${error.message}`);
        return false;
    } finally {
        // 3. REVENIRE LA STAREA INIȚIALĂ
        // Indiferent dacă a fost eroare sau succes (după timeout), revenim la forma inițială
        buttonElement.className = originalClasses; // Restaurăm clasele originale (albastru)
        buttonElement.innerHTML = originalHTML;    // Restaurăm textul/iconița originale
        buttonElement.disabled = false;
    }
}

// --- Generare NIR (PDF in Browser) - Layout Final ---
export async function generateNIR(commandId, buttonElement) {
    const originalHTML = buttonElement.innerHTML;
    buttonElement.disabled = true;
    buttonElement.innerHTML = '<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>';

    try {
        // 1. Verificări preliminare
        if (!state.financialCalculations || !state.financialCalculations[commandId]) {
            throw new Error("Nu există calcule financiare pentru această comandă. Vă rugăm rulați 'Rulează Calcule' în tab-ul Financiar înainte de a genera NIR-ul.");
        }

        const command = AppState.getCommands().find(c => c.id === commandId);
        if (!command) throw new Error('Comanda nu a fost găsită.');

        // --- LOGICA PENTRU NUMAR NIR ---
        const allFinancials = AppState.getFinancialData();
        
        // Căutăm datele financiare pentru comanda curentă
        let currentFinancials = allFinancials.find(f => f.orderid === commandId) || {};
        
        // Verificăm dacă avem deja un număr
        let nirNumber = currentFinancials.nirnumber; 

        if (!nirNumber) {
            // Dacă nu avem număr, calculăm următorul
            const maxUsedNir = allFinancials.reduce((max, item) => {
                const val = parseInt(item.nirnumber || 0);
                return val > max ? val : max;
            }, 9); // Pornim de la 9, astfel încât primul număr generat să fie 10

            nirNumber = maxUsedNir + 1;

            // PREGĂTIM SALVAREA AUTOMATĂ
            const payloadToSave = {
                orderid: commandId,
                totalordercostwithoutvat: document.getElementById('financiar-total-fara-tva')?.value || currentFinancials.totalordercostwithoutvat || 0,
                totalordercostwithvat: document.getElementById('financiar-total-cu-tva')?.value || currentFinancials.totalordercostwithvat || 0,
                transportcost: document.getElementById('financiar-cost-transport')?.value || currentFinancials.transportcost || 0,
                discount: document.getElementById('financiar-reducere')?.value || currentFinancials.discount || 0,
                currency: document.getElementById('financiar-moneda')?.value || currentFinancials.currency || 'RON',
                exchangerate: document.getElementById('financiar-rata-schimb')?.value || currentFinancials.exchangerate || 1,
                nirnumber: nirNumber
            };

            console.log(`Se salvează NIR nou: ${nirNumber} pentru comanda ${commandId}`);
            
            // Salvăm în baza de date
            const saveSuccess = await saveFinancialDetails(payloadToSave, buttonElement);
            
            if (!saveSuccess) {
                throw new Error("Nu s-a putut salva numărul NIR în baza de date. Generarea a fost anulată.");
            }
        }

        const asins = command.products.map(p => p.asin);
        const detailsMap = await fetchProductDetailsInBulk(asins);
        
        const financials = state.financialCalculations[commandId];
        const rows = [];
        let grandTotalValoare = 0;
        let grandTotalTVA = 0;

        // 2. Construire Date Tabel
        const nirTitleErrors = [];
        command.products.forEach(p => {
            const calcData = financials[p.uniqueId];
            if (!calcData || calcData.totalCost <= 0.01) return;
            const t = (detailsMap[p.asin]?.other_versions?.['Romanian']?.title || '').trim();
            if (!t || t === 'N/A' || t.length < 10) nirTitleErrors.push(p.asin);
        });
        if (nirTitleErrors.length > 0) {
            alert(`Nu se poate genera NIR!\nUrmătoarele produse nu au titlu RO valid:\n\n${nirTitleErrors.join('\n')}`);
            return;
        }

        command.products.forEach(p => {
            const calcData = financials[p.uniqueId];
            if (!calcData || calcData.totalCost <= 0.01) return;

            const unitCost = calcData.unitCost;
            const details = detailsMap[p.asin] || {};
            const rawTitle = (details.other_versions?.['Romanian']?.title || '').trim();
            const roTitle = (rawTitle).normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Fără diacritice

            const conditions = [
                { qty: p.bncondition, codeSuffix: "CN" }, 
                { qty: p.vgcondition, codeSuffix: "FB" }, 
                { qty: p.gcondition,  codeSuffix: "B" }   
            ];

            conditions.forEach(cond => {
                if (cond.qty > 0) {
                    const valoare = cond.qty * unitCost;
                    const tva = valoare * 0.21; 

                    grandTotalValoare += valoare;
                    grandTotalTVA += tva;

                    rows.push([
                        p.asin + cond.codeSuffix,   
                        roTitle,                    
                        "buc",                      
                        cond.qty,                   
                        unitCost.toFixed(2),        
                        valoare.toFixed(2),         
                        tva.toFixed(2)              
                    ]);
                }
            });
        });

        if (rows.length === 0) {
            throw new Error("Nu există produse valide recepționate (cu cost > 0) pentru a genera NIR.");
        }

        // 3. Generare PDF cu jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

        doc.setFont("helvetica", "normal");
        const textColor = 20;

        // Header
        doc.setFontSize(10);
        doc.setTextColor(textColor);
        doc.text("T&G SHOP AND BUSINESS S.R.L.", 14, 15);
        
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        
        // --- MODIFICARE 1: Titlu fără (NIR: 10) ---
        doc.text("NOTA DE RECEPTIE SI CONSTATARE DE DIFERENTE", 105, 25, { align: "center" });
        
        doc.setDrawColor(textColor);
        doc.line(14, 27, 196, 27); 

        // Calcul Data (1 a lunii trecute)
        const now = new Date();
        const prevMonthFirstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const nirDate = prevMonthFirstDay.toLocaleDateString('ro-RO');

        // Info Comandă
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        
        const infoY = 35;
        const lineHeight = 5;
        
        doc.text(`Numar Factura: ${command.id}`, 14, infoY);
        
        // --- MODIFICARE 2: Etichete schimbate ---
        doc.text(`Data Crearii: ${nirDate}`, 14, infoY + lineHeight);
        doc.text(`Numar Document: ${nirNumber}`, 14, infoY + lineHeight * 2);
        
        doc.text(`Gestiune: Principal`, 14, infoY + lineHeight * 3);
        
        const rightColX = 120;
        doc.text(`Furnizor: JLI Trading Limited`, rightColX, infoY);
        doc.text(`Cod Fiscal: PL5263222338`, rightColX, infoY + lineHeight);

        // Tabel Produse
        doc.autoTable({
            startY: 60,
            head: [['Cod Articol', 'Denumire', 'U.M.', 'Cant', 'Pret Unitar', 'Valoare', 'TVA (21%)']],
            body: rows,
            theme: 'grid', 
            styles: { 
                font: "helvetica", 
                fontSize: 9, 
                cellPadding: 3,
                textColor: [20, 20, 20], 
                overflow: 'linebreak', 
                halign: 'center', 
                valign: 'middle'
            },
            headStyles: { 
                fillColor: [230, 230, 230], 
                textColor: 0, 
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { cellWidth: 35 }, 
                1: { cellWidth: 'auto' }, 
                2: { cellWidth: 12 }, 
                3: { cellWidth: 15 }, 
                4: { cellWidth: 22 }, 
                5: { cellWidth: 22 }, 
                6: { cellWidth: 22 }  
            },
            footStyles: {
                 halign: 'center',
                 textColor: [20, 20, 20],
                 fontStyle: 'bold'
            },
            foot: [[
                { content: 'TOTAL:', colSpan: 5, styles: { halign: 'right' } },
                { content: grandTotalValoare.toFixed(2) },
                { content: grandTotalTVA.toFixed(2) }
            ]],
        });

        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        const totalGeneral = grandTotalValoare + grandTotalTVA;
        doc.text(`TOTAL GENERAL (Valoare + TVA): ${totalGeneral.toFixed(2)} RON`, 196, finalY, { align: "right" });

        const footerY = finalY + 25;
        doc.setDrawColor(150);
        doc.line(14, footerY, 196, footerY); 
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(textColor);
        
        const footerLineHeight = 12;
        
        const leftBlockX = 20;
        doc.text("Comisia de receptie", leftBlockX, footerY + 10);
        doc.text("Nume si Prenume: _______________________", leftBlockX, footerY + 10 + footerLineHeight);
        doc.text("Semnatura: _______________________", leftBlockX, footerY + 10 + footerLineHeight * 2);
        
        const rightBlockX = 120;
        doc.text("Primit in gestiune", rightBlockX, footerY + 10);
        doc.text("Semnatura: _______________________", rightBlockX, footerY + 10 + footerLineHeight * 2);

        // --- MODIFICARE 3: Nume fișier actualizat ---
        doc.save(`NIR ${nirNumber} - ${nirDate}.pdf`);

    } catch (error) {
        console.error('Eroare la generarea NIR:', error);
        alert(`Eroare: ${error.message}`);
    } finally {
        buttonElement.disabled = false;
        buttonElement.innerHTML = originalHTML;
    }
}

// ============================================================================
//  OPENSALES — Request DRY-RUN către POST /import/products/preview
// ============================================================================
// Asamblăm DOAR formatul OpenSales de input (secțiunea 2 din spec). NU calculăm
// payload-urile per-marketplace (eMAG/Trendyol/Temu) — alea le face serverul și
// ni le întoarce. NU trimitem câmpurile hardcodate de server (secțiunea 3).
//
// STADIU CURENT (v2): construim ofertele eMAG (emag-ro/bg/hu) + o ofertă Temu cu
// variations ([{ specId, specName, parentSpecId }]) și caracteristici. Pentru eMAG
// avem tot (categorie, brand, caracteristici [{id,value}]). Pentru Temu trimitem ce
// avem și lăsăm dry-run-ul să raporteze ce mai lipsește (refPid/vid/costTemplateId).
// Trendyol rămâne de adăugat după ce aducem ID-urile din backend (attributeValueId,
// brandId Trendyol).

// Tab-urile traduse sunt cheiate pe numele limbii în minuscule în other_versions
// (vezi other_versions['romanian'] folosit la NIR/balanță). eMAG RO/BG/HU împart
// aceeași categorie + caracteristici; diferă doar titlu/descriere/imagini per tab.
const EMAG_OFFER_TABS = [
    { marketplace: 'emag-ro', tab: 'romanian' },
    { marketplace: 'emag-bg', tab: 'bulgarian' },
    { marketplace: 'emag-hu', tab: 'hungarian' }
];

function osCleanImages(images) {
    return [...new Set((images || []).filter(Boolean))].map(url => ({ url }));
}

// Atributele dintr-un bloc listing_data[platform].attributes -> [{ id:number, value:string }].
// Valoarea poate fi string ("Negru", vechi) sau obiect { value_name, value_id } (din DB,
// după enrichment SQL). Folosim DOAR numele (value_name). Sărim cheile ne-numerice
// (ex: __categoryId). Eliminăm valorile goale.
function osCharacteristics(attrs) {
    return Object.entries(attrs || {})
        .filter(([id]) => /^\d+$/.test(id))
        .map(([id, raw]) => {
            const valueName = (raw && typeof raw === 'object') ? raw.value_name : raw;
            return { id: Number(id), value: valueName == null ? '' : String(valueName) };
        })
        .filter(c => c.value.trim() !== '');
}

// variations[platform] vine ca array (ex: Temu = [{ specId, specName, parentSpecId }]).
// Acceptăm și forma veche singular (variation:{...}) pentru robustețe.
function osVariations(platformBlock) {
    if (!platformBlock) return [];
    if (Array.isArray(platformBlock.variations)) return platformBlock.variations;
    if (platformBlock.variation) return [platformBlock.variation];
    return [];
}

/**
 * Asamblează body-ul OpenSales pentru UN produs (secțiunea 2 + 11 din spec).
 * @param {object} args
 * @param {object} args.product   - item din command.products (asin, bncondition, barcode...)
 * @param {object} args.details   - detaliile din fetchProductDetailsInBulk[asin]
 * @param {object} args.listingData - listing_data din v2-get-product-attributes (per platformă)
 * @param {number} args.vatRate   - 0 sau 21
 * @returns {{ products: object[] }}
 */
export function buildOpenSalesPreviewRequest({ product, details, listingData, vatRate = 21 }) {
    const d = details || {};
    const ld = listingData || {};
    const ro = d.other_versions?.['romanian'] || {};

    // --- caracteristici eMAG -> [{ id:number, value:string }]
    const emagAttrs = ld.emag?.attributes || {};
    const emagCategory = ld.emag?.categoryId ?? null;
    const characteristics = osCharacteristics(emagAttrs);

    const offers = EMAG_OFFER_TABS.map(({ marketplace, tab }) => {
        const v = d.other_versions?.[tab] || {};
        const offer = { marketplace };
        if (emagCategory != null) offer.category = emagCategory;
        if (d.brand) offer.brand = d.brand;
        if (characteristics.length) offer.characteristics = characteristics;
        // Override generic per țară: doar dacă tab-ul există (altfel serverul cade pe produs).
        if (v.title) offer.title = v.title;
        if (v.description) offer.description = v.description;
        const imgs = osCleanImages(v.images);
        if (imgs.length) offer.images = imgs;
        return offer;
    });

    // --- Temu: ofertă separată cu variations (ex: [{ specId, specName, parentSpecId }]).
    // Trimitem ce avem (categorie + caracteristici + variations). Titlu/descriere/imagini
    // le omitem intenționat → serverul cade pe câmpurile de la nivel de produs. Dry-run-ul
    // raportează câmpurile Temu încă lipsă (refPid/vid/costTemplateId etc.).
    const temuCategory = ld.temu?.categoryId ?? null;
    const temuVariations = osVariations(ld.temu);
    if (temuCategory != null || temuVariations.length) {
        const temuOffer = { marketplace: 'temu' };
        if (temuCategory != null) temuOffer.category = temuCategory;
        if (d.brand) temuOffer.brand = d.brand;
        const temuChars = osCharacteristics(ld.temu?.attributes);
        if (temuChars.length) temuOffer.characteristics = temuChars;
        if (temuVariations.length) temuOffer.variations = temuVariations;
        offers.push(temuOffer);
    }

    const priceMinor = Math.round((parseFloat(d.price) || 0) * 100);

    const productObj = {
        sku: `${product.asin}CN`,            // ASIN + "CN" (condiție bncondition)
        title: (ro.title || d.title || '').trim(),
        price: priceMinor,                    // minor units (RON)
        stock: Number(product.bncondition) || 0,
        currency: 'RON',
        vatRate
    };

    const description = ro.description || d.description;
    if (description) productObj.description = description;

    const images = osCleanImages(ro.images?.length ? ro.images : d.images);
    if (images.length) productObj.images = images;

    const ean = d.ean || product.barcode;
    if (ean) productObj.ean = String(ean);
    if (d.brand) productObj.brand = d.brand;

    productObj.offers = offers;

    return { products: [productObj] };
}

// Pop-up cu JSON formatat (răspunsul exact de la /preview, plus request-ul trimis
// într-o secțiune colapsabilă pentru debugging). Folosește textContent — fără risc XSS.
function showOpenSalesModal({ status, response, requestBody }) {
    document.getElementById('opensales-modal')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'opensales-modal';
    overlay.className = 'fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4';

    const statusOk = status >= 200 && status < 300;
    const statusBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold ${statusOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">HTTP ${status}</span>`;

    const pretty = (val) => (typeof val === 'string' ? val : JSON.stringify(val, null, 2));

    overlay.innerHTML = `
        <div class="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div class="flex items-center justify-between px-5 py-3 border-b">
                <h3 class="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <span class="material-icons text-teal-600">science</span>
                    Răspuns OpenSales (dry-run) ${statusBadge}
                </h3>
                <button data-os-close class="p-1 rounded-full hover:bg-gray-200">
                    <span class="material-icons text-gray-600">close</span>
                </button>
            </div>
            <div class="p-5 overflow-auto">
                <pre class="text-xs bg-gray-900 text-gray-100 rounded p-4 overflow-auto whitespace-pre-wrap break-words" data-os-response></pre>
                <details class="mt-4">
                    <summary class="text-sm text-gray-500 cursor-pointer select-none">Request trimis</summary>
                    <pre class="text-xs bg-gray-100 text-gray-700 rounded p-4 mt-2 overflow-auto whitespace-pre-wrap break-words" data-os-request></pre>
                </details>
            </div>
        </div>`;

    // textContent ca să nu interpretăm HTML din răspuns
    overlay.querySelector('[data-os-response]').textContent = pretty(response);
    overlay.querySelector('[data-os-request]').textContent = pretty(requestBody);

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('[data-os-close]')) close();
    });
    document.addEventListener('keydown', function onEsc(e) {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });

    document.body.appendChild(overlay);
}

/**
 * Generează requestul DRY-RUN pentru PRIMUL produs din comanda selectată, îl trimite
 * la OpenSales /preview și afișează răspunsul exact într-un pop-up.
 */
export async function sendOpenSalesPreview(commandId, buttonElement) {
    const originalHTML = buttonElement.innerHTML;

    const command = AppState.getCommands().find(c => c.id === commandId);
    if (!command || !command.products?.length) {
        alert('Comanda nu are produse.');
        return;
    }
    const product = command.products[0]; // primul produs din listă

    // API key cerut la click și trimis ca Bearer (nu se persistă).
    const apiKey = prompt('Introduceți API key OpenSales:');
    if (!apiKey || !apiKey.trim()) return;

    buttonElement.disabled = true;
    buttonElement.innerHTML = '<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>';

    try {
        const detailsMap = await fetchProductDetailsInBulk([product.asin]);
        const details = detailsMap[product.asin] || {};

        // Mapările per-marketplace (categorie + caracteristici) nu sunt în detaliile
        // de bază — le luăm separat din v2-get-product-attributes.
        let listingData = {};
        try {
            const res = await fetch(GET_PRODUCT_ATTRIBUTES_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asin: product.asin })
            });
            if (res.ok) {
                const raw = await res.json();
                // Răspunsul vine ca array din n8n: [{ get_product_attributes_v2: { listing_data } }].
                // Acceptăm și forma obiect / directă pentru robustețe.
                const root = Array.isArray(raw) ? (raw[0] || {}) : (raw || {});
                listingData = (root.get_product_attributes_v2 || root)?.listing_data || {};
            }
        } catch (e) {
            console.warn('Nu s-au putut încărca atributele de listare:', e);
        }

        const requestBody = buildOpenSalesPreviewRequest({ product, details, listingData });

        const response = await fetch(OPENSALES_PREVIEW_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify(requestBody)
        });

        const text = await response.text();
        let parsed;
        try { parsed = JSON.parse(text); } catch { parsed = text; }

        showOpenSalesModal({ status: response.status, response: parsed, requestBody });
    } catch (error) {
        console.error('Eroare OpenSales preview:', error);
        // Afișăm tot în modal ca userul să vadă inclusiv erorile de rețea/CORS.
        showOpenSalesModal({
            status: 0,
            response: `Eroare la trimitere: ${error.message}\n\n(Dacă e o eroare CORS, serverul OpenSales trebuie să permită originea acestei aplicații.)`,
            requestBody: '—'
        });
    } finally {
        buttonElement.disabled = false;
        buttonElement.innerHTML = originalHTML;
    }
}
