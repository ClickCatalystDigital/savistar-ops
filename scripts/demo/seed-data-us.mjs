// North American demo data (MARKET=NA, interiors-erp-us.ahromlabs.com) for scripts/demo/seed.mjs: Acme Interiors
// and Acme Furniture, two made-up sister companies in Austin, Texas. Same shape as seed-data-in.mjs.
// Every name, street and phone is made up: 555-01xx numbers are reserved for fiction, streets are "Sample"/"Example".
// Texas sales tax (8.25%) is charged on materials and furniture; design fees and labor are not taxed here.
export const LABEL = 'Acme Interiors / Acme Furniture (US)';
export const USERS = [['owner', 'owner', 'Sarah Mitchell', '#8b5cf6'], ['manager', 'manager', 'David Chen', '#06b6d4'], ['office', 'user', 'Emily Rodriguez', '#ec4899']];
export const phone = (n) => `(512) 555-01${String(n - 200).padStart(2, '0')}`;
export const PROJECT_NOTES = 'Site lead: Jake.';
export const PO_NOTE = 'Deliver to the shop, East Austin';
export const TAX_PCT = 0; // per-line rates below; a line without one is not taxed
const TX = 8.25;

// [name, phone, address, notes]
export const CLIENTS = [
  ['Michael & Jennifer Carter', '(512) 555-0150', '2814 Sample Oaks Drive, Westlake Hills', 'Four-bedroom house, full interiors; prefers warm oak and brass.'],
  ['Kevin Brooks', '(512) 555-0151', 'Unit 902, 100 Example Street, Downtown Austin', 'Kitchen and closets only; wants it done before Thanksgiving.'],
  ['Brewnest Coffee Co.', '(512) 555-0152', '1500 Sample Lamar Blvd, Austin', 'Second location; same palette as their first coffee bar.'],
  ['Northbridge Consulting LLC', '(512) 555-0153', 'Suite 700, 300 Example Avenue, Austin', 'Office fit-out for 40 seats, two conference rooms.'],
  ['Dr. Lisa Nguyen', '(512) 555-0154', 'Suite 110, 40 Sample Medical Parkway, Austin', 'Dental clinic reception and two operatories.'],
  ['Ryan & Megan Foster', '(512) 555-0155', '77 Example Court, Round Rock', 'Living room and study; furniture only.'],
  ['Greenleaf Montessori School', '(512) 555-0156', '900 Sample Road, Cedar Park', 'Child-safe furniture for three classrooms.'],
  ['Tom Walker', '(512) 555-0157', 'Ranch, 12000 Sample Ranch Road, Dripping Springs', 'Inquiry: ranch house refurbishment, budget pending.'],
  ['Jason & Amy Price', '(512) 555-0158', 'Penthouse, 200 Example Plaza, Austin', 'Penthouse interiors; canceled after design (moved to Denver).'],
];

