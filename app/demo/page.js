// Public demo entry (DEMO_MODE=1 only): a short form, then the visitor picks a login to enter as.
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { DEMO_ROLES } from '@/lib/demo-roles';
import DemoEntry from '@/components/DemoEntry';

export const metadata = {
  title: 'Interior Design and Furniture Workshop ERP: Live Demo | Ahrom Labs',
  description: 'Try an operations system for an interior design studio and its furniture workshop: projects, site visits, workshop orders, vendor POs, daily worksheets, payroll, GST invoices and one combined finance book.',
  robots: { index: true, follow: true },
};

export default async function DemoPage() {
  if (process.env.DEMO_MODE !== '1') notFound();
  const hasLead = (await cookies()).get('demo_lead')?.value === '1';
  return <DemoEntry roles={DEMO_ROLES} hasLead={hasLead} />;
}
