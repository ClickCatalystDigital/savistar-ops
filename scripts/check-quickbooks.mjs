// node scripts/check-quickbooks.mjs
import assert from 'node:assert/strict';
import { authorizeUrl, tokenTimes, needsRefresh, checkState, normalizeAccounts, accountFits, cleanAccountMap, QBO_SCOPE } from '../lib/quickbooks.mjs';

const u = new URL(authorizeUrl({ clientId: 'abc', redirectUri: 'http://localhost:3000/api/quickbooks/callback', state: 's1' }));
assert.equal(u.origin + u.pathname, 'https://appcenter.intuit.com/connect/oauth2');
assert.equal(u.searchParams.get('scope'), QBO_SCOPE);
assert.equal(u.searchParams.get('response_type'), 'code');
assert.equal(u.searchParams.get('redirect_uri'), 'http://localhost:3000/api/quickbooks/callback');

const now = Date.UTC(2026, 10, 3);
const t = tokenTimes({ access_token: 'a', refresh_token: 'r', expires_in: 3600, x_refresh_token_expires_in: 8726400 }, now);
assert.equal(t.access_expires_at, new Date(now + 3600e3).toISOString());
assert.equal(t.refresh_expires_at, new Date(now + 8726400e3).toISOString());
assert.throws(() => tokenTimes({ access_token: 'a', expires_in: 3600 }, now));

assert.equal(needsRefresh({ access_expires_at: new Date(now + 60e3).toISOString() }, now), true);
assert.equal(needsRefresh({ access_expires_at: new Date(now + 30 * 60e3).toISOString() }, now), false);
assert.equal(needsRefresh({}, now), true);

const cookie = { state: 's1', userId: 7, exp: now + 1000 };
assert.equal(checkState({ cookie, state: 's1', userId: 7, now }), null);
assert.match(checkState({ cookie, state: 'x', userId: 7, now }), /did not match/);
assert.match(checkState({ cookie, state: 's1', userId: 8, now }), /signed in/);
assert.match(checkState({ cookie, state: 's1', userId: 7, now: now + 2000 }), /expired/);
assert.match(checkState({ cookie: null, state: 's1', userId: 7, now }), /expired/);

const accts = normalizeAccounts({ QueryResponse: { Account: [
  { Id: 2, Name: 'Sales', AccountType: 'Income', Active: true },
  { Id: 1, Name: 'Checking', AccountType: 'Bank' },
  { Id: 3, Name: 'Old', AccountType: 'Bank', Active: false },
] } });
assert.deepEqual(accts.map(a => a.id), ['1', '2']);
assert.equal(accountFits('asset', 'Bank'), true);
assert.equal(accountFits('income', 'Bank'), false);

assert.deepEqual(cleanAccountMap({ 1001: '1', 4100: '' }, ['1001', '4100'], ['1', '2']).rows,
  [{ code: '1001', qbo_account_id: '1' }, { code: '4100', qbo_account_id: null }]);
assert.match(cleanAccountMap({ 9999: '1' }, ['1001'], ['1']).error, /Unknown/);
assert.match(cleanAccountMap({ 1001: '99' }, ['1001'], ['1']).error, /not found/);
assert.match(cleanAccountMap([], ['1001'], ['1']).error, /mapping/);

console.log('quickbooks selfcheck ok');

const { suggestAccountMap } = await import('../lib/quickbooks.mjs');
const qbo = [
  { id: '35', name: 'Checking', type: 'Bank', subType: 'Checking' },
  { id: '84', name: 'Accounts Receivable (A/R)', type: 'Accounts Receivable' },
  { id: '33', name: 'Accounts Payable (A/P)', type: 'Accounts Payable' },
  { id: '79', name: 'Sales of Product Income', type: 'Income', subType: 'SalesOfProductIncome' },
  { id: '80', name: 'Cost of Goods Sold', type: 'Cost of Goods Sold' },
  { id: '58', name: 'Job Expenses', type: 'Expense' },
  { id: '8', name: 'Bank Charges', type: 'Expense', subType: 'BankCharges' },
  { id: '89', name: 'Board of Equalization Payable', type: 'Other Current Liability', subType: 'GlobalTaxPayable' },
];
assert.deepEqual(suggestAccountMap([
  { code: 'bank', name: 'Bank', account_type: 'asset' },
  { code: 'ar', name: 'Accounts receivable', account_type: 'asset' },
  { code: 'ap', name: 'Accounts payable', account_type: 'liability' },
  { code: 'tax', name: 'Sales Tax Payable', account_type: 'liability' },
  { code: 'sales', name: 'Pay application receipts', account_type: 'income' },
  { code: 'buy', name: 'Purchases', account_type: 'expense' },
  { code: 'site', name: 'Site expenses', account_type: 'expense' },
  { code: 'fee', name: 'Bank Charges', account_type: 'expense' },
], qbo), { bank: '35', ar: '84', ap: '33', sales: '79', buy: '80', site: '58', fee: '8' });
console.log('quickbooks suggestions ok');

