/** Unit coverage for generating the app's favicon and platform icon assets. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateBrandIcons } from '../scripts/generate-brand-icons.mjs';

const sourceDirectory = join(process.cwd(), 'src');

describe('generated brand icons', () => {
  it('replaces the favicon and app icons from the brand-mark SVG', async () => {
    await generateBrandIcons();

    const faviconPng = readFileSync(join(sourceDirectory, 'favicon.png'));
    const iconPng = readFileSync(join(sourceDirectory, 'icon.png'));
    const faviconIco = readFileSync(join(sourceDirectory, 'favicon.ico'));
    const iconIco = readFileSync(join(sourceDirectory, 'icon.ico'));
    const iconIcns = readFileSync(join(sourceDirectory, 'icon.icns'));

    expect(faviconPng.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(iconPng.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(faviconIco.subarray(0, 4).toString('hex')).toBe('00000100');
    expect(iconIco.subarray(0, 4).toString('hex')).toBe('00000100');
    expect(iconIcns.subarray(0, 4).toString('ascii')).toBe('icns');
    expect(iconIcns.readUInt32BE(4)).toBe(iconIcns.length);
  });
});