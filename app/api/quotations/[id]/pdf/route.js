import { renderToBuffer } from '@react-pdf/renderer';
import { loadQuotation } from '@/lib/quotations';
import { QuotationPdf } from '@/lib/quotationPdf';

export async function GET(req, ctx) {
  const { id } = await ctx.params;
  const q = await loadQuotation(Number(id));
  if (!q) return new Response('Not found', { status: 404 });
  const buffer = await renderToBuffer(QuotationPdf({ q }));
  const name = `quotation-${q.quote_no || q.id}${q.revision > 1 ? `-R${q.revision}` : ''}.pdf`.replace(/[^\w.-]/g, '_');
  return new Response(buffer, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"` } });
}
