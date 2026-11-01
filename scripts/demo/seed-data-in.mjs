// India demo data (Acme Interiors + Acme Furniture, Ahmedabad) for scripts/demo/seed.mjs. Moved here unchanged
// from seed.mjs; the North American demo's data is seed-data-us.mjs (MARKET=NA).
export const LABEL = 'Acme Interiors / Acme Furniture';
export const USERS = [['owner', 'owner', 'Meera Shah', '#8b5cf6'], ['manager', 'manager', 'Rohan Desai', '#06b6d4'], ['office', 'user', 'Kavya Patel', '#ec4899']];
export const phone = (n) => `9999900${n}`; // 99999 000xx, so none can belong to a real person
export const PROJECT_NOTES = 'Site supervisor: Imran.';
export const PO_NOTE = 'Delivery to workshop, Vatva';
export const TAX_PCT = 18; // GST on every invoice line
// [employee, days ago, amount, kind, description]
export const EXPENSES = [
  ['Imran Shaikh', -4, 1450, 'expense', 'Auto and parking for site visits'], ['Suresh Chauhan', -9, 3000, 'advance', 'Advance against salary'],
  ['Dinesh Parmar', -12, 1500, 'advance', 'Advance against salary'], ['Imran Shaikh', -38, 1000, 'advance', 'Advance against salary'],
];
// [employee, gross, deductions, net, notes] for last calendar month
export const PAYROLL = [['Ramesh Prajapati', 32000, 0, 32000, 'Paid by bank transfer'], ['Imran Shaikh', 28000, 1000, 27000, 'Advance recovered']];
export const TRANSPORTER = 'Sardar Transport';
export const RATES = [['Vatva', 'Bodakdev', 1800], ['Vatva', 'Satellite', 1600], ['Vatva', 'Gandhinagar', 2600]];
// [from, to, amount, days ago, PO index or null, notes]; the third is billed above the agreed rate on purpose.
export const FREIGHT = [
  ['Vatva', 'Bodakdev', 1800, 7, 0, 'Wardrobe carcasses to site'], ['Vatva', 'Satellite', 1600, 5, 1, 'Workstation panels'],
  ['Vatva', 'Gandhinagar', 3400, 3, null, 'Sample furniture for farmhouse enquiry'],
];

export const CLIENTS = [
  ['Anand & Priya Mehta', '9999900101', 'Bungalow 14, Green Meadows, Bodakdev', '3BHK bungalow, full interiors; prefers warm oak and brass.'],
  ['Kiran Joshi', '9999900102', 'B-902, Sky Heights, Prahlad Nagar', 'Kitchen and wardrobes only; tight timeline before Diwali.'],
  ['Brewnest Cafe LLP', '9999900103', 'Ground floor, Sindhu Bhavan Road', 'Second outlet; same palette as their first cafe.'],
  ['Northbridge Consultants Pvt Ltd', '9999900104', '7th floor, Northbridge House, Satellite', 'Office fit-out for 40 seats, two meeting rooms.'],
  ['Dr. Nisha Trivedi', '9999900105', 'Clinic, Navrangpura', 'Dental clinic reception and two cabins.'],
  ['Sahil & Ritu Kapadia', '9999900106', 'A-301, Riverview Residency, Usmanpura', 'Living room and study; furniture only.'],
  ['Greenleaf Montessori', '9999900107', 'Thaltej', 'Child-safe furniture for three classrooms.'],
  ['Vikram Rathod', '9999900108', 'Farmhouse, Gandhinagar Highway', 'Enquiry: farmhouse refurbishment, budget pending.'],
  ['Harsh & Komal Vora', '9999900109', 'Penthouse, Lake View Towers, Vastrapur', 'Penthouse interiors; cancelled after design stage (moved city).'],
];

export const PROJECTS = [
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'active', 75, [['Design sign-off', -60, true], ['Civil and electrical done', -30, true], ['False ceiling and paint', -5, true], ['Furniture installation', 10, false], ['Handover', 25, false]]],
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 'active', 40, [['Layout approved', -32, true], ['Partitions and ceiling', -8, true], ['Workstations installed', 6, false], ['Handover', 20, false]]],
  ['Brewnest Cafe LLP', 'Brewnest cafe, Sindhu Bhavan Road', 'active', 28, [['Concept board approved', -20, true], ['Counter and seating fabrication', 3, false], ['Opening', 18, false]]],
  ['Kiran Joshi', 'Joshi apartment — kitchen and wardrobes', 'active', 20, [['Measurements', -18, true], ['Kitchen carcass install', 4, false], ['Shutters and hardware', 12, false]]],
  ['Dr. Nisha Trivedi', 'Trivedi dental clinic', 'on_hold', 50, [['Design sign-off', -35, true], ['Approval from society', 30, false]]],
  ['Sahil & Ritu Kapadia', 'Kapadia living room', 'completed', 120, [['Design sign-off', -110, true], ['Installation', -70, true], ['Handover', -65, true]]],
  ['Harsh & Komal Vora', 'Vora penthouse interiors', 'cancelled', 90, [['Concept presentation', -80, true], ['Design sign-off', -60, false]]],
];

