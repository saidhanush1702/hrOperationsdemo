// In-app page addresses. These are UI routes only — API paths are unchanged.
export const PATHS = {
    platformOverview: '/platform/overview',
    tenants:          '/platform/tenants',

    overview:     '/console/overview',
    talent:       '/console/talent',
    partners:     '/console/partners',
    engagements:  '/console/engagements',
    timeLogs:     '/console/time-logs',
    billingRules: '/console/billing-rules',
    billing:      '/console/billing',
    payRuns:      '/console/pay-runs',
    ledger:       '/console/ledger',
    payAudit:     '/console/pay-audit',
    workspace:    '/console/workspace',

    myOverview:    '/me/overview',
    myEngagements: '/me/engagements',
    myTimeLogs:    '/me/time-logs',
    myLedger:      '/me/ledger',
};

export const ROUTES = {
    SUPER_ADMIN_DASHBOARD: PATHS.platformOverview,
    MANAGEMENT_DASHBOARD:  PATHS.overview,
    PORTAL_DASHBOARD:      PATHS.myOverview,
};

export const ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    ORG_ADMIN: 'ORG_ADMIN',
    HR: 'HR',
    ACCOUNTANT: 'ACCOUNTANT',
};

// Display names for roles. The stored role values are unchanged.
export const ROLE_LABELS = {
    SUPER_ADMIN: 'Platform Owner',
    ORG_ADMIN:   'Workspace Admin',
    HR:          'Talent Ops',
    ACCOUNTANT:  'Finance Lead',
    EMPLOYEE:    'Consultant',
};

export const roleLabel = (role) => ROLE_LABELS[role] || (role ? String(role).replace('_', ' ') : '');
