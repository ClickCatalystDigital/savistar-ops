// Quotation PDF: a one-page summary (rooms, taxes, total, payment stages, terms), then the detail room
// by room with each line's unit, measurement basis and subtotal. Same letterheads and palette as the
// invoice (lib/invoicePdf.js), so the two documents from one studio look alike.
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import fs from 'fs';
import path from 'path';
import { COMPANIES } from './companies';
import { formatDate } from './format';
import { s, rupees, MAROON, ROSE, INK, SLATE, GRAY, BAND, BAND_ALT, BORDER } from './invoicePdf';
import { roomTotals, lineAmount, amountInWords } from './quote-math';
import { UNIT_LABEL } from './boq-check';

const q2 = StyleSheet.create({
  h2: { fontSize: 10, fontWeight: 700, color: INK, marginTop: 20, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 },
  room: { fontSize: 11, fontWeight: 700, color: MAROON, marginTop: 16, marginBottom: 4 },
  basis: { fontSize: 7.5, color: GRAY, marginTop: 2 },
  roomTotal: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 6, paddingRight: 8, fontSize: 9, fontWeight: 700, color: INK, borderTop: `1 solid ${BORDER}` },
  words: { fontSize: 8.5, color: SLATE, marginTop: 8, fontStyle: 'italic', textAlign: 'right' },
  terms: { fontSize: 8, color: GRAY, lineHeight: 1.5 },
  sign: { marginTop: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8.5, color: SLATE },
  signLine: { width: 180, borderTop: `1 solid ${BORDER}`, paddingTop: 4 },
});

function Header({ q, co, logo, subtitle }) {
  return (
    <>
      <View style={s.row}>
        <View>
          {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.companyName}>{co.name}</Text>}
          {!!co.address && <Text style={s.companyMeta}>{co.address}</Text>}
          {!!co.gstin && <Text style={s.companyMeta}>GSTIN : {co.gstin}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.title}>QUOTATION</Text>
          {!!q.quote_no && <Text style={s.invoiceNo}>No. {q.quote_no}{q.revision > 1 ? ` · Revision ${q.revision}` : ''}</Text>}
          {!!q.quoted_on && <Text style={s.submittedOn}>Dated {formatDate(q.quoted_on)}</Text>}
          {!!q.valid_until && <Text style={s.invoiceNo}>Valid until {formatDate(q.valid_until)}</Text>}
          {!!subtitle && <Text style={s.invoiceNo}>{subtitle}</Text>}
        </View>
      </View>
      <View style={s.headerRule} />
    </>
  );
}

