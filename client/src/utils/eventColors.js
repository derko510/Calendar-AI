// Muted, paper-friendly tints. An event is coloured by its own Google colorId if it has one,
// otherwise by its calendar (Google's calendar backgroundColor mapped to the nearest tone,
// or a stable hash of the calendar id), so every instance of a recurring series matches.
const TONES = [
  { name: 'sage', hex: '#6E8F68', block: 'bg-[#E7EEE4] text-[#2E4A2A] border-[#6E8F68]', dot: 'bg-[#6E8F68]' },
  { name: 'clay', hex: '#C4502B', block: 'bg-[#F4E4DA] text-[#6B2E17] border-[#C4502B]', dot: 'bg-[#C4502B]' },
  { name: 'slate', hex: '#5873A0', block: 'bg-[#E3E8F0] text-[#22324D] border-[#5873A0]', dot: 'bg-[#5873A0]' },
  { name: 'ochre', hex: '#B58B2A', block: 'bg-[#F3ECD6] text-[#5A4410] border-[#B58B2A]', dot: 'bg-[#B58B2A]' },
  { name: 'plum', hex: '#8D5E95', block: 'bg-[#EDE4EE] text-[#4A2850] border-[#8D5E95]', dot: 'bg-[#8D5E95]' },
  { name: 'teal', hex: '#4E8A8F', block: 'bg-[#E0EDEE] text-[#1D4549] border-[#4E8A8F]', dot: 'bg-[#4E8A8F]' },
];
// Greys (Google's "Graphite", grey calendars) get a neutral tone instead of a random hue
const STONE = { name: 'stone', hex: '#7D776C', block: 'bg-[#ECE9E3] text-[#34312C] border-[#7D776C]', dot: 'bg-[#7D776C]' };

// Google Calendar event colours (colors.get → event), by colorId
const GOOGLE_EVENT_COLORS = {
  1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73', 5: '#f6bf26', 6: '#f4511e',
  7: '#039be5', 8: '#616161', 9: '#3f51b5', 10: '#0b8043', 11: '#d50000'
};

const toHsl = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
};

const TONE_HUES = TONES.map(t => toHsl(t.hex).h);
const byHex = new Map();

/** Nearest palette tone for any hex colour (by hue; greys map to stone). */
export const toneForHex = (hex) => {
  const key = String(hex || '').toLowerCase();
  if (byHex.has(key)) return byHex.get(key);
  const hsl = toHsl(key);
  let tone = null;
  if (hsl) {
    if (hsl.s < 0.18 || hsl.l < 0.12) {
      tone = STONE;
    } else {
      let best = 0;
      let bestDist = Infinity;
      TONE_HUES.forEach((h, i) => {
        const dist = Math.min(Math.abs(h - hsl.h), 360 - Math.abs(h - hsl.h));
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      tone = TONES[best];
    }
  }
  byHex.set(key, tone);
  return tone;
};

const hashTone = (key) => {
  let hash = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
};

/** Tone for a calendar ({ id, backgroundColor }). */
export const getCalendarTone = (calendar) =>
  toneForHex(calendar?.backgroundColor) || hashTone(calendar?.id || 'primary');

/** Tone for an event: its own colorId, else its calendar's colour, else a hash of its calendar id. */
export const getEventTone = (event) => {
  const own = event?.colorId && GOOGLE_EVENT_COLORS[event.colorId];
  return (own && toneForHex(own))
    || toneForHex(event?.calendarColor)
    || hashTone(event?.calendarId || 'primary');
};