// [client, name, status, started (days ago), milestones [title, due (days from now), done]]
export const PROJECTS = [
  ['Michael & Jennifer Carter', 'Carter house — full interiors', 'active', 75, [['Design sign-off', -60, true], ['Electrical and drywall done', -30, true], ['Ceilings and paint', -5, true], ['Furniture installation', 10, false], ['Handover', 25, false]]],
  ['Northbridge Consulting LLC', 'Northbridge office fit-out, 40 seats', 'active', 40, [['Layout approved', -32, true], ['Partitions and ceilings', -8, true], ['Workstations installed', 6, false], ['Handover', 20, false]]],
  ['Brewnest Coffee Co.', 'Brewnest coffee bar, South Lamar', 'active', 28, [['Concept board approved', -20, true], ['Counter and seating fabrication', 3, false], ['Opening', 18, false]]],
  ['Kevin Brooks', 'Brooks apartment — kitchen and closets', 'active', 20, [['Measurements', -18, true], ['Kitchen cabinet install', 4, false], ['Doors and hardware', 12, false]]],
  ['Dr. Lisa Nguyen', 'Nguyen dental clinic', 'on_hold', 50, [['Design sign-off', -35, true], ['Landlord approval', 30, false]]],
  ['Ryan & Megan Foster', 'Foster living room', 'completed', 120, [['Design sign-off', -110, true], ['Installation', -70, true], ['Handover', -65, true]]],
  ['Jason & Amy Price', 'Price penthouse interiors', 'cancelled', 90, [['Concept presentation', -80, true], ['Design sign-off', -60, false]]],
];
// Material palettes for the project cards' swatch strips. Nguyen is left empty on purpose: a project with no palette yet.
export const MATERIALS = {
  'Carter house — full interiors': 'warm oak, brass, walnut, ivory',
  'Northbridge office fit-out, 40 seats': 'ash, charcoal, glass, steel',
  'Brewnest coffee bar, South Lamar': 'terrazzo, cane, sage, black',
  'Brooks apartment — kitchen and closets': 'white lacquer, quartz, oak, brass',
  'Foster living room': 'walnut, linen, olive, brass',
  'Price penthouse interiors': 'marble, walnut, brass, velvet',
};
// [caption, Unsplash photo id] per project (free Unsplash images, linked as Unsplash asks).
export const PHOTOS = {
  'Carter house — full interiors': [['Primary closet built-ins, reference', '1760072513393-b9d81f65dd7e'], ['Living room, oak and brass', '1787390629829-abb32b3025c5'], ['Living room concept', '1745429523617-0d837856ca35']],
  'Northbridge office fit-out, 40 seats': [['Glass partitions, reference', '1497366754035-f200968a6e72'], ['Workstation area', '1497366811353-6870744d04b2']],
  'Brewnest coffee bar, South Lamar': [['Pendant lights, first location', '1511081692775-05d0f180a065'], ['Curved counter concept', '1567880905822-56f8e06fe630']],
  'Brooks apartment — kitchen and closets': [['Closet doors, reference', '1752407828514-660d6945d392'], ['Kitchen render', '1745429523635-ad375f836bf2']],
  'Nguyen dental clinic': [['Operatory layout, reference', '1704455306251-b4634215d98f']],
  'Foster living room': [['Living room, handed over', '1745429523637-60f5986cc1db']],
  'Price penthouse interiors': [['Lounge, city view', '1760611655987-d348d6d28174'], ['Living room concept', '1758448755778-90ebf4d0f1e7']],
};
export const VISITS = [
  ['Carter house — full interiors', -3, 'David Chen', 'Paint finish checked in the living room; touch-ups needed near the stair railing.'],
  ['Carter house — full interiors', -17, 'Sarah Mitchell', 'Client walk-through; approved brass pulls for the closets.'],
  ['Northbridge office fit-out, 40 seats', -2, 'David Chen', 'Partition glass set; cable trays still pending from the electrician.'],
  ['Brewnest coffee bar, South Lamar', -6, 'Sarah Mitchell', 'Counter re-measured: 1-1/2 in wider for the espresso machine.'],
  ['Brooks apartment — kitchen and closets', -1, 'David Chen', 'Kitchen wall out of plumb by 1/2 in; cabinets to be scribed on site.'],
];

// [name, profession, pay_type, rate, joined (days ago)]
export const PEOPLE = [
  ['Carlos Ramirez', 'Lead carpenter', 'salary', 5200, 900], ['Mike Johnson', 'Carpenter', 'daily', 240, 600],
  ['Jake Turner', 'Site lead', 'salary', 4800, 700], ['Luis Hernandez', 'Finisher', 'daily', 210, 420],
  ['Tyler Brown', 'Shop helper', 'daily', 160, 200], ['Andre Williams', 'Installer', 'daily', 230, 350],
];

