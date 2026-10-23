import {
  LayoutDashboardIcon, ContactRoundIcon, ReceiptTextIcon, DraftingCompassIcon, ArmchairIcon, HardHatIcon, TruckIcon, WalletIcon, SettingsIcon,
} from 'lucide-react';

// The app's sections: nav tabs (components/Nav.jsx) and the icon beside each page title
// (components/page-title.jsx). Grouped the way the business is: the studio's side, the
// workshop's side, then money; the desktop bar draws a divider where `group` changes. On a phone
// the `mobile` ones are tabs and the rest sit under More.
export const LINKS = [
  { href: '/', label: 'Home', icon: LayoutDashboardIcon, group: 'home', mobile: true },
  { href: '/clients', label: 'Clients', icon: ContactRoundIcon, group: 'studio', mobile: true },
  { href: '/quotes', label: 'Quotes', icon: ReceiptTextIcon, group: 'studio' },
  { href: '/projects', label: 'Projects', icon: DraftingCompassIcon, group: 'studio', mobile: true },
  { href: '/orders', label: 'Orders', icon: ArmchairIcon, group: 'workshop', mobile: true },
  { href: '/people', label: 'People', icon: HardHatIcon, group: 'workshop' },
  { href: '/vendors', label: 'Vendors', icon: TruckIcon, group: 'workshop' },
  { href: '/finance', label: 'Finance', icon: WalletIcon, group: 'money' },
];

// The section a path belongs to (/projects/12 → Projects). Settings isn't a tab but has a title.
export function sectionFor(pathname) {
  if (pathname.startsWith('/settings')) return { href: '/settings', label: 'Settings', icon: SettingsIcon };
  return LINKS.find(l => l.href !== '/' && pathname.startsWith(l.href));
}