export const MATERIALS = {
  'Mehta bungalow — full interiors': 'warm oak, brass, teak, ivory',
  'Northbridge office fit-out, 40 seats': 'ash, charcoal, glass, steel',
  'Brewnest cafe, Sindhu Bhavan Road': 'terrazzo, cane, sage, black',
  'Joshi apartment — kitchen and wardrobes': 'white lacquer, quartz, oak, brass',
  'Kapadia living room': 'teak, linen, olive, brass',
  'Vora penthouse interiors': 'marble, walnut, brass, velvet',
};

export const PHOTOS = {
  "Mehta bungalow — full interiors": [["Master bedroom wardrobe, reference", "1760072513393-b9d81f65dd7e"], ["Living room, oak and brass", "1787390629829-abb32b3025c5"], ["Living room concept", "1745429523617-0d837856ca35"]],
  "Northbridge office fit-out, 40 seats": [["Glass partitions, reference", "1497366754035-f200968a6e72"], ["Workstation zone", "1497366811353-6870744d04b2"]],
  "Brewnest cafe, Sindhu Bhavan Road": [["Pendant lights, first outlet", "1511081692775-05d0f180a065"], ["Curved counter concept", "1567880905822-56f8e06fe630"]],
  "Joshi apartment — kitchen and wardrobes": [["Wardrobe shutters, reference", "1752407828514-660d6945d392"], ["Kitchen render", "1745429523635-ad375f836bf2"]],
  "Trivedi dental clinic": [["Cabin layout, reference", "1704455306251-b4634215d98f"]],
  "Kapadia living room": [["Living room, handed over", "1745429523637-60f5986cc1db"]],
  "Vora penthouse interiors": [["Lounge, city view", "1760611655987-d348d6d28174"], ["Living room concept", "1758448755778-90ebf4d0f1e7"]],
};

export const VISITS = [
  ['Mehta bungalow — full interiors', -3, 'Rohan Desai', 'Paint finish checked in living room; touch-ups needed near stair railing.'],
  ['Mehta bungalow — full interiors', -17, 'Meera Shah', 'Client walk-through; approved brass handles for wardrobes.'],
  ['Northbridge office fit-out, 40 seats', -2, 'Rohan Desai', 'Partition glass fixed; cable trays pending from electrician.'],
  ['Brewnest cafe, Sindhu Bhavan Road', -6, 'Meera Shah', 'Counter dimensions re-measured: +40 mm for coffee machine.'],
  ['Joshi apartment — kitchen and wardrobes', -1, 'Rohan Desai', 'Kitchen wall uneven by 12 mm; carcass to be scribed on site.'],
];

export const PEOPLE = [
  ['Ramesh Prajapati', 'Carpenter (head)', 'salary', 32000, 900], ['Suresh Chauhan', 'Carpenter', 'daily', 950, 600],
  ['Imran Shaikh', 'Site supervisor', 'salary', 28000, 700], ['Mahesh Solanki', 'Polish and finishing', 'daily', 850, 420],
  ['Dinesh Parmar', 'Helper', 'daily', 600, 200], ['Javed Mansuri', 'Fitter', 'daily', 900, 350],
];

export const ORDERS = [
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'Master bedroom wardrobe, oak veneer', 1, 'in_progress', 14, 6],
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'Dining table, 6-seater, solid teak', 1, 'pending', 0, 15],
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 'Linear workstations, 4-seater module', 10, 'in_progress', 10, 5],
  ['Brewnest Cafe LLP', 'Brewnest cafe, Sindhu Bhavan Road', 'Cafe counter with fluted front', 1, 'in_progress', 6, 3],
  ['Greenleaf Montessori', null, 'Low activity tables, rounded edges', 12, 'pending', 0, 21],
  ['Sahil & Ritu Kapadia', 'Kapadia living room', 'TV unit and study table', 2, 'delivered', 95, -72],
  ['Kiran Joshi', 'Joshi apartment — kitchen and wardrobes', 'Kitchen carcasses, 14 units', 14, 'done', 12, -1],
  ['Harsh & Komal Vora', 'Vora penthouse interiors', 'Walk-in wardrobe, lacquered', 1, 'cancelled', 70, -40],
];