// [client, project or null, item, qty, status, started (days ago), due (days from now)]
export const ORDERS = [
  ['Michael & Jennifer Carter', 'Carter house — full interiors', 'Primary closet built-ins, oak veneer', 1, 'in_progress', 14, 6],
  ['Michael & Jennifer Carter', 'Carter house — full interiors', 'Dining table, 6-seat, solid walnut', 1, 'pending', 0, 15],
  ['Northbridge Consulting LLC', 'Northbridge office fit-out, 40 seats', 'Linear workstations, 4-seat module', 10, 'in_progress', 10, 5],
  ['Brewnest Coffee Co.', 'Brewnest coffee bar, South Lamar', 'Coffee bar counter with fluted front', 1, 'in_progress', 6, 3],
  ['Greenleaf Montessori School', null, 'Low activity tables, rounded edges', 12, 'pending', 0, 21],
  ['Ryan & Megan Foster', 'Foster living room', 'TV console and desk', 2, 'delivered', 95, -72],
  ['Kevin Brooks', 'Brooks apartment — kitchen and closets', 'Kitchen cabinet boxes, 14 units', 14, 'done', 12, -1],
  ['Jason & Amy Price', 'Price penthouse interiors', 'Walk-in closet, lacquered', 1, 'cancelled', 70, -40],
];
export const WORK = {
  'Carlos Ramirez': ['Primary closet built-ins, oak veneer', 'Coffee bar counter with fluted front'],
  'Mike Johnson': ['Linear workstations, 4-seat module', 'Primary closet built-ins, oak veneer'],
  'Luis Hernandez': ['Primary closet built-ins, oak veneer', 'Coffee bar counter with fluted front'],
  'Tyler Brown': ['Linear workstations, 4-seat module'],
  'Andre Williams': ['Linear workstations, 4-seat module', 'Coffee bar counter with fluted front'],
};
export const TASKS = ['Case assembly', 'Edge banding', 'Veneer pressing', 'Sanding and first coat', 'Hardware install', 'Door alignment'];
// [employee, days ago, amount, kind, description]
export const EXPENSES = [
  ['Jake Turner', -4, 85, 'expense', 'Mileage and parking for site visits'], ['Mike Johnson', -9, 300, 'advance', 'Advance against pay'],
  ['Tyler Brown', -12, 250, 'advance', 'Advance against pay'], ['Jake Turner', -38, 200, 'advance', 'Advance against pay'],
];
// [employee, gross, deductions, net, notes] for last calendar month
export const PAYROLL = [['Carlos Ramirez', 5200, 0, 5200, 'Paid by direct deposit'], ['Jake Turner', 4800, 200, 4600, 'Advance recovered']];

export const VENDORS = [
  ['Hill Country Plywood', 'Plywood and MDF', 'Birch plywood, 3/4 in and 1/2 in'], ['Lone Star Hardware', 'Hardware', 'Hinges, drawer slides, pulls'],
  ['Veneer Supply Co.', 'Laminates and veneers', 'Oak and walnut veneers'], ['Clearview Glass', 'Glass', 'Tempered glass for partitions'],
  ['Capitol Freight', 'Transport', 'Box truck and pickup, Austin and Round Rock'],
];
// [vendor, item, qty, rate, for project, for order, ordered (days ago), [delivered qty, days ago, returned]]
export const POS = [
  ['Hill Country Plywood', 'Birch plywood 3/4 in (4x8)', 40, 62, 'Carter house — full interiors', 'Primary closet built-ins, oak veneer', 18, [[25, 15, 0], [15, 8, 1]]],
  ['Hill Country Plywood', 'Birch plywood 3/4 in (4x8)', 60, 60, 'Northbridge office fit-out, 40 seats', 'Linear workstations, 4-seat module', 12, [[40, 9, 0]]],
  ['Veneer Supply Co.', 'Oak veneer sheet (4x8)', 30, 85, 'Carter house — full interiors', 'Primary closet built-ins, oak veneer', 16, [[30, 12, 2]]],
  ['Lone Star Hardware', 'Soft-close hinges (pair)', 120, 6.5, 'Carter house — full interiors', null, 10, [[120, 7, 0]]],
  ['Clearview Glass', '1/2 in tempered glass panel', 14, 310, 'Northbridge office fit-out, 40 seats', null, 20, [[14, 11, 0]]],
  ['Veneer Supply Co.', 'Fluted MDF panel', 18, 95, 'Brewnest coffee bar, South Lamar', 'Coffee bar counter with fluted front', 5, []],
];
export const TRANSPORTER = 'Capitol Freight';
export const RATES = [['East Austin', 'Westlake Hills', 180], ['East Austin', 'Downtown', 160], ['East Austin', 'Dripping Springs', 260]];
// [from, to, amount, days ago, PO index or null, notes]; the third is billed above the agreed rate on purpose.
export const FREIGHT = [
  ['East Austin', 'Westlake Hills', 180, 7, 0, 'Closet boxes to site'], ['East Austin', 'Downtown', 160, 5, 1, 'Workstation panels'],
  ['East Austin', 'Dripping Springs', 340, 3, null, 'Sample furniture for the ranch inquiry'],
];

