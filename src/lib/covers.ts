export type CoverPalette = {
  background: string;
  accent: string;
  text: string;
  subtext: string;
};

export type CoverTexture = 'none' | 'linen' | 'paper' | 'cotton';
export type CoverOrnament = 'simple-border' | 'corner-flourish' | 'floral-wreath' | 'vine-border';

export type CoverConfig = {
  id: string;
  label: string;
  palette: CoverPalette;
  texture: CoverTexture;
  ornament: CoverOrnament;
};

export const COVERS: CoverConfig[] = [
  // 4 solid colours
  {
    id: 'meadow',
    label: 'Meadow Cream',
    palette: { background: '#faf4e8', accent: '#b8943c', text: '#2d1f0a', subtext: '#7a5a28' },
    texture: 'none',
    ornament: 'simple-border',
  },
  {
    id: 'sage',
    label: 'Sage Green',
    palette: { background: '#d8e4cc', accent: '#5a7848', text: '#1a2812', subtext: '#3d5530' },
    texture: 'none',
    ornament: 'corner-flourish',
  },
  {
    id: 'dusty-rose',
    label: 'Dusty Rose',
    palette: { background: '#ead4d0', accent: '#a85858', text: '#2d1010', subtext: '#7a3838' },
    texture: 'none',
    ornament: 'floral-wreath',
  },
  {
    id: 'butter',
    label: 'Butter Yellow',
    palette: { background: '#f5e8a8', accent: '#a07818', text: '#2d1e00', subtext: '#7a5a10' },
    texture: 'none',
    ornament: 'vine-border',
  },
  // 4 textured papers
  {
    id: 'linen-gold',
    label: 'Linen Gold',
    palette: { background: '#e8dcc0', accent: '#9a7838', text: '#1e1000', subtext: '#5a3c18' },
    texture: 'linen',
    ornament: 'simple-border',
  },
  {
    id: 'paper-moss',
    label: 'Paper Moss',
    palette: { background: '#ccd8bc', accent: '#4a6838', text: '#101808', subtext: '#304820' },
    texture: 'paper',
    ornament: 'corner-flourish',
  },
  {
    id: 'cotton-blush',
    label: 'Cotton Blush',
    palette: { background: '#e8d0cc', accent: '#985050', text: '#200808', subtext: '#683030' },
    texture: 'cotton',
    ornament: 'vine-border',
  },
  {
    id: 'linen-lavender',
    label: 'Linen Lavender',
    palette: { background: '#dcd4ec', accent: '#7060a8', text: '#10081e', subtext: '#484068' },
    texture: 'linen',
    ornament: 'floral-wreath',
  },
  // 2 floral borders
  {
    id: 'floral-cream',
    label: 'Floral Cream',
    palette: { background: '#faf0e0', accent: '#8aaa68', text: '#1a1000', subtext: '#4a5830' },
    texture: 'paper',
    ornament: 'floral-wreath',
  },
  {
    id: 'floral-sage',
    label: 'Floral Sage',
    palette: { background: '#dcecd0', accent: '#6a9058', text: '#101800', subtext: '#384820' },
    texture: 'linen',
    ornament: 'floral-wreath',
  },
];

export function findCover(id: string): CoverConfig {
  return COVERS.find((c) => c.id === id) ?? COVERS[0];
}
