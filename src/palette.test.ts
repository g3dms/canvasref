import { describe, it, expect } from 'vitest';
import { extractPalette } from './palette';

describe('extractPalette', () => {
  it('finds the dominant color of a solid image', () => {
    const pixels = Array(1000).fill([255, 0, 0]);
    expect(extractPalette(pixels, 1)[0]).toBe('#ff0000');
  });

  it('returns two colors for a two-color image', () => {
    const pixels = [
      ...Array(500).fill([255, 0, 0]),
      ...Array(500).fill([0, 0, 255]),
    ];
    const result = extractPalette(pixels, 2);
    expect(result).toContain('#ff0000');
    expect(result).toContain('#0000ff');
  });

  it('sorts by cluster size, biggest first', () => {
    const pixels = [
      ...Array(900).fill([0, 255, 0]),
      ...Array(100).fill([255, 255, 255]),
    ];
    expect(extractPalette(pixels, 2)[0]).toBe('#00ff00');
  });
});