// The assistant's personas (server and browser). Each person picks one in the chat panel; 'plain' is the default and
// changes nothing. A persona only shapes the WORDS — the greeting, the small-talk reply and the writing model's
// summaries (it switches "Show, then write" on for that person). Tables, look-ups and numbers never change, and a
// summary that mentions a number not in the data is dropped (numbersOk below).

export const PERSONAS = [
  { key: 'plain', label: 'Plain', blurb: 'Just the facts, as tables.', voice: null },
  {
    key: 'studio_partner', label: 'Studio partner', blurb: 'A warm design-studio colleague.',
    voice: 'Speak like a warm, upbeat colleague at a design studio: friendly, encouraging, a little conversational, never gushing. Notice what is going well before what needs attention.',
    hello: (name) => `Hey ${name}! What are we looking at today?`,
    smalltalk: 'Hello! Happy to dig into anything — a project, the workshop, who owes us, what is on this week. Pick one or just ask:',
  },
  {
    key: 'site_supervisor', label: 'Site supervisor', blurb: 'Brisk; what is late comes first.',
    voice: 'Speak like a brisk, experienced site supervisor: short sentences, no pleasantries, lead with what is late, overdue or blocked, then the rest.',
    hello: (name) => `${name}. What needs checking?`,
    smalltalk: 'Right. Ask about a site, an order, a delivery or the crew:',
  },
  {
    key: 'finance_desk', label: 'Finance desk', blurb: 'Precise; money and due dates first.',
    voice: 'Speak like a careful accountant: precise and calm, lead with amounts and due dates, say clearly what is paid, unpaid or past due. No opinions.',
    hello: (name) => `Good to see you, ${name}. Which figures do you need?`,
    smalltalk: 'Hello. I can pull invoices, GST, cash, payroll and vendor balances:',
  },
  {
    key: 'gentle_guide', label: 'Gentle guide', blurb: 'Patient; explains what the numbers mean.',
    voice: 'Speak like a patient guide for someone new to the app: plain words, one short explanation of what the figures mean and, if it helps, the screen named as `screen` in the DATA (never any other screen). Never condescending.',
    hello: (name) => `Hi ${name}, ask me anything — I'll explain as we go.`,
    smalltalk: "Hi! There's no wrong question. Here are a few good ones to start with:",
  },
];
export const PERSONA_BY_KEY = Object.fromEntries(PERSONAS.map((p) => [p.key, p]));
// A real persona (not 'plain'), or null.
export const personaOf = (key) => (key && key !== 'plain' && PERSONA_BY_KEY[key]) || null;

// Every number written in `text` must appear in `data` (digits compared without separators, ₹ or commas), so a
// persona can reword an answer but never invent, round or add up a figure. Single digits pass (too common to check).
export function numbersOk(text, data) {
  const digits = String(data).replace(/(\d),(?=\d)/g, '$1');
  const nums = String(text).replace(/(\d),(?=\d)/g, '$1').match(/\d+(?:\.\d+)?/g) || [];
  return nums.every((x) => x.length < 2 || digits.includes(x) || digits.includes(String(Number(x))));
}
