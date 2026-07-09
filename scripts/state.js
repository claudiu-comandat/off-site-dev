// scripts/state.js

export const state = {
    currentCommandId: null,
    currentManifestSKU: null,
    currentProductId: null,
    editedProductData: {},
    activeVersionKey: 'origin',
    descriptionEditorMode: 'raw',
    sortableInstance: null,
    competitionDataCache: null,
    productScrollPosition: 0,
    currentSearchQuery: '',
    currentView: 'comenzi',
    previousView: null,
    searchTimeout: null,
    financialCalculations: {},
    // Incrementat de renderView() la fiecare navigare. Funcțiile async care mai au
    // treabă după un `await` (loadProductAttributesFromDB, fetchAndRenderCompetition,
    // fetchAndRenderAttributes) compară tokenul lor cu acesta ca să abandoneze dacă
    // între timp s-a deschis alt produs/view.
    renderToken: 0
};
