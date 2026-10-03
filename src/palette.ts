type RGB = [number, number, number];

export function extractPalette(pixels: RGB[], k = 5, iters = 10): string[] {
  if (pixels.length === 0) return [];

  let centroids: RGB[] = Array.from({ length: k }, () =>
    [...pixels[Math.floor(Math.random() * pixels.length)]] as RGB
  );
  let counts: number[] = new Array(k).fill(0);

  for (let it = 0; it < iters; it++) {
    const sums: number[][] = Array.from({ length: k }, () => [0, 0, 0]);
    counts = new Array(k).fill(0);

    for (const p of pixels) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d =
          (p[0] - centroids[c][0]) ** 2 +
          (p[1] - centroids[c][1]) ** 2 +
          (p[2] - centroids[c][2]) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      counts[best]++;
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
    }

    centroids = centroids.map((c, i) =>
      counts[i]
        ? (sums[i].map((s) => Math.round(s / counts[i])) as RGB)
        : c
    );
  }

  return centroids
    .map((c, i) => ({ c, n: counts[i] }))
    .filter(({ n }) => n > 0) 
    .sort((a, b) => b.n - a.n)
    .map(({ c }) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''));
}