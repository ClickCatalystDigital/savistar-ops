// The narrated tour on YouTube: embedded above the demo form (components/DemoEntry.jsx) and described to search engines
// as a VideoObject next to the product (app/demo/page.js). India build only: the tour shows rupees and GST.
import { US } from '@/lib/market';

export const DEMO_VIDEO = US ? null : {
  id: '8efhVJB23x0',
  name: 'Interior Design and Furniture Workshop ERP: a 1-Minute Tour (DesignerOps live demo, sample company)',
  description: 'A tour of DesignerOps with made-up sister companies Acme Interiors and Acme Furniture: clients, projects with photos and milestones, one project on one page, workshop orders, vendors, daily attendance and one combined finance book.',
  duration: 'PT1M7S',
  uploadDate: '2026-11-04',
};
