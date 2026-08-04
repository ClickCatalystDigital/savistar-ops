import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import fs from 'fs';
import path from 'path';
import { COMPANIES } from './companies';
import { formatDate } from './format';

// Palette lifted directly from the client's sample invoice (nothing added):
// maroon rule/accent, dusty-rose highlight, three text grays, light zebra banding.
const MAROON = '#980000';
const ROSE = '#E6B8AF';
const INK = '#000000';
const SLATE = '#434343';
const GRAY = '#666666';
const BAND = '#F3F3F3';
const BAND_ALT = '#EFEFEF';
const BORDER = '#DDDDDD';

const rupees = n => `Rs. ${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: 'Helvetica', color: INK },
  row: { flexDirection: 'row', justifyContent: 'space-between' },

  logo: { width: 110, height: 44, objectFit: 'contain' },
  companyName: { fontSize: 17, fontWeight: 700, letterSpacing: 1.5, color: INK },
  companyMeta: { fontSize: 8, color: GRAY, lineHeight: 1.5, marginTop: 5 },
  headerRule: { marginTop: 14, marginBottom: 20, height: 2, backgroundColor: MAROON },

  title: { fontSize: 20, fontWeight: 700, letterSpacing: 2, color: MAROON },
  invoiceNo: { fontSize: 9, color: SLATE, marginTop: 5 },
  submittedOn: { fontSize: 8.5, color: MAROON, marginTop: 2, fontWeight: 700 },

  section: { marginTop: 4 },
  label: { fontSize: 7.5, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  clientName: { fontSize: 11.5, fontWeight: 700, color: INK, marginBottom: 2 },
  value: { fontSize: 9, color: SLATE, marginBottom: 1.5, lineHeight: 1.4 },

  table: { marginTop: 22, borderRadius: 2, overflow: 'hidden', border: `1 solid ${BORDER}` },
  tr: { flexDirection: 'row' },
  th: { padding: 8, fontSize: 7.5, fontWeight: 700, color: SLATE, textTransform: 'uppercase', letterSpacing: 0.5, backgroundColor: BAND },
  td: { padding: 8, fontSize: 9, color: SLATE, borderTop: `1 solid ${BORDER}` },
  tdDesc: { padding: 8, fontSize: 9, color: INK, fontWeight: 700, borderTop: `1 solid ${BORDER}` },

  totals: { marginTop: 16, alignSelf: 'flex-end', width: 220 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, fontSize: 9, color: SLATE },
  grandTotalBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 6, paddingVertical: 8, paddingHorizontal: 10,
    backgroundColor: BAND, borderTop: `2 solid ${MAROON}`,
  },
  grandTotalLabel: { fontSize: 9, fontWeight: 700, color: INK, textTransform: 'uppercase', letterSpacing: 0.5 },
  grandTotalValue: { fontSize: 12, fontWeight: 700, color: MAROON },

  footerRule: { marginTop: 28, height: 1, backgroundColor: BORDER },
  notes: { marginTop: 10, fontSize: 8.5, color: GRAY, lineHeight: 1.4 },
});

const COLS = [
  { key: 'description', label: 'Description', flex: 3 },
  { key: 'hsn', label: 'HSN', flex: 1 },
  { key: 'gst_pct', label: 'GST', flex: 0.6, align: 'right' },
  { key: 'qty', label: 'Qty', flex: 0.6, align: 'right' },
  { key: 'unit_price', label: 'Unit price', flex: 1.2, align: 'right' },
  { key: 'total', label: 'Total', flex: 1.2, align: 'right' },
];

export function InvoicePdf({ invoice, items, client, project }) {
  const co = COMPANIES[invoice.company] || COMPANIES.savistar;
  const logoPath = path.join(process.cwd(), 'public', co.logo);
  const hasLogo = co.logo && fs.existsSync(logoPath);

  const subtotal = items.reduce((sum, i) => sum + i.qty * i.unit_price, 0);
  const tax = items.reduce((sum, i) => sum + i.qty * i.unit_price * i.gst_pct / 100, 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.row}>
          <View>
            {hasLogo ? <Image src={logoPath} style={s.logo} /> : <Text style={s.companyName}>{co.name}</Text>}
            {!!co.address && <Text style={s.companyMeta}>{co.address}</Text>}
            {!!co.gstin && <Text style={s.companyMeta}>GSTIN : {co.gstin}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.title}>INVOICE</Text>
            {!!invoice.invoice_no && <Text style={s.invoiceNo}>No. {invoice.invoice_no}</Text>}
            {!!invoice.submitted_on && <Text style={s.submittedOn}>Submitted on {formatDate(invoice.submitted_on)}</Text>}
            {!!invoice.title && <Text style={s.invoiceNo}>{invoice.title}</Text>}
          </View>
        </View>

        <View style={s.headerRule} />

        <View style={s.row}>
          <View style={{ maxWidth: 260, borderLeft: `2 solid ${ROSE}`, paddingLeft: 10 }}>
            <Text style={s.label}>Bill to</Text>
            <Text style={s.clientName}>{client.name}</Text>
            {!!invoice.client_pan && <Text style={s.value}>PAN: {invoice.client_pan}</Text>}
            {!!client.address && <Text style={s.value}>{client.address}</Text>}
            {!!project?.name && <Text style={s.value}>Project: {project.name}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {!!invoice.payment_terms && (
              <View style={{ marginBottom: 8, alignItems: 'flex-end' }}>
                <Text style={s.label}>Payment terms</Text>
                <Text style={s.value}>{invoice.payment_terms}</Text>
              </View>
            )}
            {!!invoice.due_date && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.label}>Due date</Text>
                <Text style={[s.value, { fontWeight: 700, color: INK }]}>{formatDate(invoice.due_date)}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.tr}>
            {COLS.map(c => <Text key={c.key} style={[s.th, { flex: c.flex, textAlign: c.align || 'left' }]}>{c.label}</Text>)}
          </View>
          {items.map((it, i) => (
            <View style={[s.tr, i % 2 === 1 && { backgroundColor: BAND_ALT }]} key={i}>
              <Text style={[s.tdDesc, { flex: 3 }]}>{it.description}</Text>
              <Text style={[s.td, { flex: 1 }]}>{it.hsn || ''}</Text>
              <Text style={[s.td, { flex: 0.6, textAlign: 'right' }]}>{it.gst_pct}%</Text>
              <Text style={[s.td, { flex: 0.6, textAlign: 'right' }]}>{it.qty}</Text>
              <Text style={[s.td, { flex: 1.2, textAlign: 'right' }]}>{rupees(it.unit_price)}</Text>
              <Text style={[s.td, { flex: 1.2, textAlign: 'right', fontWeight: 700, color: INK }]}>{rupees(it.qty * it.unit_price)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals}>
          <View style={s.totalRow}><Text>Subtotal</Text><Text>{rupees(subtotal)}</Text></View>
          <View style={s.totalRow}><Text>CGST</Text><Text>{rupees(tax / 2)}</Text></View>
          <View style={s.totalRow}><Text>SGST</Text><Text>{rupees(tax / 2)}</Text></View>
          <View style={s.grandTotalBox}>
            <Text style={s.grandTotalLabel}>Grand total</Text>
            <Text style={s.grandTotalValue}>{rupees(subtotal + tax)}</Text>
          </View>
        </View>

        {!!invoice.notes && (
          <>
            <View style={s.footerRule} />
            <View style={s.section}>
              <Text style={s.label}>Notes</Text>
              <Text style={s.notes}>{invoice.notes}</Text>
            </View>
          </>
        )}
      </Page>
    </Document>
  );
}
