export function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];  // calculate dot product
        magnitudeA += Math.pow(a[i], 2);  // calculate magnitude of a
        magnitudeB += Math.pow(b[i], 2);  // calculate magnitude of b
    }
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    return dotProduct / (magnitudeA * magnitudeB);  // calculate cosine similarity
}