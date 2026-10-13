// The public demo page's features (components/DemoEntry.jsx) and its structured data (app/demo/page.js).
// Each: [icon, title, one line, section id, section heading, section paragraphs]. The paragraphs fill the
// "in detail" section below the fold, for visitors and search engines. Only what the app does today.
import { Building2Icon, HammerIcon, MapPinIcon, ClipboardListIcon, TruckIcon, WalletIcon, ReceiptIcon, UsersIcon } from 'lucide-react';

export const FEATURES = [
  [Building2Icon, 'Two companies, one system', 'A design studio and its furniture workshop share clients, vendors and people, each with its own work.', 'two-companies', 'One system for a design studio and its workshop', [
    'Many interior design firms run a sister company that makes the furniture. Here both work from one client list, one vendor list and one set of people, while design projects and workshop orders stay separate, each with its own screens.',
    'Invoices are raised under either company\'s letterhead and GSTIN, and the money of both sits in one finance book, so the owner sees the whole business without merging spreadsheets.',
  ]],
  [ClipboardListIcon, 'Projects with milestones', 'Every design job carries its milestones, site visits, linked workshop orders and vendor POs.', 'projects', 'Design projects from brief to handover', [
    'Each project belongs to a client and carries its milestones, from design sign-off to handover, with a progress bar that fills as they are marked done. Projects can be active, on hold or completed.',
    'Site visits are logged against the project with who went and what was found, and the furniture orders and vendor purchase orders made for it are linked from the same page.',
  ]],
  [HammerIcon, 'Workshop orders', 'Furniture orders with a work history of who worked on what, and when.', 'workshop-orders', 'Furniture workshop orders', [
    'Every furniture order records the client, the project it belongs to (if any), quantity, start and due dates, and moves from pending to in progress, done and delivered.',
    'Workers\' daily work logs are recorded against the order, with times and a rating, so each order has a history of who worked on it, for how long and how well.',
  ]],
  [MapPinIcon, 'One calendar', 'Tasks, milestones, site visits and order due dates in one place.', 'calendar', 'One calendar for the whole business', [
    'The home page calendar shows tasks, project milestones, site visits and workshop due dates together, by week or month, so clashes are visible before they happen.',
    'Tasks can be assigned to anyone in the office and linked to a client; each person sees their own list for the day.',
  ]],
  [TruckIcon, 'Vendors and freight', 'Vendor POs with partial deliveries and returns; freight bills checked against a rate card.', 'vendors-freight', 'Vendor POs, deliveries and freight checks', [
    'Purchase orders to vendors are raised for a project or a workshop order. Deliveries are recorded as they arrive, part by part, along with any material returned, so what is still due is always clear.',
    'Each transporter has a rate card by route. A freight bill above the agreed rate for its route is flagged when it is entered, before it is paid.',
  ]],
  [WalletIcon, 'One finance book', 'A cash ledger across both companies; office staff see only the entries they made.', 'finance', 'One finance book, with access by role', [
    'Money in and money out for both companies goes into one cash ledger, with the party for each entry, including payments to vendors.',
    'Office staff can record entries but see only the ones they made, and never the bank pages; this is enforced on the server for every request, not just hidden on screen. Bank statements can also be read by AI from a PDF upload, switched off in this demo.',
  ]],
  [ReceiptIcon, 'GST invoices', 'Invoices under the right company\'s letterhead and GSTIN, exported as PDF.', 'gst-invoices', 'GST invoices for either company', [
    'Invoices are made from the client\'s page, with HSN or SAC codes, GST rate, quantity and unit price on each line, and are tracked from draft to sent to paid.',
    'Each invoice uses the letterhead, address and GSTIN of the company raising it, and downloads as a PDF ready to send.',
  ]],
  [UsersIcon, 'People and payroll', 'Daily worksheet, attendance, advances and expenses, and payroll from them.', 'people-payroll', 'Attendance, advances and payroll', [
    'The daily worksheet shows every worker with their attendance (present, half day or absent) and what they worked on. Workers do not need a login; the office enters it.',
    'Expenses and salary advances are recorded per person, advances are deducted at payroll, and each month\'s payout is kept with its gross, deductions and net.',
  ]],
];
