// tests/palettes.test.ts
import { describe, it, expect } from 'vitest';
import { getPalette, getAllPalettes, generatePaletteCss } from '../src/config/palettes';
import { createStoreConfig } from '../src/config/store.config';

describe('Color Palettes Engine (src/config/palettes.ts)', () => {
    it('returns all defined palettes in getAllPalettes()', () => {
        const palettes = getAllPalettes();
        expect(palettes.length).toBe(15);

        const ids = palettes.map(p => p.id);
        expect(ids).toContain('default');
        expect(ids).toContain('amber-gold');
        expect(ids).toContain('emerald-mint');
        expect(ids).toContain('sapphire-ocean');
        expect(ids).toContain('cyber-violet');
        expect(ids).toContain('crimson-ruby');
        expect(ids).toContain('rose-boutique');
        expect(ids).toContain('obsidian-slate');
        expect(ids).toContain('terracotta-sunset');
        expect(ids).toContain('midnight-gold');
        expect(ids).toContain('nordic-sage');
        expect(ids).toContain('sunset-coral');
        expect(ids).toContain('aqua-lagoon');
        expect(ids).toContain('caramel-mocha');
        expect(ids).toContain('cyber-lime');
    });

    it('returns null for default palette or null/empty inputs', () => {
        expect(getPalette('default')).toBeNull();
        expect(getPalette(null)).toBeNull();
        expect(getPalette(undefined)).toBeNull();
        expect(getPalette('')).toBeNull();
    });

    it('returns full definition for a specific palette', () => {
        const palette = getPalette('amber-gold');
        expect(palette).not.toBeNull();
        expect(palette?.name).toContain('Ámbar Cálido');
        expect(palette?.category).toBe('cálido');
        expect(palette?.preview.primary).toBe('#D97706');
        expect(palette?.theme?.primaryColor).toBe('#D97706');
        expect(palette?.theme?.accentColor).toBe('#F59E0B');
    });

    it('integrates palette overrides cleanly in createStoreConfig across templates', () => {
        // Restaurante con paleta cyber-violet
        const restaurantWithViolet = createStoreConfig('restaurant', { palette: 'cyber-violet' });
        expect(restaurantWithViolet.palette).toBe('cyber-violet');
        expect(restaurantWithViolet.theme.primaryColor).toBe('#7C3AED');
        expect(restaurantWithViolet.theme.accentColor).toBe('#EC4899');
        expect(restaurantWithViolet.theme.textHeading).toBe('#2E1065');

        // Ferretería con paleta emerald-mint
        const hardwareWithEmerald = createStoreConfig('hardware', { palette: 'emerald-mint' });
        expect(hardwareWithEmerald.palette).toBe('emerald-mint');
        expect(hardwareWithEmerald.theme.primaryColor).toBe('#059669');
        expect(hardwareWithEmerald.theme.accentColor).toBe('#10B981');
    });

    it('allows explicit theme overrides to take precedence over palette defaults', () => {
        const custom = createStoreConfig('restaurant', {
            palette: 'amber-gold',
            theme: {
                primaryColor: '#990000',
                fontHeading: 'CustomFont',
                fontBody: 'CustomFont',
                googleFontsUrl: '',
                primaryHover: '#880000',
                primaryLight: '#ffeeee',
                accentColor: '#00ff00'
            }
        });

        expect(custom.palette).toBe('amber-gold');
        expect(custom.theme.primaryColor).toBe('#990000');
        expect(custom.theme.accentPale).toBe('#FEF3C7'); // Heredado de amber-gold
    });

    it('generates complete :root CSS with !important rules in generatePaletteCss()', async () => {
        const { generatePaletteCss } = await import('../src/config/palettes');

        expect(generatePaletteCss(null)).toBe('');
        expect(generatePaletteCss('default')).toBe('');
        expect(generatePaletteCss('inexistente')).toBe('');

        const slateCss = generatePaletteCss('obsidian-slate');
        expect(slateCss).toContain(':root {');
        expect(slateCss).toContain('--theme-primary: #0F172A !important;');
        expect(slateCss).toContain('--theme-accent: #3B82F6 !important;');
        expect(slateCss).toContain('--theme-hero-bg: #090D16 !important;');
        expect(slateCss).toContain('--hero-bg: #090D16 !important;');
        expect(slateCss).toContain('--rose: #0F172A !important;');
        expect(slateCss).toContain('--gold: #3B82F6 !important;');
        expect(slateCss).toContain('--grad-hero:');
        expect(slateCss).toContain('--grad-cta:');
    });

    it('ensures all non-default palettes define a dark heroBg so header and footer do not turn white', () => {
        const palettes = getAllPalettes().filter(p => p.id !== 'default');
        expect(palettes.length).toBe(14);

        for (const p of palettes) {
            expect(p.theme?.heroBg).toBeDefined();
            // El heroBg debe ser un tono oscuro para contrastar con textos blancos del header y footer
            expect(p.theme?.heroBg).not.toBe(p.theme?.bgPage);
            expect(p.theme?.heroBg?.startsWith('#')).toBe(true);

            const css = generatePaletteCss(p.id);
            expect(css).toContain(`--theme-hero-bg: ${p.theme?.heroBg} !important;`);
            expect(css).toContain(`--hero-bg: ${p.theme?.heroBg} !important;`);
        }
    });
});
