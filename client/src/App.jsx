import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Login from './pages/auth/Login';

// Super Admin
const SuperAdminDashboard = lazy(() => import('./pages/super-admin/SuperAdminDashboard'));
const Organizations        = lazy(() => import('./pages/super-admin/Organizations'));

// Management — shared by ORG_ADMIN and HR
const ManagementDashboard = lazy(() => import('./pages/management/dashboard/ManagementDashboard'));
const Workforce           = lazy(() => import('./pages/management/workforce/Workforce'));
const Clients             = lazy(() => import('./pages/management/clients/Clients'));
const Placements          = lazy(() => import('./pages/management/placements/Placements'));
const Timesheets          = lazy(() => import('./pages/management/timesheets/Timesheets'));
const Organisation        = lazy(() => import('./pages/management/organisation/Organisation'));

// ORG_ADMIN only
const Invoices        = lazy(() => import('./pages/management/invoices/Invoices'));
const InvoiceSettings = lazy(() => import('./pages/management/invoices/InvoiceSettingsModal'));
const BalanceSheet    = lazy(() => import('./pages/management/balancesheet/BalanceSheet'));
const Payroll         = lazy(() => import('./pages/management/payroll/Payroll'));
const Reconcile       = lazy(() => import('./pages/management/reconcile/Reconcile'));

// Employee Portal
const EmployeeDashboard   = lazy(() => import('./pages/portal/dashboard/EmployeeDashboard'));
const EmployeeTimesheets  = lazy(() => import('./pages/portal/timesheets/EmployeeTimesheets'));
const EmployeeBalanceSheet = lazy(() => import('./pages/portal/balancesheet/EmployeeBalanceSheet'));
const EmployeePlacements  = lazy(() => import('./pages/portal/placements/EmployeePlacements'));

const PageLoader = () => (
    <div className="flex items-center justify-center flex-1 h-full min-h-75">
        <div className="flex flex-col items-center gap-3">
            <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--brand-primary)', borderTopColor: 'transparent' }} />
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Loading…</p>
        </div>
    </div>
);

const ProtectedRoute = ({ children, allowedRoles }) => {
    const role = localStorage.getItem('userRole');
    if (!role) return <Navigate to="/" replace />;
    if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/" replace />;
    return children;
};

const route = (Component, allowedRoles) => (
    <ProtectedRoute allowedRoles={allowedRoles}>
        <Layout>
            <Suspense fallback={<PageLoader />}>
                <Component />
            </Suspense>
        </Layout>
    </ProtectedRoute>
);

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Login />} />

                {/* Super Admin */}
                <Route path="/super-admin/dashboard"     element={route(SuperAdminDashboard, ['SUPER_ADMIN'])} />
                <Route path="/super-admin/organizations" element={route(Organizations,        ['SUPER_ADMIN'])} />

                {/* Management — shared by ORG_ADMIN, HR, ACCOUNTANT */}
                <Route path="/management/dashboard"  element={route(ManagementDashboard, ['ORG_ADMIN', 'HR', 'ACCOUNTANT'])} />
                <Route path="/management/workforce"  element={route(Workforce,           ['ORG_ADMIN', 'HR', 'ACCOUNTANT'])} />
                <Route path="/management/clients"    element={route(Clients,             ['ORG_ADMIN', 'HR', 'ACCOUNTANT'])} />
                <Route path="/management/placements" element={route(Placements,          ['ORG_ADMIN', 'HR', 'ACCOUNTANT'])} />
                <Route path="/management/timesheets" element={route(Timesheets,          ['ORG_ADMIN', 'HR', 'ACCOUNTANT'])} />

                {/* ORG_ADMIN + ACCOUNTANT */}
                <Route path="/management/invoice-settings" element={route(InvoiceSettings, ['ORG_ADMIN', 'ACCOUNTANT'])} />
                <Route path="/management/invoices"         element={route(Invoices,         ['ORG_ADMIN', 'ACCOUNTANT'])} />
                <Route path="/management/payroll"          element={route(Payroll,          ['ORG_ADMIN', 'ACCOUNTANT'])} />
                <Route path="/management/reconcile"        element={route(Reconcile,        ['ORG_ADMIN'])} />
                <Route path="/management/balance-sheet"    element={route(BalanceSheet,     ['ORG_ADMIN', 'ACCOUNTANT'])} />
                <Route path="/management/organisation"     element={route(Organisation,     ['ORG_ADMIN'])} />

                {/* Employee Portal */}
                <Route path="/portal/dashboard"     element={route(EmployeeDashboard,    ['EMPLOYEE'])} />
                <Route path="/portal/placements"    element={route(EmployeePlacements,   ['EMPLOYEE'])} />
                <Route path="/portal/timesheets"    element={route(EmployeeTimesheets,   ['EMPLOYEE'])} />
                <Route path="/portal/balance-sheet" element={route(EmployeeBalanceSheet, ['EMPLOYEE'])} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    );
}

export default App;
