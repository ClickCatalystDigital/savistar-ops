// Public demo entry (DEMO_MODE=1 only): a short form, then the visitor picks a login to enter as.
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { DEMO_ROLES } from '@/lib/demo-roles';
import DemoEntry from '@/components/DemoEntry';
import { isOwnerPass } from '@/lib/demo-leads';
import { FEATURES } from '@/lib/demo-features';
import { US } from '@/lib/market';

// The demo's public address (wrangler.jsonc / wrangler.us.jsonc routes).
const DEMO_ORIGIN = US ? 'https://interiors-erp-us.ahromlabs.com' : 'https://interiors-erp.ahromlabs.com';

export const metadata = {
  title: US
    ? 'Interior Design and Furniture Workshop ERP for US Studios: Live Demo | Ahrom Labs'
    : 'Interior Design and Furniture Workshop ERP: Live Demo | Ahrom Labs',
  description: 'Try an operations system for an interior design studio and its furniture workshop: projects, site visits, workshop orders, vendor POs, daily worksheets, payroll, ' + (US ? 'invoices' : 'GST invoices') + ' and one combined finance book.',
  robots: { index: true, follow: true },
  // One URL per demo (/ only redirects here), and the India and US builds named as each other's regional versions.
  alternates: {
    canonical: `${DEMO_ORIGIN}/demo`,
    languages: { 'en-IN': 'https://interiors-erp.ahromlabs.com/demo', 'en-US': 'https://interiors-erp-us.ahromlabs.com/demo', 'x-default': 'https://interiors-erp.ahromlabs.com/demo' },
  },
};

export default async function DemoPage() {
  if (process.env.DEMO_MODE !== '1') notFound();
  const lead = (await cookies()).get('demo_lead')?.value;
  const hasLead = !!lead;
  // Structured data for search engines: what the product is and what it does (the same text as the page).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Designer Ops',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Operations software for interior design firms and furniture workshops',
    operatingSystem: 'Web browser',
    url: `${DEMO_ORIGIN}/demo`,
    description: metadata.description,
    featureList: FEATURES.map(([, title, text]) => `${title}: ${text}`),
    publisher: { '@type': 'Organization', name: 'Ahrom Labs', url: 'https://ahromlabs.com' },
    hasPart: FEATURES.map(([, , , id, heading]) => ({ '@type': 'WebPageElement', name: heading, url: `${DEMO_ORIGIN}/demo#${id}`})),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <DemoEntry roles={DEMO_ROLES} hasLead={hasLead} isOwner={isOwnerPass(lead)} />
    </>
  );
}
