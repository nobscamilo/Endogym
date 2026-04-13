import DashboardPage from '../../components/DashboardPage.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dashboard',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    noarchive: true,
  },
};

export default function DashboardRoutePage() {
  return <DashboardPage />;
}
