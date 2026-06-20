export type CoverPalette = {
  background: string;
  accent: string;
  text: string;
  subtext: string;
};

export type CoverConfig = {
  id: string;
  label: string;
  palette: CoverPalette;
};

const G = '#c4972a'; // gold tooling
const GT = '#e8d4a0'; // gold text
const GD = '#b8893a'; // gold dim (subtext)

export const COVERS: CoverConfig[] = [
  {
    id: 'meadow',
    label: 'Forest',
    palette: { background: '#1e2f1c', accent: G, text: GT, subtext: GD },
  },
  {
    id: 'sage',
    label: 'Sage',
    palette: { background: '#253625', accent: G, text: GT, subtext: GD },
  },
  {
    id: 'dusty-rose',
    label: 'Claret',
    palette: { background: '#3d1520', accent: G, text: GT, subtext: GD },
  },
  {
    id: 'butter',
    label: 'Chestnut',
    palette: { background: '#4e2009', accent: G, text: GT, subtext: GD },
  },
  {
    id: 'linen-gold',
    label: 'Tobacco',
    palette: { background: '#3d2408', accent: G, text: GT, subtext: GD },
  },
  {
    id: 'paper-moss',
    label: 'Midnight',
    palette: { background: '#0e1d35', accent: G, text: GT, subtext: GD },
  },
  {
    id: 'cotton-blush',
    label: 'Teal',
    palette: { background: '#0d2a2e', accent: G, text: GT, subtext: GD },
  },
  {
    id: 'linen-lavender',
    label: 'Plum',
    palette: { background: '#2a1635', accent: G, text: GT, subtext: GD },
  },
  {
    id: 'floral-cream',
    label: 'Onyx',
    palette: { background: '#141414', accent: G, text: GT, subtext: GD },
  },
  {
    id: 'floral-sage',
    label: 'Amber',
    palette: { background: '#322008', accent: G, text: GT, subtext: GD },
  },
];

export function findCover(id: string): CoverConfig {
  return COVERS.find((c) => c.id === id) ?? COVERS[0];
}
