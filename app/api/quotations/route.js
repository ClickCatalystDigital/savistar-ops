import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { listQuotations, createQuotation } from '@/lib/quotations';

export async function GET(req) {
  const clientId = new URL(req.url).searchParams.get('client_id');
  return NextResponse.json(await listQuotations({ clientId: clientId ? Number(clientId) : null }));
}

export async function POST(req) {
  const user = await getUserFromRequest(req);
  try {
    return NextResponse.json({ id: await createQuotation(await req.json(), user) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