// Every client payment in the cash book matches an invoice total to the cent.
// [client, project, company, no, title, submitted (days ago, null = draft), due (days from now), terms, status, items [desc, code, qty, unit, tax %]]
export const INVOICES = [
  ['Michael & Jennifer Carter', 'Carter house — full interiors', 'savistar', 'AI-2026-009', 'Interior design and build — phase 1', -45, -38, 'Due on phase completion', 'paid',
    [['Design and project management fee, phase 1', '', 1, 12000, 0], ['Millwork materials, phase 1', '', 1, 9200, TX]]], // $21,959.00
  ['Brewnest Coffee Co.', 'Brewnest coffee bar, South Lamar', 'savistar', 'AI-2026-011', 'Deposit — counter and seating', -27, -26, 'Deposit', 'paid',
    [['Deposit for counter and seating fabrication', '', 1, 10000, TX]]], // $10,825.00
  ['Michael & Jennifer Carter', 'Carter house — full interiors', 'savistar', 'AI-2026-014', 'Interior design and build — phase 2', -10, 5, 'Due on phase completion', 'sent',
    [['Design and project management fee, phase 2', '', 1, 18500, 0], ['Ceiling, paint and finish work', '', 1, 34200, 0]]], // $52,700.00 outstanding
  ['Ryan & Megan Foster', 'Foster living room', 'saag', 'AF-2026-031', 'TV console and desk', -70, -55, 'Due on delivery', 'paid',
    [['TV console, walnut veneer, 96 in', '', 1, 4000, TX], ['Desk with drawers', '', 1, 1600, TX]]], // $6,062.00
  ['Northbridge Consulting LLC', 'Northbridge office fit-out, 40 seats', 'saag', 'AF-2026-033', 'Mobilization deposit', -31, -24, 'Deposit', 'paid',
    [['Mobilization deposit, 40-seat office fit-out', '', 1, 25000, 0]]], // $25,000.00
  ['Northbridge Consulting LLC', 'Northbridge office fit-out, 40 seats', 'saag', 'AF-2026-036', 'Workstations — first lot', null, 14, 'Net 30', 'draft',
    [['Linear workstation, 4-seat module', '', 5, 6400, TX]]],
];
// [date, kind, amount, party, party type, description, by]
export const cash = (day, payDay) => [
  [day(-62), 'credit', 6062, 'Ryan & Megan Foster', 'client', 'Final payment, invoice AF-2026-031', 'owner'],
  [day(-41), 'credit', 21959, 'Michael & Jennifer Carter', 'client', 'Phase 1 payment, invoice AI-2026-009', 'owner'],
  [day(-30), 'credit', 25000, 'Northbridge Consulting LLC', 'client', 'Mobilization deposit, invoice AF-2026-033', 'owner'],
  [day(-26), 'credit', 10825, 'Brewnest Coffee Co.', 'client', 'Deposit, invoice AI-2026-011', 'owner'],
  [day(-15), 'debit', 1550, 'Hill Country Plywood', 'vendor', 'Plywood, first delivery', 'manager'],
  [payDay, 'debit', 9800, 'Payroll', null, 'Monthly salaries', 'owner'],
  [day(-11), 'debit', 4340, 'Clearview Glass', 'vendor', 'Partition glass', 'manager'],
  [day(-8), 'debit', 780, 'Lone Star Hardware', 'vendor', 'Hinges', 'manager'],
  [day(-7), 'debit', 180, 'Capitol Freight', 'vendor', 'Freight, East Austin to Westlake Hills', 'office'],
  [day(-5), 'debit', 160, 'Capitol Freight', 'vendor', 'Freight, East Austin to Downtown', 'office'],
  [day(-4), 'debit', 145, 'Shop', null, 'Sandpaper, glue and finish', 'office'],
  [day(-2), 'debit', 45, 'Office', null, 'Coffee and shipping', 'office'],
];

