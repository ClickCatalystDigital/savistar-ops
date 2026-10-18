// lib/auth.js — JWT session auth. Roles: owner | admin | manager | user (office staff).
// owner/admin/manager all have full access; the distinction is just who's shown as what.
// Workshop employees never log in; staff enter their data.
import jwt from 'jsonwebtoken';
import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { jwtSecret } from './session';
const COOKIE_NAME = 'token';

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      display_name: user.display_name ?? null,
    },
    jwtSecret(),
    { expiresIn: '30d' }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, jwtSecret());
  } catch {
    return null;
  }
}

// For Route Handlers / Server Components (reads the httpOnly cookie). Async: Next 15's cookies() is.
export async function getSessionUser() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getUserFromRequest(req) {
  const authHeader = req.headers.get?.('authorization') || (await headers()).get('authorization');
  const bearer = authHeader?.replace('Bearer ', '');
  const token = bearer || (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export const COOKIE_OPTS = {
  name: COOKIE_NAME,
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 30 * 24 * 60 * 60
};

export const APPROVER_ROLES = ['owner', 'admin', 'manager'];
export function isApprover(user) {
  return !!user && APPROVER_ROLES.includes(user.role);
}

// Route-handler guard — returns an error Response when the check fails, else null.
export function requireApprover(user) {
  if (isApprover(user)) return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// Office staff (role 'user') never see company finances — cash ledger or bank statements.
export function isStaff(user) {
  return !!user && user.role === 'user';
}

export function requireNonStaff(user) {
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (isStaff(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

// Cash entries: owners/admins/managers can touch any entry; staff only the ones they created.
export function canAccessCash(user, createdBy) {
  return isApprover(user) || (isStaff(user) && !!user && user.username === createdBy);
}
