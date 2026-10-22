// Muted, paper-friendly tints. Picked per event by a stable hash of its id.
const TONES = [
  { block: 'bg-[#E7EEE4] text-[#2E4A2A] border-[#6E8F68]', dot: 'bg-[#6E8F68]' }, // sage
  { block: 'bg-[#F4E4DA] text-[#6B2E17] border-[#C4502B]', dot: 'bg-[#C4502B]' }, // clay
  { block: 'bg-[#E3E8F0] text-[#22324D] border-[#5873A0]', dot: 'bg-[#5873A0]' }, // slate
  { block: 'bg-[#F3ECD6] text-[#5A4410] border-[#B58B2A]', dot: 'bg-[#B58B2A]' }, // ochre
  { block: 'bg-[#EDE4EE] text-[#4A2850] border-[#8D5E95]', dot: 'bg-[#8D5E95]' }, // plum
  { block: 'bg-[#E0EDEE] text-[#1D4549] border-[#4E8A8F]', dot: 'bg-[#4E8A8F]' }, // teal
];

export const getEventTone = (event) => {
  const key = String(event?.id || event?.summary || '');
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
};
