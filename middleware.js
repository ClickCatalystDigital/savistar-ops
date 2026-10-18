// middleware.js
// Edge runtime: checks the session cookie's signature and expiry with Web Crypto (lib/session.js);
// route handlers read the user through lib/auth.js.
import { NextResponse } from 'next/server';
import { validSession } from '@/lib/session';

const PUBLIC_PATHS = ['/login', '/api/login', '/api/version'];

// Public demo (DEMO_MODE=1, interiors-erp.ahromlabs.com; never set on Render): visitors enter through
// /demo, password login is off, and changes to logins and file uploads (incl. AI bank-statement reading)
// are refused. Same as SB Ops' demoGuard.
const DEMO_PUBLIC = ['/demo', '/api/demo/lead', '/api/demo/enter'];
const DEMO_BLOCKED = ['/api/users', '/api/attachments', '/api/documents'];
const DEMO_AI_OPEN = ['/api/assistant/chat', '/api/assistant/briefing', '/api/assistant/starters', '/api/assistant/feedback'];
function demoGuard(req, pathname) {
  if (process.env.DEMO_MODE !== '1') return null;
  if (pathname === '/login') return NextResponse.redirect(new URL('/demo', req.url));
  if (pathname === '/api/login') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (DEMO_PUBLIC.includes(pathname)) return NextResponse.next();
  // The assistant: only asking (and its briefing, starters, thumbs) — never its settings, key or logs.
  if (pathname.startsWith('/api/assistant') && !DEMO_AI_OPEN.includes(pathname)) return NextResponse.json({ error: 'Not available in the demo' }, { status: 403 });
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (write && DEMO_BLOCKED.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.json({ error: 'Not available in the demo' }, { status: 403 });
  }
  return null;
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const demo = demoGuard(req, pathname);
  if (demo) return demo;

  if (
    PUBLIC_PATHS.some(p => pathname === p) ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get('token')?.value;

  if (!token || !(await validSession(token))) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.redirect(new URL(process.env.DEMO_MODE === '1' ? '/demo' : '/login', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
};
