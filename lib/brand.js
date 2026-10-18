// Display names. The public demo build (NEXT_PUBLIC_DEMO=1, interiors-erp.ahromlabs.com) uses made-up
// companies so Savistar's and Saag's real names, address and GSTIN never appear there. The stored keys
// ('savistar' / 'saag' in invoices.company etc.) stay the same on both.
export const DEMO = process.env.NEXT_PUBLIC_DEMO === '1';

export const BRAND = DEMO
  ? { app: 'Designer Ops', word: 'DESIGNER', studio: 'Acme Interiors', studioShort: 'Acme Interiors', workshop: 'Acme Furniture', workshopShort: 'Acme Furniture', ai: 'Designer AI' }
  : { app: 'Savistar Ops', word: 'SAVISTAR', studio: 'Savistar Interiors', studioShort: 'Savistar', workshop: 'Saag Furniture', workshopShort: 'Saag', ai: 'Savistar AI' };
