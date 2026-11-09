// The tools /mcp offers, generated from the same registries as the chat, so an AI app does exactly what Atelier AI does:
//   ask             — the chat's own brain (lib/assistantChat.js turn): look-ups, how-to, the same answers and limits.
//   propose_action  — one of lib/assistantActions.js's tasks, checked: a preview plus a confirm token (10 minutes).
//   confirm_action  — runs exactly what was previewed, through the app's own route (lib/actionRunner.js).
// Nothing is written without the confirm step, the same rule as the Save button on the chat's card.
import jwt from 'jsonwebtoken';
import { jwtSecret } from './session';
import { turn } from './assistantChat';
import { ACTIONS, check } from './assistantActions';
import { runAction } from './actionRunner';
import { getSettings } from './assistant';

const sign = (user, action, values) => jwt.sign({ u: user.username, a: action, v: values }, jwtSecret(), { expiresIn: '10m', audience: 'mcp-confirm' });

// A table answer as plain rows (capped), so the AI app reads data, not layout.
function compact(reply) {
  if (!reply) return null;
  if (reply.type === 'table') {
    const cards = [reply, ...(reply.cards || [])].map((c) => ({ lookup: c.toolLabel || c.tool, filters: c.params, summary: c.summary, rows: (c.rows || []).slice(0, 50), total: c.total }));
    return { kind: 'data', text: reply.text || undefined, results: cards };
  }
  if (reply.type === 'draft' && reply.draft?.kind === 'action') {
    return { kind: 'action_suggested', note: 'This is a change. Call propose_action with this action and these fields, show the preview to the person, then confirm_action.', action: reply.draft.action, fields: reply.draft.values };
  }
  return { kind: reply.type, text: reply.text, title: reply.title, link: reply.link?.path };
}

const catalogue = ACTIONS.map((a) => `- ${a.key}: ${a.about} Fields: ${a.fields.map((f) => `${f.name}${f.required ? '*' : ''} (${f.type === 'ref' ? `${f.ref} id or name` : f.type === 'enum' ? f.options.map((o) => o.value).join('|') : f.type})`).join(', ')}`).join('\n');

export const TOOLS = [
  { name: 'ask', title: 'Ask Atelier', readOnly: true,
    description: 'Ask about the studio and workshop in plain words, exactly as you would ask the in-app assistant: projects, clients and conversations, quotations, invoices and GST, workshop orders, people and attendance, vendors, cash, bank, tasks, or how to do something in the app. Answers come from fixed read-only look-ups.',
    inputSchema: { type: 'object', properties: { question: { type: 'string', description: 'The question, in plain words' } }, required: ['question'] },
    async run({ question }, user) {
      if (!String(question || '').trim()) throw new Error('question is required');
      const out = await turn({ user: user.username, role: user.role, messages: [{ role: 'user', content: String(question).slice(0, 600) }], path: '/' });
      if (out.status !== 200) throw new Error(out.body?.error || `Failed (${out.status})`);
      return compact(out.body.reply);
    } },

  { name: 'propose_action', title: 'Prepare a change',
    description: `Prepare one change for the person to approve. Returns a preview, anything missing, and a confirm_token. Show the preview to the person and only call confirm_action after they agree. Dates are YYYY-MM-DD, months YYYY-MM; a * marks a required field; record fields take an id or a name.\nActions:\n${catalogue}`,
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ACTIONS.map((a) => a.key) }, fields: { type: 'object', description: 'Field values by name' } }, required: ['action', 'fields'] },
    async run({ action, fields }, user) {
      if (!(await getSettings()).actions.on) throw new Error('Changes from the assistant are switched off in Settings → My assistant');
      const c = await check(action, fields || {}, undefined, user);
      const preview = Object.fromEntries(c.fields.map((f) => [f.label, f.type === 'ref' ? f.display || f.value : f.value]));
      if (!c.ready) {
        const choices = Object.fromEntries(c.fields.filter((f) => f.options?.length && f.value == null).map((f) => [f.name, f.options]));
        return { ready: false, summary: c.summary, preview, missing: c.missing, errors: c.errors, ...(Object.keys(choices).length ? { choose_from: choices } : {}) };
      }
      return { ready: true, summary: c.summary, preview, risk: c.risk, confirm_token: sign(user, action, c.values), expires_in: '10 minutes' };
    } },

  { name: 'confirm_action', title: 'Make the change', destructive: true,
    description: 'Make a change the person approved: pass the confirm_token from propose_action. Runs through the app exactly as if they did it on screen.',
    inputSchema: { type: 'object', properties: { confirm_token: { type: 'string' } }, required: ['confirm_token'] },
    async run({ confirm_token }, user) {
      let t;
      try { t = jwt.verify(String(confirm_token || ''), jwtSecret(), { audience: 'mcp-confirm' }); } catch { throw new Error('That confirm_token is invalid or expired; call propose_action again'); }
      if (t.u !== user.username) throw new Error('That confirm_token belongs to someone else');
      const r = await runAction(user, t.a, t.v);
      if (!r.ok) throw new Error(r.error);
      return { done: true, summary: r.summary, id: r.result?.id ?? null, open: r.link };
    } },
];

export const INSTRUCTIONS = 'Designer Ops, the operations app of an interior design studio and its furniture workshop. Use ask for any question (it answers like the in-app assistant). To change anything, call propose_action, show the person the preview, and call confirm_action only after they say yes.';
