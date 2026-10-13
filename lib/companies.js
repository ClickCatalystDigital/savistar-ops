// The two letterheads invoices can be raised under. Real business details only —
// Saag's are left blank until supplied, rather than guessed.
import { DEMO } from './brand';

const REAL = {
  savistar: {
    name: 'SAVISTAR',
    address: 'GF 3, Shree Narayan Darshan Bunglows,\nHebatpur, Thaltej, Ahmedabad',
    gstin: '24AFAFS7926Q1ZC',
    logo: '/logos/savistar.png',
  },
  saag: {
    name: 'SAAG',
    address: '',
    gstin: '',
    logo: '/logos/saag.png',
  },
};

// Public demo: made-up letterheads, no logos, and a GSTIN that is obviously not one.
const SAMPLE = {
  savistar: { name: 'ACME INTERIORS', address: 'Unit 4, Sample Business Park,\nNavrangpura, Ahmedabad', gstin: '24SAMPLE0000X1Z0', logo: null },
  saag: { name: 'ACME FURNITURE', address: 'Shed 12, Sample Industrial Estate,\nVatva, Ahmedabad', gstin: '24SAMPLE0001X1Z0', logo: null },
};

export const COMPANIES = DEMO ? SAMPLE : REAL;