// ---------- Phase 2: sending records ----------
const { fingerprint, syncKey, requestId, customerQuery, itemQuery, SALES_ITEMS, buildCustomer, buildInvoice, buildPayment } = await import('../lib/quickbooks.mjs');
const key = syncKey('INV-7', fingerprint('2026-11-03', 1250, 4));
assert.equal(key, 'INV-7#2026-11-03|1250|4');
assert.notEqual(key, syncKey('INV-7', fingerprint('2026-11-03', 900, 4)));
const rid = requestId('123', 'invoice', key);
assert.ok(rid.length <= 50 && rid === requestId('123', 'invoice', key) && rid !== requestId('123', 'payment', key));
assert.equal(customerQuery("O'Brien & Sons"), "select * from Customer where DisplayName = 'O\\'Brien & Sons'");
assert.equal(itemQuery('Design studio sales'), "select * from Item where Name = 'Design studio sales'");
assert.deepEqual(Object.values(SALES_ITEMS).map(i => i.code), ['sales_studio', 'sales_workshop']);

assert.deepEqual(buildCustomer({ name: 'Acme Homes', email: 'a@b.co', phone: '512', address: '1 Main St' }), {
  DisplayName: 'Acme Homes', CompanyName: 'Acme Homes', PrimaryEmailAddr: { Address: 'a@b.co' }, PrimaryPhone: { FreeFormNumber: '512' },
  BillAddr: { Line1: '1 Main St' }, ShipAddr: { Line1: '1 Main St' },
});
assert.deepEqual(buildCustomer({ name: 'Bare' }), { DisplayName: 'Bare', CompanyName: 'Bare' });

const inv = buildInvoice(
  { id: 9, invoice_no: null, submitted_on: null, created_at: '2026-11-02 10:00:00', due_date: '2026-12-01' },
  [{ description: 'Sofa', qty: 2, unit_price: 499.99, gst_pct: 8.25 }, { description: 'Delivery', qty: 1, unit_price: 50, gst_pct: 0 }],
  { address: '1 Main St', email: 'a@b.co' }, { customerId: '58', itemId: '11' });
assert.equal(inv.DocNumber, '9');
assert.equal(inv.TxnDate, '2026-11-02');
assert.equal(inv.Line[0].Amount, 999.98);
assert.deepEqual(inv.Line.map(l => l.SalesItemLineDetail.TaxCodeRef.value), ['TAX', 'NON']);
assert.ok(!JSON.stringify(inv).includes('TxnTaxDetail'));
assert.equal(inv.DueDate, '2026-12-01');
assert.equal(inv.BillEmail.Address, 'a@b.co');

const pay = buildPayment({ id: 5, date: '2026-11-03', amount: 2500, description: 'Advance' }, { customerId: '58', depositAccountId: '35' });
assert.equal(pay.TotalAmt, 2500);
assert.equal(pay.DepositToAccountRef.value, '35');
assert.equal(pay.Line, undefined); // unapplied: no LinkedTxn
assert.equal(buildPayment({ id: 5, date: 'x', amount: 1 }, { customerId: '1' }).DepositToAccountRef, undefined);
console.log('quickbooks sending ok');

// ---------- Phase 2b: purchase side ----------
const { vendorQuery, buildVendor, buildBill } = await import('../lib/quickbooks.mjs');
assert.equal(vendorQuery("Smith's Timber"), "select * from Vendor where DisplayName = 'Smith\\'s Timber'");
assert.deepEqual(buildVendor({ name: 'Smith Timber', phone: '512' }), { DisplayName: 'Smith Timber', CompanyName: 'Smith Timber', PrimaryPhone: { FreeFormNumber: '512' } });
assert.deepEqual(buildVendor({ name: 'Bare' }), { DisplayName: 'Bare', CompanyName: 'Bare' });
const bill = buildBill({ bill_no: 'PO-12', bill_date: '2026-11-01' }, [{ description: 'Oak plank', qty: 3, rate: 19.99 }], { vendorId: '61', accountId: '80' });
assert.equal(bill.VendorRef.value, '61');
assert.equal(bill.DocNumber, 'PO-12');
assert.equal(bill.Line.length, 1);
assert.equal(bill.Line[0].Amount, 59.97);
assert.equal(bill.Line[0].AccountBasedExpenseLineDetail.AccountRef.value, '80');
assert.equal(bill.DueDate, undefined);
const taxed = buildBill({ bill_no: 'PO-13', bill_date: '2026-11-01', due_date: '2026-12-01', tax_amount: 5.5 }, [{ description: 'x', qty: 1, rate: 100 }], { vendorId: '61', accountId: '80' });
assert.deepEqual(taxed.Line.map(l => l.Amount), [100, 5.5]);
assert.equal(taxed.Line[1].Description, 'Sales tax paid');
assert.equal(taxed.DueDate, '2026-12-01');
console.log('quickbooks purchase builders ok');
