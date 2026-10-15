export interface Palette { skyTop: string; skyBottom: string; sun: string; mtnFar: string; mtnNear: string; hill: string; rock: string; rockDark: string; grass: string; grassLight: string; water: string; waterDeep: string }

export const PALETTES: Record<number, Palette> = {
  1: { skyTop: '#4aa8ff', skyBottom: '#d8f1ff', sun: '#fff6b0', mtnFar: '#9bb8d9', mtnNear: '#7aa0c4', hill: '#6cc16a', rock: '#a98a6a', rockDark: '#7b6049', grass: '#4fb04f', grassLight: '#7fd96f', water: '#3fa7e0', waterDeep: '#1e6fa8' },
  2: { skyTop: '#5b9be8', skyBottom: '#ffe9c4', sun: '#fff0a0', mtnFar: '#a9a6c8', mtnNear: '#8a88b0', hill: '#7fb85c', rock: '#b08f6e', rockDark: '#7f6248', grass: '#6aa84a', grassLight: '#9bd45c', water: '#3b9bd2', waterDeep: '#1b6396' },
  3: { skyTop: '#6a6fd6', skyBottom: '#ffc7a0', sun: '#ffd88a', mtnFar: '#b08fb8', mtnNear: '#8b6c9c', hill: '#6c9a55', rock: '#9c7d68', rockDark: '#6e5445', grass: '#5d9a45', grassLight: '#8fc457', water: '#4a86c0', waterDeep: '#25497f' },
  4: { skyTop: '#39467a', skyBottom: '#f0a58c', sun: '#ffcf8a', mtnFar: '#6d6a98', mtnNear: '#4e4b78', hill: '#4e8048', rock: '#8a6f60', rockDark: '#5e473c', grass: '#4a8040', grassLight: '#76ad4e', water: '#37699f', waterDeep: '#183a66' },
  5: { skyTop: '#2d3a6e', skyBottom: '#e89a8a', sun: '#ffb870', mtnFar: '#5f5a8c', mtnNear: '#433f6e', hill: '#467a44', rock: '#80655a', rockDark: '#554036', grass: '#427a3c', grassLight: '#6aa04a', water: '#33608f', waterDeep: '#152f55' },
  6: { skyTop: '#1b2250', skyBottom: '#c9708a', sun: '#ff9f6b', mtnFar: '#4a4580', mtnNear: '#322f5c', hill: '#3c6c40', rock: '#715852', rockDark: '#483630', grass: '#386c38', grassLight: '#5c9442', water: '#2b5483', waterDeep: '#0f244a' },
};
