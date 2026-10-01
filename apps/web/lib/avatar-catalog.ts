export interface ProfessionalAvatar {
  id: string;
  name: string;
  role: string;
  url: string;
  category: 'portrait' | 'illustration';
}

/**
 * Curated professional workplace avatars.
 * Clean, modern corporate/tech portraits that fit seamlessly alongside existing team members.
 */
export const PROFESSIONAL_AVATARS: ProfessionalAvatar[] = [
  {
    id: 'prof-alex',
    name: 'Alex',
    role: 'Product Designer',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&auto=format&fit=crop&q=80',
    category: 'portrait',
  },
  {
    id: 'prof-marcus',
    name: 'Marcus',
    role: 'Software Engineer',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&auto=format&fit=crop&q=80',
    category: 'portrait',
  },
  {
    id: 'prof-elena',
    name: 'Elena',
    role: 'Creative Director',
    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&auto=format&fit=crop&q=80',
    category: 'portrait',
  },
  {
    id: 'prof-priya',
    name: 'Priya',
    role: 'Frontend Architect',
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=240&auto=format&fit=crop&q=80',
    category: 'portrait',
  },
  {
    id: 'prof-jordan',
    name: 'Jordan',
    role: 'Engineering Manager',
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&auto=format&fit=crop&q=80',
    category: 'portrait',
  },
  {
    id: 'prof-samira',
    name: 'Samira',
    role: 'Staff Product Manager',
    url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=240&auto=format&fit=crop&q=80',
    category: 'portrait',
  },
  {
    id: 'prof-david',
    name: 'David',
    role: 'Security Engineer',
    url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=240&auto=format&fit=crop&q=80',
    category: 'portrait',
  },
  {
    id: 'prof-maya',
    name: 'Maya',
    role: 'Data Scientist',
    url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=240&auto=format&fit=crop&q=80',
    category: 'portrait',
  },
  {
    id: 'prof-thomas',
    name: 'Thomas',
    role: 'DevOps Lead',
    url: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=240&auto=format&fit=crop&q=80',
    category: 'portrait',
  },
  {
    id: 'prof-clara',
    name: 'Clara',
    role: 'UX Researcher',
    url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=240&auto=format&fit=crop&q=80',
    category: 'portrait',
  },
];

export function getAvatarInitials(name: string): string {
  if (!name || !name.trim()) return '?';
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }
  return `${tokens[0][0]}${tokens[tokens.length - 1][0]}`.toUpperCase();
}
