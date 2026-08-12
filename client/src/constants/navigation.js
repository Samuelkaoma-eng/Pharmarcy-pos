import {
  LayoutDashboard, ShoppingCart, Package, Users, UsersRound, Activity, FileText,
  History, Bot, Settings, Truck, HeartHandshake, Wallet, FileSpreadsheet
} from 'lucide-react';

// The workspace's pages and who may open them.
//
// This list is the single declaration of that. It was previously held inside
// the sidebar, which used it to decide what to *draw* — so the navigation hid
// what a role could not use while the router still rendered it to anyone who
// typed the address. A cashier could open Staff & Roles and read the whole
// staff list, or open Site Settings, simply by navigating there directly.
//
// The server refuses the actions regardless, and that is the guarantee. This is
// the second line: a page a role has no business seeing should not be reachable
// by knowing its URL, and the menu and the router must not be able to disagree
// about which those are.
export const NAV_ITEMS = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/pos', icon: ShoppingCart, label: 'POS Checkout', roles: ['Admin', 'Pharmacist', 'Cashier'] },
  { path: '/inventory', icon: Package, label: 'Inventory', roles: ['Admin', 'Pharmacist'] },
  { path: '/patients', icon: Users, label: 'Patients', roles: ['Admin', 'Pharmacist', 'Doctor'] },
  { path: '/triage', icon: Activity, label: 'Triage Queue', roles: ['Admin', 'Pharmacist', 'Doctor'] },
  { path: '/prescriptions', icon: FileText, label: 'Prescriptions', roles: ['Admin', 'Pharmacist', 'Doctor'] },
  { path: '/sales', icon: History, label: 'Sales History', roles: ['Admin', 'Pharmacist', 'Cashier'] },
  { path: '/till', icon: Wallet, label: 'Till Sessions', roles: ['Admin', 'Pharmacist', 'Cashier'] },
  { path: '/reports', icon: FileSpreadsheet, label: 'Reports', roles: ['Admin'] },
  { path: '/procurement', icon: Truck, label: 'Procurement', roles: ['Admin', 'Pharmacist'] },
  { path: '/insurance', icon: HeartHandshake, label: 'Insurance', roles: ['Admin', 'Pharmacist'] },
  { path: '/agent', icon: Bot, label: 'Assistant' },
  { path: '/staff', icon: UsersRound, label: 'Staff & Roles', roles: ['Admin'] },
  { path: '/settings', icon: Settings, label: 'Site Settings', roles: ['Admin'] }
];

// An item with no `roles` is open to every signed-in member of the pharmacy.
export const canAccess = (path, role) => {
  const item = NAV_ITEMS.find((i) => i.path === path);
  if (!item) return true;
  return !item.roles || item.roles.includes(role);
};

// Where to send someone who asked for a page their role cannot open. The
// dashboard is open to everyone, so it is always a valid landing place.
export const HOME_PATH = '/dashboard';