export const WORK = {
  'Ramesh Prajapati': ['Master bedroom wardrobe, oak veneer', 'Cafe counter with fluted front'],
  'Suresh Chauhan': ['Linear workstations, 4-seater module', 'Master bedroom wardrobe, oak veneer'],
  'Mahesh Solanki': ['Master bedroom wardrobe, oak veneer', 'Cafe counter with fluted front'],
  'Dinesh Parmar': ['Linear workstations, 4-seater module'],
  'Javed Mansuri': ['Linear workstations, 4-seater module', 'Cafe counter with fluted front'],
};

export const TASKS = ['Carcass assembly', 'Edge banding', 'Veneer pressing', 'Sanding and first coat', 'Hardware fitting', 'Shutter alignment'];

export const VENDORS = [
  ['Shree Plywood Traders', 'Plywood and MDF', 'BWP plywood, 18 mm and 12 mm'], ['Kalpana Hardware', 'Hardware', 'Hinges, channels, handles'],
  ['Laminate House', 'Laminates and veneers', 'Oak and walnut veneers'], ['Crystal Glass Works', 'Glass', 'Toughened glass for partitions'],
  ['Sardar Transport', 'Transport', 'Tempo and pickup, Ahmedabad and Gandhinagar'],
];

export const POS = [
  ['Shree Plywood Traders', 'BWP plywood 18 mm (8x4)', 40, 2650, 'Mehta bungalow — full interiors', 'Master bedroom wardrobe, oak veneer', 18, [[25, 15, 0], [15, 8, 1]]],
  ['Shree Plywood Traders', 'BWP plywood 18 mm (8x4)', 60, 2600, 'Northbridge office fit-out, 40 seats', 'Linear workstations, 4-seater module', 12, [[40, 9, 0]]],
  ['Laminate House', 'Oak veneer sheet', 30, 1850, 'Mehta bungalow — full interiors', 'Master bedroom wardrobe, oak veneer', 16, [[30, 12, 2]]],
  ['Kalpana Hardware', 'Soft-close hinges (pair)', 120, 240, 'Mehta bungalow — full interiors', null, 10, [[120, 7, 0]]],
  ['Crystal Glass Works', '12 mm toughened glass panel', 14, 6800, 'Northbridge office fit-out, 40 seats', null, 20, [[14, 11, 0]]],
  ['Laminate House', 'Fluted MDF panel', 18, 2200, 'Brewnest cafe, Sindhu Bhavan Road', 'Cafe counter with fluted front', 5, []],
];

export const INVOICES = [
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'savistar', 'AI/26-27/009', 'Interior design and execution — stage 1', -45, -38, '50% on stage completion', 'paid',
    [['Design and supervision fee, stage 1', '998391', 1, 120000], ['Civil and electrical works', '995461', 1, 92000]]], // 2,50,160
  ['Brewnest Cafe LLP', 'Brewnest cafe, Sindhu Bhavan Road', 'savistar', 'AI/26-27/011', 'Advance — counter and seating', -27, -26, 'Advance', 'paid',
    [['Advance against counter and seating fabrication', '995461', 1, 100000]]], // 1,18,000
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 'savistar', 'AI/26-27/014', 'Interior design and execution — stage 2', -10, 5, '50% on stage completion', 'sent',
    [['Design and supervision fee, stage 2', '998391', 1, 185000], ['False ceiling and painting works', '995461', 1, 342000]]], // 6,21,860 outstanding
  ['Sahil & Ritu Kapadia', 'Kapadia living room', 'saag', 'AF/26-27/031', 'TV unit and study table', -70, -55, 'On delivery', 'paid',
    [['TV unit, walnut veneer, 2400 mm', '9403', 1, 96000], ['Study table with drawers', '9403', 1, 38000]]], // 1,58,120
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 'saag', 'AF/26-27/033', 'Mobilisation advance', -31, -24, 'Advance', 'paid',
    [['Mobilisation advance, 40-seat office fit-out', '9403', 1, 250000]]], // 2,95,000
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 'saag', 'AF/26-27/036', 'Workstations — first lot', null, 14, '30 days', 'draft',
    [['Linear workstation, 4-seater module', '9403', 5, 64000]]],
];