export function QuotationPdf({ q }) {
  const co = COMPANIES[q.company] || COMPANIES.savistar;
  const logoPath = co.logo ? path.join(process.cwd(), 'public', co.logo) : null; // no logo in the demo
  const logo = logoPath && fs.existsSync(logoPath) ? logoPath : null;
  const items = q.items.filter((it) => !Number(it.optional));
  const rooms = roomTotals(items);
  const t = q.totals;

  return (
    <Document>
      {/* Summary */}
      <Page size="A4" style={s.page}>
        <Header q={q} co={co} logo={logo} subtitle={q.title} />
        <View style={s.row}>
          <View style={{ maxWidth: 260, borderLeft: `2 solid ${ROSE}`, paddingLeft: 10 }}>
            <Text style={s.label}>Prepared for</Text>
            <Text style={s.clientName}>{q.client.name}</Text>
            {!!q.client.address && <Text style={s.value}>{q.client.address}</Text>}
            {!!q.project?.name && <Text style={s.value}>Project: {q.project.name}</Text>}
            {!!q.project?.address && <Text style={s.value}>Site: {q.project.address}</Text>}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.label}>Place of supply</Text>
            <Text style={s.value}>{q.place_of_supply === 'other_state' ? 'Another state (IGST)' : 'Within the state (CGST + SGST)'}</Text>
          </View>
        </View>

        <Text style={q2.h2}>Summary</Text>
        <View style={[s.table, { marginTop: 0 }]}>
          <View style={s.tr}>
            <Text style={[s.th, { flex: 3 }]}>Room</Text>
            <Text style={[s.th, { flex: 1, textAlign: 'right' }]}>Lines</Text>
            <Text style={[s.th, { flex: 1.4, textAlign: 'right' }]}>Amount</Text>
          </View>
          {rooms.map((r, i) => (
            <View key={r.name} style={[s.tr, i % 2 === 1 && { backgroundColor: BAND_ALT }]}>
              <Text style={[s.tdDesc, { flex: 3 }]}>{r.name}</Text>
              <Text style={[s.td, { flex: 1, textAlign: 'right' }]}>{r.items.length}</Text>
              <Text style={[s.td, { flex: 1.4, textAlign: 'right', fontWeight: 700, color: INK }]}>{rupees(r.subtotal)}</Text>
            </View>
          ))}
        </View>
        <View style={s.totals}>
          <View style={s.totalRow}><Text>Subtotal</Text><Text>{rupees(t.subtotal)}</Text></View>
          {t.taxes.map((x) => <View key={x.label} style={s.totalRow}><Text>{x.label}</Text><Text>{rupees(x.amount)}</Text></View>)}
          <View style={s.grandTotalBox}>
            <Text style={s.grandTotalLabel}>Total</Text>
            <Text style={s.grandTotalValue}>{rupees(t.total)}</Text>
          </View>
        </View>
        {t.total > 0 && <Text style={q2.words}>{amountInWords(t.total)}</Text>}

        {q.stages.length > 0 && (
          <>
            <Text style={q2.h2}>Payment stages</Text>
            <View style={[s.table, { marginTop: 0 }]}>
              <View style={s.tr}>
                <Text style={[s.th, { flex: 3 }]}>Stage</Text>
                <Text style={[s.th, { flex: 0.8, textAlign: 'right' }]}>Share</Text>
                <Text style={[s.th, { flex: 1.4, textAlign: 'right' }]}>Amount incl. GST</Text>
              </View>
              {q.stages.map((st, i) => (
                <View key={st.id ?? i} style={[s.tr, i % 2 === 1 && { backgroundColor: BAND_ALT }]}>
                  <Text style={[s.td, { flex: 3 }]}>{st.label}</Text>
                  <Text style={[s.td, { flex: 0.8, textAlign: 'right' }]}>{st.pct}%</Text>
                  <Text style={[s.td, { flex: 1.4, textAlign: 'right' }]}>{rupees(Math.round(t.total * st.pct) / 100)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {!!q.terms && (
          <>
            <Text style={q2.h2}>Terms</Text>
            <Text style={q2.terms}>{q.terms.split('\n').filter(Boolean).map((l, i) => `${i + 1}. ${l}`).join('\n')}</Text>
          </>
        )}
        <View style={q2.sign}>
          <Text style={q2.signLine}>For {co.name}</Text>
          <Text style={q2.signLine}>Accepted by {q.client.name}</Text>
        </View>
      </Page>

      {/* Detail, room by room */}
      <Page size="A4" style={s.page} wrap>
        <Header q={q} co={co} logo={logo} subtitle="Detail" />
        {rooms.map((r) => (
          <View key={r.name}>
            <Text style={q2.room}>{r.name}</Text>
            <View style={[s.table, { marginTop: 0 }]}>
              <View style={s.tr} fixed>
                <Text style={[s.th, { flex: 0.4 }]}>#</Text>
                <Text style={[s.th, { flex: 3.6 }]}>Description</Text>
                <Text style={[s.th, { flex: 0.9 }]}>Unit</Text>
                <Text style={[s.th, { flex: 0.7, textAlign: 'right' }]}>Qty</Text>
                <Text style={[s.th, { flex: 1.1, textAlign: 'right' }]}>Rate</Text>
                <Text style={[s.th, { flex: 1.3, textAlign: 'right' }]}>Amount</Text>
              </View>
              {r.items.map((it, i) => (
                <View key={i} style={[s.tr, i % 2 === 1 && { backgroundColor: BAND }]} wrap={false}>
                  <Text style={[s.td, { flex: 0.4 }]}>{i + 1}</Text>
                  <View style={[s.td, { flex: 3.6 }]}>
                    <Text style={{ color: INK }}>{it.description}</Text>
                    {!!(it.measurement_basis || it.dims) && (
                      <Text style={q2.basis}>{[it.dims && `Measured: ${it.dims}`, it.measurement_basis].filter(Boolean).join(' · ')}</Text>
                    )}
                  </View>
                  <Text style={[s.td, { flex: 0.9 }]}>{UNIT_LABEL[it.unit] || it.unit || ''}</Text>
                  <Text style={[s.td, { flex: 0.7, textAlign: 'right' }]}>{it.qty}</Text>
                  <Text style={[s.td, { flex: 1.1, textAlign: 'right' }]}>{rupees(it.rate)}</Text>
                  <Text style={[s.td, { flex: 1.3, textAlign: 'right', fontWeight: 700, color: INK }]}>{rupees(lineAmount(it))}</Text>
                </View>
              ))}
              <View style={q2.roomTotal}><Text>{r.name} subtotal  {rupees(r.subtotal)}</Text></View>
            </View>
          </View>
        ))}
      </Page>
    </Document>
  );
}
