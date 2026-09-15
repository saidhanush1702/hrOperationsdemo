import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Login from './pages/auth/Login';
import Landing from './pages/landing/Landing';
import { PATHS } from './utils/constants';

// Platform (super admin)
const SuperAdminDashboard = lazy(() => import('./pages/super-admin/SuperAdminDashboard'));
const Organizations        = lazy(() => import('./pages/super-admin/Organizations'));

// Console — shared by ORG_ADMIN, HR and ACCOUNTANT
const ManagementDashboard = lazy(() => import('./pages/management/dashboard/ManagementDashboard'));
const Workforce           = lazy(() => import('./pages/management/workforce/Workforce'));
const Clients             = lazy(() => import('./pages/management/clients/Clients'));
const Placements          = lazy(() => import('./pages/management/placements/Placements'));
const Timesheets          = lazy(() => import('./pages/management/timesheets/Timesheets'));
const Organisation        = lazy(() => import('./pages/management/organisation/Organisation'));

// Money
const Invoices        = lazy(() => import('./pages/management/invoices/Invoices'));
const InvoiceSettings = lazy(() => import('./pages/management/invoices/InvoiceSettingsModal'));
const BalanceSheet    = lazy(() => import('./pages/management/balancesheet/BalanceSheet'));
const Payroll         = lazy(() => import('./pages/management/payroll/Payroll'));
const Reconcile       = lazy(() => import('./pages/management/reconcile/Reconcile'));

// Consultant portal
const EmployeeDashboard    = lazy(() => import('./pages/portal/dashboard/EmployeeDashboard'));
const EmployeeTimesheets   = lazy(() => import('./pages/portal/timesheets/EmployeeTimesheets'));
const EmployeeBalanceSheet = lazy(() => import('./pages/portal/balancesheet/EmployeeBalanceSheet'));
const EmployeePlacements   = lazy(() => import('./pages/portal/placements/EmployeePlacements'));

const PageLoader = () => (
    <div className="flex items-center justify-center flex-1 h-full min-h-75">
        <div className="flex flex-col items-center gap-4">
            <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-full opacity-25" style={{ border: '2px solid var(--brand-primary)' }} />
                <div className="absolute inset-0 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: 'var(--brand-primary)', borderRightColor: 'var(--brand-secondary)' }} />
            </div>
            <p className="font-mono text-[11px] tracking-[0.25em]" style={{ color: 'var(--text-muted)' }}>LOADING</p>
        </div>
    </div>
);

const ProtectedRoute = ({ children, allowedRoles }) => {
    const role = localStorage.getItem('userRole');
    if (!role) return <Navigate to="/login" replace />;
    if (allowedRoles && !allowedRoles.includes(role)) return <Navigate to="/login" replace />;
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

const CONSOLE = ['ORG_ADMIN', 'HR', 'ACCOUNTANT'];
const MONEY   = ['ORG_ADMIN', 'ACCOUNTANT'];

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />

                {/* Platform */}
                <Route path={PATHS.platformOverview} element={route(SuperAdminDashboard, ['SUPER_ADMIN'])} />
                <Route path={PATHS.tenants}          element={route(Organizations,        ['SUPER_ADMIN'])} />

                {/* Console */}
                <Route path={PATHS.overview}    element={route(ManagementDashboard, CONSOLE)} />
                <Route path={PATHS.talent}      element={route(Workforce,           CONSOLE)} />
                <Route path={PATHS.partners}    element={route(Clients,             CONSOLE)} />
                <Route path={PATHS.engagements} element={route(Placements,          CONSOLE)} />
                <Route path={PATHS.timeLogs}    element={route(Timesheets,          CONSOLE)} />

                {/* Money */}
                <Route path={PATHS.billingRules} element={route(InvoiceSettings, MONEY)} />
                <Route path={PATHS.billing}      element={route(Invoices,        MONEY)} />
                <Route path={PATHS.payRuns}      element={route(Payroll,         MONEY)} />
                <Route path={PATHS.payAudit}     element={route(Reconcile,       ['ORG_ADMIN'])} />
                <Route path={PATHS.ledger}       element={route(BalanceSheet,    MONEY)} />
                <Route path={PATHS.workspace}    element={route(Organisation,    ['ORG_ADMIN'])} />

                {/* Consultant portal */}
                <Route path={PATHS.myOverview}    element={route(EmployeeDashboard,    ['EMPLOYEE'])} />
                <Route path={PATHS.myEngagements} element={route(EmployeePlacements,   ['EMPLOYEE'])} />
                <Route path={PATHS.myTimeLogs}    element={route(EmployeeTimesheets,   ['EMPLOYEE'])} />
                <Route path={PATHS.myLedger}      element={route(EmployeeBalanceSheet, ['EMPLOYEE'])} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </Router>
    );
}

export default App;
