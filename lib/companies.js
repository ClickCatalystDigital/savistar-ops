// The two letterheads invoices and quotations are raised under (quotePrefix starts the quote series,
// e.g. SAV/Q/26-27/001). Real business details only —
// Saag's are left blank until supplied, rather than guessed.
import { DEMO } from './brand';
import { US } from './market.js';

const REAL = {
  savistar: {
    name: 'SAVISTAR',
    address: 'GF 3, Shree Narayan Darshan Bunglows,\nHebatpur, Thaltej, Ahmedabad',
    gstin: '24AFAFS7926Q1ZC',
    logo: '/logos/savistar.png',
    quotePrefix: 'SAV',
  },
  saag: {
    name: 'SAAG',
    address: '',
    gstin: '',
    logo: '/logos/saag.png',
    quotePrefix: 'SAAG',
  },
};

// Public demo: made-up letterheads, no logos, and a GSTIN that is obviously not one.
const SAMPLE = {
  savistar: { name: 'ACME INTERIORS', address: 'Unit 4, Sample Business Park,\nNavrangpura, Ahmedabad', gstin: '24SAMPLE0000X1Z0', logo: null, quotePrefix: 'AI' },
  saag: { name: 'ACME FURNITURE', address: 'Shed 12, Sample Industrial Estate,\nVatva, Ahmedabad', gstin: '24SAMPLE0001X1Z0', logo: null, quotePrefix: 'AF' },
};

// North American demo (NEXT_PUBLIC_MARKET=NA): made-up US letterheads, no tax registration number.
const SAMPLE_US = {
  savistar: { name: 'ACME INTERIORS', address: '410 Sample Street, Suite 200\nAustin, TX 78701', gstin: '', logo: null, quotePrefix: 'AI' },
  saag: { name: 'ACME FURNITURE', address: '1200 Example Road, Unit B\nAustin, TX 78744', gstin: '', logo: null, quotePrefix: 'AF' },
};

export const COMPANIES = DEMO ? (US ? SAMPLE_US : SAMPLE) : REAL;
