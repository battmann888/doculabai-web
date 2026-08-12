const AVATAR_PALETTES = [
  ['#172554', '#60a5fa', '#bfdbfe'],
  ['#3f1d3f', '#f472b6', '#fbcfe8'],
  ['#14352d', '#34d399', '#a7f3d0'],
  ['#422006', '#f59e0b', '#fde68a'],
  ['#312e81', '#a78bfa', '#ddd6fe'],
];

export function getAbstractAvatar(index: number): string {
  const [background, primary, secondary] = AVATAR_PALETTES[Math.abs(index) % AVATAR_PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="28" fill="${background}"/><circle cx="76" cy="20" r="20" fill="${primary}" opacity=".28"/><path d="M-8 82 31 43l22 22 18-18 34 34v15H-8Z" fill="${primary}" opacity=".9"/><path d="m8 92 27-27 13 13 15-15 21 21v14H8Z" fill="${secondary}" opacity=".72"/><circle cx="22" cy="23" r="8" fill="${secondary}" opacity=".85"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function avatarIndexForUser(userId: string): number {
  return Array.from(userId).reduce((sum, character) => sum + character.charCodeAt(0), 0) % AVATAR_PALETTES.length;
}

export const ABSTRACT_AVATARS = AVATAR_PALETTES.map((_, index) => getAbstractAvatar(index));
