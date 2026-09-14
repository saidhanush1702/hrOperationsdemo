import api from './axios';

// ── In-memory cache helpers ──────────────────────────────────────────────────
const makeCache = (ttlMs) => {
    let value = null;
    let ts = 0;
    let inflight = null;
    return {
        get: (fetcher) => {
            if (value && Date.now() - ts < ttlMs) return Promise.resolve(value);
            if (inflight) return inflight;
            inflight = fetcher()
                .then(res => { value = res; ts = Date.now(); inflight = null; return res; })
                .catch(err => { inflight = null; throw err; });
            return inflight;
        },
        invalidate: () => { value = null; ts = 0; },
    };
};

const lookupsCache      = makeCache(10 * 60 * 1000); // 10 min — static reference data
const orgDetailsCache   = makeCache( 5 * 60 * 1000); // 5 min
const dashboardCache    = makeCache( 2 * 60 * 1000); // 2 min

// ── API surface ──────────────────────────────────────────────────────────────

export const commonAPI = {
    getLookups: () => lookupsCache.get(() => api.get('/api/lookups')),
};

// AUTHENTICATION
export const authAPI = {
    login: (credentials) => api.post('/api/auth/login', credentials),
};

// MANAGEMENT (HR/Admin)
export const managementAPI = {
    getEmployees: () => api.get('/api/management/employees'),
    addEmployee: (data) => api.post('/api/management/add-employee', data),
    updateEmployee: (id, data) => api.put(`/api/management/update-employee/${id}`, data),
    terminateEmployee: (id, data) => api.put(`/api/management/employees/${id}/terminate`, data),
    reactivateEmployee: (id) => api.put(`/api/management/employees/${id}/reactivate`),
    toggleEmployeeAccess: (id, data) => api.put(`/api/management/employees/${id}/toggle-access`, data),
    getNextEmployeeCode: () => api.get('/api/management/employees/next-code'),

    getEmployeeDocuments: (empId) => api.get(`/api/management/employees/${empId}/documents`),
    uploadEmployeeDocument: (empId, formData) => api.post(`/api/management/employees/${empId}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    deleteEmployeeDocument: (docId) => api.delete(`/api/management/employees/documents/${docId}`),

    addImmigration: (id, data) => api.post(`/api/management/employees/${id}/immigration`, data),
    deleteImmigration: (immId) => api.delete(`/api/management/employees/immigration/${immId}`),
    updateImmigration: (immId, data) => api.put(`/api/management/employees/immigration/${immId}`, data),

    getClients: () => api.get('/api/management/clients'),

    getOrganizationTeam: () => api.get('/api/management/organization/team'),
    createTeamMember: (data) => api.post('/api/management/organization/team', data),
    toggleTeamAccess: (id, data) => api.put(`/api/management/organization/team/${id}/toggle-access`, data),
    deleteTeamMember: (id) => api.delete(`/api/management/organization/team/${id}`),

    getPlacements: () => api.get('/api/management/placements'),
    createPlacement: (data) => api.post('/api/management/placements', data),
    updatePlacement: (id, data) => api.put(`/api/management/placements/${id}`, data),
    getNextInvoiceReference: () => api.get('/api/management/placements/next-invoice'),
    // Placement history for one employee OR one client (exactly one, never both).
    getPlacementHistory: (params) => api.get('/api/management/placements/history', { params }),

    // params: { page, pageSize, tab, search, payType, employee, client, dateFrom, dateTo, activeOnly }
    // returns { rows, total, page, pageSize, counts }
    getInvoices: (params = {}) => api.get('/api/management/invoices', { params }),
    getInvoiceFilterOptions: (activeOnly = true) => api.get('/api/management/invoices/filter-options', { params: { activeOnly } }),
    // ids of every invoice matching the same params, for select-all-matching
    getInvoiceIds: (params = {}) => api.get('/api/management/invoices/ids', { params }),
    // full filtered set, unpaginated, for Excel export
    getInvoicesForExport: (params = {}) => api.get('/api/management/invoices/export', { params }),
    generateInvoices: () => api.post('/api/management/invoices/generate'),
    updateInvoiceStatus: (id, data) => api.put(`/api/management/invoices/${id}/status`, data),
    getInvoiceSettings: () => api.get('/api/management/invoices/settings'),
    updateInvoiceSettings: (id, data) => api.put(`/api/management/invoices/settings/${id}`, data),
    deleteInvoice: (id) => api.delete(`/api/management/invoices/${id}`),

    getInvoiceEmailInfo: (id, type = 'INVOICE_SENT', regenerate = false) => api.get(`/api/management/invoices/${id}/email-info?type=${type}${regenerate ? '&regenerate=true' : ''}`),
    getInvoiceEmailLogs: (id) => api.get(`/api/management/invoices/${id}/email-logs`),
    getInvoiceDraftStatus: (id) => api.get(`/api/management/invoices/${id}/draft-status`),
    getInvoiceLineItems: (id) => api.get(`/api/management/invoices/${id}/line-items`),
    getInvoicePayments: (id) => api.get(`/api/management/invoices/${id}/payments`),
    addInvoicePayment: (id, data) => api.post(`/api/management/invoices/${id}/payments`, data),
    sendInvoiceEmail: (id, data) => api.post(`/api/management/invoices/${id}/send-email`, data, { timeout: 120000 }),
    downloadInvoicePDF: (id) => api.get(`/api/management/invoices/${id}/pdf`, { responseType: 'blob' }),
    // The combined invoice + timesheets PDF, built on demand and never stored.
    // Fetched through axios rather than pointed at with an <iframe src> because the
    // auth cookie is SameSite=Lax: a cross-origin iframe would not send it, while an
    // XHR with withCredentials does. Generation can be slow, hence the raised timeout.
    getCombinedInvoicePDF: (id) => api.get(`/api/management/invoices/${id}/combined-pdf`, { responseType: 'blob', timeout: 120000 }),
    getInvoiceAdjustments: (id) => api.get(`/api/management/invoices/${id}/adjustments`),
    addInvoiceAdjustment: (id, data) => api.post(`/api/management/invoices/${id}/adjustments`, data),
    deleteInvoiceAdjustment: (id, adjId) => api.delete(`/api/management/invoices/${id}/adjustments/${adjId}`),

    getBalanceSheets: () => api.get('/api/management/balance-sheets'),
    getBalanceSheetsExport: () => api.get('/api/management/balance-sheets/export'),
    getEmployeeBalanceSheet: (employeeId) => api.get(`/api/management/balance-sheets/${employeeId}`),
    getEmployeeBalanceSheetSummary: (employeeId) => api.get(`/api/management/balance-sheets/${employeeId}/summary`),
    addBalanceAdjustment: (data) => api.post('/api/management/balance-sheets/adjustments', data),
    deleteBalanceAdjustment: (id) => api.delete(`/api/management/balance-sheets/adjustments/${id}`),
    previewC2CReprice: (employeeId) => api.get(`/api/management/balance-sheets/${employeeId}/c2c-reprice/preview`),
    applyC2CReprice: (employeeId) => api.post(`/api/management/balance-sheets/${employeeId}/c2c-reprice`),

    runW2Payroll: (data) => api.post('/api/management/balance-sheets/run-w2-payroll', data),

    getPayrollRuns: () => api.get('/api/management/payroll'),
    generatePayrollRun: (data) => api.post('/api/management/payroll/run', data),
    getPayrollRunDetail: (id) => api.get(`/api/management/payroll/${id}`),
    submitPayrollRun: (id, data) => api.post(`/api/management/payroll/${id}/submit`, data),
    refreshPayrollRun: (id) => api.put(`/api/management/payroll/${id}/refresh`),
    getPayrollAdjustments: (id) => api.get(`/api/management/payroll/${id}/adjustments`),
    addPayrollAdjustment: (id, data) => api.post(`/api/management/payroll/${id}/adjustments`, data),
    deletePayrollAdjustment: (id, adjId) => api.delete(`/api/management/payroll/${id}/adjustments/${adjId}`),

    // Reconcile — earned vs paid, read-only
    getReconcileSummary: () => api.get('/api/management/reconcile'),
    getReconcileDetail: (employeeId) => api.get(`/api/management/reconcile/${employeeId}`),

    getDashboardStats: () => dashboardCache.get(() => api.get('/api/management/dashboard/stats')),
    getAuditLogs: (module, limit = 50, offset = 0) => api.get(`/api/management/audit-logs/${module}?limit=${limit}&offset=${offset}`),

    getOrganizationDetails: () => orgDetailsCache.get(() => api.get('/api/management/organization/details')),
    updateOrganizationDetails: (formData) => {
        orgDetailsCache.invalidate();
        return api.put('/api/management/organization/details', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
};

export const timesheetAPI = {
    generateTimesheets: () => api.post('/api/management/timesheets/generate'),
    getManagementTimesheets: (activeOnly = true) => api.get('/api/management/timesheets', { params: { activeOnly } }),
    reviewTimesheet: (id, data) => api.post(`/api/management/timesheets/${id}/review`, data),
    adminOverrideTimesheet: (id, formData) => api.post(`/api/management/timesheets/${id}/override`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    getEmployeeTimesheets: () => api.get('/api/timesheets/my-timesheets'),
    getTimesheetDetails: (id) => api.get(`/api/timesheets/${id}`),
    submitTimesheet: (id, formData) => api.post(`/api/timesheets/${id}/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    getMissingPeriods: (placementId, lookahead = 1) => api.get(`/api/management/timesheets/missing-periods/${placementId}?lookahead=${lookahead}`),
    createManualTimesheet: (data) => api.post('/api/management/timesheets/manual-create', data),
    deleteTimesheet: (id) => api.delete(`/api/management/timesheets/${id}`),
};

// SUPER ADMIN
export const superAdminAPI = {
    getOrganizations: () => api.get('/api/super-admin/organizations'),
    createOrganization: (data) => api.post('/api/super-admin/create-org', data),
    toggleOrganizationStatus: (id, isActive) => api.put(`/api/super-admin/organizations/${id}/toggle`, { is_active: !isActive }),
    getStats: () => api.get('/api/super-admin/stats'),
    getOrgAdmins: (id) => api.get(`/api/super-admin/organizations/${id}/admins`),
};

export const portalAPI = {
    getOrgInfo:               () => api.get('/api/portal/org-info'),
    getMyProfile:             () => api.get('/api/portal/my-profile'),
    getMyPlacements:          () => api.get('/api/portal/my-placements'),
    getMyBalanceSheetSummary: () => api.get('/api/portal/my-balance-sheet-summary'),
    getDashboardStats:        () => api.get('/api/portal/dashboard-stats'),
};
