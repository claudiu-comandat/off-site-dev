// scripts/utils.js

export function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) { matrix[0][i] = i; }
    for (let j = 0; j <= b.length; j++) { matrix[j][0] = j; }

    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1,     // deletion
                matrix[j - 1][i] + 1,     // insertion
                matrix[j - 1][i - 1] + indicator // substitution
            );
        }
    }
    return matrix[b.length][a.length];
}

export function fuzzySearch(query, target) {
    if (!query) return true;
    if (!target) return false;

    const targetText = target.toLowerCase();
    const queryWords = query.toLowerCase().split(' ').filter(w => w.length > 0);

    return queryWords.every(queryWord => {
        // Calea rapidă: substring simplu, O(n), acoperă marea majoritate a căutărilor
        // fără să atingă Levenshtein deloc.
        if (targetText.includes(queryWord)) return true;

        let tolerance = 0;
        if (queryWord.length <= 2) tolerance = 0;
        else if (queryWord.length <= 4) tolerance = 1;
        else tolerance = 2;

        // Sub 3 caractere nu primim toleranță la typo — fără substring match, e ratare sigură.
        if (tolerance === 0) return false;

        const targetWords = targetText.split(' ').filter(w => w.length > 0);
        return targetWords.some(targetWord => getLevenshteinDistance(queryWord, targetWord) <= tolerance);
    });
}