export const CONVERSATIONS = [
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 70, 'owner', 'Kick-off at site. Priya wants warm oak throughout, brass accents only in the dining area.'],
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 17, 'owner', 'Walk-through done. Brass handles approved for wardrobes; dining table moved to teak.'],
  ['Anand & Priya Mehta', 'Mehta bungalow — full interiors', 3, 'manager', 'Shared paint touch-up schedule on WhatsApp; Anand confirmed Saturday access.'],
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 38, 'owner', 'Layout signed off by their admin head. Two meeting rooms need acoustic panels.'],
  ['Northbridge Consultants Pvt Ltd', 'Northbridge office fit-out, 40 seats', 2, 'manager', 'Electrician delay on cable trays; told them workstations shift by two days.'],
  ['Brewnest Cafe LLP', 'Brewnest cafe, Sindhu Bhavan Road', 25, 'owner', 'Concept board approved. Same terrazzo as the first outlet; fluted counter front.'],
  ['Brewnest Cafe LLP', 'Brewnest cafe, Sindhu Bhavan Road', 6, 'owner', 'New coffee machine is 40 mm wider; counter drawing to be revised.'],
  ['Kiran Joshi', 'Joshi apartment — kitchen and wardrobes', 19, 'manager', 'Measurements taken. Kiran needs the kitchen working before Diwali guests arrive.'],
  ['Dr. Nisha Trivedi', 'Trivedi dental clinic', 30, 'owner', 'On hold: society wants an NOC before any work in the commercial wing.'],
  ['Sahil & Ritu Kapadia', 'Kapadia living room', 64, 'owner', 'Handover done; Ritu asked about a matching shoe cabinet later in the year.'],
  ['Harsh & Komal Vora', 'Vora penthouse interiors', 58, 'owner', 'Harsh is relocating to Pune for work; project cancelled after design. Concept fee settled.'],
  ['Vikram Rathod', null, 9, 'owner', 'First call: farmhouse refurbishment, 4 rooms and a verandah. Waiting on his budget.'],
  ['Greenleaf Montessori', null, 14, 'manager', 'Principal wants rounded edges and non-toxic finish on all tables; sample to be shown.'],
];

export const TASK_LIST = [
  ['Confirm handle finish with Mehta family', 0, 'manager', 'Anand & Priya Mehta', false], ['Send revised counter drawing to Brewnest', 1, 'owner', 'Brewnest Cafe LLP', false],
  ['Collect cheque from Northbridge', 3, 'office', 'Northbridge Consultants Pvt Ltd', false], ['Follow up farmhouse budget', 2, 'owner', 'Vikram Rathod', false],
  ['Book glass delivery slot', -1, 'manager', null, true], ['Society NOC for Trivedi clinic', 7, 'manager', 'Dr. Nisha Trivedi', false],
  ['Courier stage 2 invoice copy to Mehta family', 0, 'office', 'Anand & Priya Mehta', false], ['File plywood bills from site', -3, 'office', null, true],
];


export const cash = (day, payDay) => [
  [day(-62), 'credit', 158120, 'Sahil & Ritu Kapadia', 'client', 'Final payment, invoice AF/26-27/031', 'owner'],
  [day(-41), 'credit', 250160, 'Anand & Priya Mehta', 'client', 'Stage 1 payment, invoice AI/26-27/009', 'owner'],
  [day(-30), 'credit', 295000, 'Northbridge Consultants Pvt Ltd', 'client', 'Mobilisation advance, invoice AF/26-27/033', 'owner'],
  [day(-26), 'credit', 118000, 'Brewnest Cafe LLP', 'client', 'Advance, invoice AI/26-27/011', 'owner'],
  [day(-15), 'debit', 66250, 'Shree Plywood Traders', 'vendor', 'Plywood, first delivery', 'manager'],
  [payDay, 'debit', 59000, 'Payroll', null, 'Monthly salaries', 'owner'],
  [day(-11), 'debit', 95200, 'Crystal Glass Works', 'vendor', 'Partition glass', 'manager'],
  [day(-8), 'debit', 28800, 'Kalpana Hardware', 'vendor', 'Hinges', 'manager'],
  [day(-7), 'debit', 1800, 'Sardar Transport', 'vendor', 'Freight, Vatva to Bodakdev', 'office'],
  [day(-5), 'debit', 1600, 'Sardar Transport', 'vendor', 'Freight, Vatva to Satellite', 'office'],
  [day(-4), 'debit', 2350, 'Workshop', null, 'Sandpaper, glue and fevicol', 'office'],
  [day(-2), 'debit', 780, 'Office', null, 'Tea and courier', 'office'],
];