// [client, project or null, days ago, by, message]
export const CONVERSATIONS = [
  ['Michael & Jennifer Carter', 'Carter house — full interiors', 70, 'owner', 'Kickoff at the house. Jennifer wants warm oak throughout, brass accents only in the dining room.'],
  ['Michael & Jennifer Carter', 'Carter house — full interiors', 17, 'owner', 'Walk-through done. Brass pulls approved for the closets; dining table changed to walnut.'],
  ['Michael & Jennifer Carter', 'Carter house — full interiors', 3, 'manager', 'Texted the paint touch-up schedule; Michael confirmed Saturday access.'],
  ['Northbridge Consulting LLC', 'Northbridge office fit-out, 40 seats', 38, 'owner', 'Layout signed off by their office manager. Both conference rooms need acoustic panels.'],
  ['Northbridge Consulting LLC', 'Northbridge office fit-out, 40 seats', 2, 'manager', 'Electrician is late on cable trays; told them workstations move by two days.'],
  ['Brewnest Coffee Co.', 'Brewnest coffee bar, South Lamar', 25, 'owner', 'Concept board approved. Same terrazzo as the first location; fluted counter front.'],
  ['Brewnest Coffee Co.', 'Brewnest coffee bar, South Lamar', 6, 'owner', 'New espresso machine is 1-1/2 in wider; counter drawing to be revised.'],
  ['Kevin Brooks', 'Brooks apartment — kitchen and closets', 19, 'manager', 'Measurements taken. Kevin needs the kitchen working before Thanksgiving guests arrive.'],
  ['Dr. Lisa Nguyen', 'Nguyen dental clinic', 30, 'owner', 'On hold: the landlord wants to approve the plans before any work in the suite.'],
  ['Ryan & Megan Foster', 'Foster living room', 64, 'owner', 'Handover done; Megan asked about a matching entry bench later this year.'],
  ['Jason & Amy Price', 'Price penthouse interiors', 58, 'owner', 'Jason is relocating to Denver for work; project canceled after design. Design fee settled.'],
  ['Tom Walker', null, 9, 'owner', 'First call: ranch house refurbishment, four rooms and a porch. Waiting on his budget.'],
  ['Greenleaf Montessori School', null, 14, 'manager', 'Head of school wants rounded edges and a non-toxic finish on all tables; sample to be shown.'],
];

// [title, due (days from now), assigned to, client, done]
export const TASK_LIST = [
  ['Confirm pull finish with the Carters', 0, 'manager', 'Michael & Jennifer Carter', false], ['Send revised counter drawing to Brewnest', 1, 'owner', 'Brewnest Coffee Co.', false],
  ['Collect check from Northbridge', 3, 'office', 'Northbridge Consulting LLC', false], ['Follow up on the ranch budget', 2, 'owner', 'Tom Walker', false],
  ['Book glass delivery slot', -1, 'manager', null, true], ['Landlord approval for the Nguyen clinic', 7, 'manager', 'Dr. Lisa Nguyen', false],
  ['Mail phase 2 invoice copy to the Carters', 0, 'office', 'Michael & Jennifer Carter', false], ['File plywood bills from the site', -3, 'office', null, true],
];
