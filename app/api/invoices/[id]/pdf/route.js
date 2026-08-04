import { renderToBuffer } from '@react-pdf/renderer';
import { queryAll, queryOne } from '@/lib/db';
import { InvoicePdf } from '@/lib/invoicePdf';

export async function GET(req, { params }) {
  const invoice = await queryOne('SELECT * FROM invoices WHERE id = ? AND is_deleted_record = 0', [params.id]);
  if (!invoice) return new Response('Not found', { status: 404 });
  const [items, client, project] = await Promise.all([
    queryAll('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order', [params.id]),
    queryOne('SELECT * FROM clients WHERE id = ?', [invoice.client_id]),
    invoice.project_id ? queryOne('SELECT * FROM projects WHERE id = ?', [invoice.project_id]) : null,
  ]);

  const buffer = await renderToBuffer(InvoicePdf({ invoice, items, client, project }));
  const filename = `invoice-${invoice.invoice_no || invoice.id}.pdf`.replace(/[^\w.-]/g, '_');
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
