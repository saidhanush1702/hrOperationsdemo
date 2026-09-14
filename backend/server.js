import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from './config/db.js';
import { startTimesheetCronJobs } from './services/timesheetCron.js';

dotenv.config();

import { login , logout, forgotPassword, verifyResetCode, resetPassword } from './controllers/authController.js';
import { createOrganization, toggleOrgStatus, getAllOrganizations, getOrgAdmins, getOrganizationDetails, updateOrganizationDetails, getSuperAdminStats } from './controllers/orgController.js';
import { verifyToken, isSuperAdmin } from './middleware/auth.js';

// Role-guard middleware
const isOrgAdmin = (req, res, next) => {
    if (req.user.role !== 'ORG_ADMIN') return res.status(403).json({ error: 'Access denied. ORG_ADMIN only.' });
    next();
};
const isOrgAdminOrAccountant = (req, res, next) => {
    if (!['ORG_ADMIN', 'ACCOUNTANT'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied.' });
    next();
};
const isOrgAdminOrHR = (req, res, next) => {
    if (!['ORG_ADMIN', 'HR'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied.' });
    next();
};
// isManagement: ORG_ADMIN + HR + ACCOUNTANT (all management roles)
const isManagement = (req, res, next) => {
    if (!['ORG_ADMIN', 'HR', 'ACCOUNTANT'].includes(req.user.role)) return res.status(403).json({ error: 'Access denied.' });
    next();
};
const isEmployee = (req, res, next) => {
    if (req.user.role !== 'EMPLOYEE') return res.status(403).json({ error: 'Access denied. Employee portal only.' });
    next();
};
import { addEmployee, getEmployees, updateEmployee, deleteEmployee, terminateEmployee, reactivateEmployee, toggleEmployeeAccess, addImmigrationRecord } from './controllers/employeeController.js';
import { getNextEmployeeCode, updateImmigrationRecord , deleteImmigrationRecord, uploadEmployeeDocument, getEmployeeDocuments, deleteEmployeeDocument } from './controllers/employeeController.js';

import { createClient, getClients } from './controllers/clientController.js';
import { updateClient, deleteClient } from './controllers/clientController.js';

import { createPlacement, getPlacements, updatePlacement, getPlacementHistory } from './controllers/placementController.js';
import { getAllLookups } from './controllers/lookupController.js';

import { 
    generateTimesheets, 
    getManagementTimesheets, 
    getTimesheetDetails, 
    submitTimesheet, 
    reviewTimesheet,
    adminOverrideTimesheet,
    getEmployeeTimesheets,
    getMissingPeriods,
    createManualTimesheet,
    deleteTimesheet
} from './controllers/timesheetController.js';

import { getInvoices, getInvoiceFilterOptions, getInvoiceIds, getInvoicesForExport, updateInvoiceStatus, deleteInvoice, generateInvoices, updateInvoiceSettings, getInvoiceSettings, downloadInvoicePDF, downloadCombinedPDF, sendInvoiceEmail, getInvoiceEmailInfo, getInvoiceEmailLogs, getInvoiceDraftStatus, getInvoiceLineItems, getInvoicePayments, addInvoicePayment, getInvoiceAdjustments, addInvoiceAdjustment, deleteInvoiceAdjustment } from './controllers/invoiceController.js';
import { getBalanceSheets, getEmployeeBalanceSheet, getEmployeeBalanceSheetSummary, addBalanceAdjustment, deleteBalanceAdjustment, runManualPayroll, getBalanceSheetsExport, previewEmployeeC2CReprice, applyEmployeeC2CReprice } from './controllers/balanceSheetController.js';
import { getPayrollRuns, generatePayrollRun, getPayrollRunDetail, submitPayrollRun, refreshPayrollRun, getPayrollAdjustments, addPayrollAdjustment, deletePayrollAdjustment } from './controllers/payrollController.js';
import { getReconcileSummary, getReconcileDetail } from './controllers/reconcileController.js';
import { startInvoiceCronJobs } from './services/invoiceCron.js';

import { getManagementStats } from './controllers/dashboardController.js';
import { getOrganizationTeam, createTeamMember, toggleTeamAccess, deleteTeamMember } from './controllers/hrController.js';
import { getMyProfile, getMyPlacements, getMyBalanceSheetSummary, getMyDashboardStats, getMyOrgInfo } from './controllers/portalController.js';
import { getModuleAuditLogs } from './controllers/auditLogController.js';

// Import the Multer configuration for employee documents
import upload from './middleware/upload.js';
import multer from 'multer';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the standard document folder exists
const uploadDir = path.join(__dirname, 'uploads', 'documents');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Ensure the Organization Logos folder exists
const logoDir = path.join(__dirname, 'uploads', 'logos');
if (!fs.existsSync(logoDir)) {
    fs.mkdirSync(logoDir, { recursive: true });
}

// Custom Multer config for Organization Logos
const logoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, logoDir),
    filename: (req, file, cb) => {
        cb(null, `org_${req.user.orgId}_${Date.now()}${path.extname(file.originalname)}`);
    }
});

const uploadLogo = multer({ 
    storage: logoStorage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only images are allowed'));
    }
});

const app = express();

// gzip every response above 1 KB. The invoice list is ~5.7 MB of JSON uncompressed
// and ~522 KB gzipped (91% smaller), which is the difference between a multi-second
// wait and a sub-second one. Mounted before the static handlers and routes so it
// covers all of them.
app.use(compression({ threshold: 1024 }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/blob', express.static(path.join(__dirname, 'blob')));
const allowedOrigins = (process.env.CLIENT_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, Postman)
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 200
}));
app.use(express.json());
app.use(cookieParser());

//  ROUTES 

app.post('/api/auth/login', login);
app.post('/api/auth/logout', logout);

app.post('/api/auth/forgot-password', forgotPassword);
app.post('/api/auth/verify-code', verifyResetCode);
app.post('/api/auth/reset-password', resetPassword);

// Super Admin Protected
app.get('/api/super-admin/stats', [verifyToken, isSuperAdmin], getSuperAdminStats);
app.post('/api/super-admin/create-org', [verifyToken, isSuperAdmin], createOrganization);
app.put('/api/super-admin/organizations/:id/toggle', [verifyToken, isSuperAdmin], toggleOrgStatus);
app.get('/api/super-admin/organizations', [verifyToken, isSuperAdmin], getAllOrganizations);
app.get('/api/super-admin/organizations/:id/admins', [verifyToken, isSuperAdmin], getOrgAdmins);

// ── Workforce: ORG_ADMIN + HR + ACCOUNTANT ────────────────────────────────────
app.get('/api/management/employees', [verifyToken, isManagement], getEmployees);
app.post('/api/management/add-employee', [verifyToken, isManagement], addEmployee);
app.put('/api/management/update-employee/:id', [verifyToken, isManagement], updateEmployee);
app.delete('/api/management/delete-employee/:id', [verifyToken, isOrgAdmin], deleteEmployee);
app.put('/api/management/employees/:id/terminate', [verifyToken, isManagement], terminateEmployee);
// Undo a termination — clears the employee's termination fields and restores the
// user's login. Role is enforced inside the controller (ORG_ADMIN + ACCOUNTANT),
// matching terminate and toggle-access.
app.put('/api/management/employees/:id/reactivate', [verifyToken, isManagement], reactivateEmployee);
app.put('/api/management/employees/:id/toggle-access', [verifyToken, isManagement], toggleEmployeeAccess);
app.get('/api/management/employees/next-code', [verifyToken, isManagement], getNextEmployeeCode);
app.post('/api/management/employees/:empId/immigration', [verifyToken, isManagement], addImmigrationRecord);
app.put('/api/management/employees/immigration/:immId', [verifyToken, isManagement], updateImmigrationRecord);
app.delete('/api/management/employees/immigration/:immId', [verifyToken, isOrgAdminOrHR], deleteImmigrationRecord);

// Employee Document Routes (all management)
app.post('/api/management/employees/:empId/documents', [verifyToken, isManagement, upload.single('document')], uploadEmployeeDocument);
app.get('/api/management/employees/:empId/documents', [verifyToken, isManagement], getEmployeeDocuments);
app.delete('/api/management/employees/documents/:docId', [verifyToken, isOrgAdminOrHR], deleteEmployeeDocument);

// ── Clients: ORG_ADMIN + HR + ACCOUNTANT ─────────────────────────────────────
app.get('/api/management/clients', [verifyToken, isManagement], getClients);
app.post('/api/management/clients', [verifyToken, isManagement], createClient);
app.put('/api/management/clients/:id', [verifyToken, isManagement], updateClient);
app.delete('/api/management/clients/:id', [verifyToken, isOrgAdmin], deleteClient);

// ── Placements: ORG_ADMIN + HR + ACCOUNTANT ───────────────────────────────────
app.post('/api/management/placements', [verifyToken, isManagement], createPlacement);
app.get('/api/management/placements', [verifyToken, isManagement], getPlacements);
// Placement history for one employee OR one client — powers the "Placement History"
// section inside the Workforce and Clients detail modals. Read-only.
app.get('/api/management/placements/history', [verifyToken, isManagement], getPlacementHistory);
app.put('/api/management/placements/:id', [verifyToken, isManagement], updatePlacement);

// ── Timesheets: all management roles (management view), EMPLOYEE (submit) ─────
app.post('/api/management/timesheets/generate', [verifyToken, isManagement], generateTimesheets);
app.get('/api/management/timesheets', [verifyToken, isManagement], getManagementTimesheets);
app.post('/api/management/timesheets/:id/review', [verifyToken, isManagement], reviewTimesheet);
app.post('/api/management/timesheets/:id/override', [verifyToken, isManagement, upload.single('attachment')], adminOverrideTimesheet);
app.get('/api/management/timesheets/missing-periods/:placementId', [verifyToken, isManagement], getMissingPeriods);
app.post('/api/management/timesheets/manual-create', [verifyToken, isManagement], createManualTimesheet);
app.delete('/api/management/timesheets/:id', [verifyToken, isManagement], deleteTimesheet);

// Shared employee timesheet portal (EMPLOYEE only for submit, any authenticated for view own)
app.get('/api/timesheets/my-timesheets', [verifyToken, isEmployee], getEmployeeTimesheets);
app.get('/api/timesheets/:id', verifyToken, getTimesheetDetails);
app.post('/api/timesheets/:id/submit', [verifyToken, isEmployee, upload.single('attachment')], submitTimesheet);

// ── Invoices: ORG_ADMIN + ACCOUNTANT (delete: ORG_ADMIN only) ────────────────
app.get('/api/management/invoices', [verifyToken, isOrgAdminOrAccountant], getInvoices);
// Static sub-paths must be declared before any '/invoices/:id' route, or Express
// matches them as an id.
app.get('/api/management/invoices/filter-options', [verifyToken, isOrgAdminOrAccountant], getInvoiceFilterOptions);
app.get('/api/management/invoices/ids',            [verifyToken, isOrgAdminOrAccountant], getInvoiceIds);
app.get('/api/management/invoices/export',         [verifyToken, isOrgAdminOrAccountant], getInvoicesForExport);
app.put('/api/management/invoices/:id/status', [verifyToken, isOrgAdminOrAccountant], updateInvoiceStatus);
app.delete('/api/management/invoices/:id', [verifyToken, isOrgAdmin], deleteInvoice);
app.get('/api/management/invoices/settings', [verifyToken, isOrgAdminOrAccountant], getInvoiceSettings);
app.put('/api/management/invoices/settings/:id', [verifyToken, isOrgAdminOrAccountant], updateInvoiceSettings);
app.post('/api/management/invoices/generate', [verifyToken, isOrgAdminOrAccountant], generateInvoices);
app.get('/api/management/invoices/:id/pdf', [verifyToken, isOrgAdminOrAccountant], downloadInvoicePDF);
app.get('/api/management/invoices/:id/combined-pdf', [verifyToken, isOrgAdminOrAccountant], downloadCombinedPDF);
app.get('/api/management/invoices/:id/email-info', [verifyToken, isOrgAdminOrAccountant], getInvoiceEmailInfo);
app.get('/api/management/invoices/:id/email-logs', [verifyToken, isOrgAdminOrAccountant], getInvoiceEmailLogs);
app.get('/api/management/invoices/:id/draft-status', [verifyToken, isOrgAdminOrAccountant], getInvoiceDraftStatus);
app.get('/api/management/invoices/:id/line-items', [verifyToken, isOrgAdminOrAccountant], getInvoiceLineItems);
app.get('/api/management/invoices/:id/payments', [verifyToken, isOrgAdminOrAccountant], getInvoicePayments);
app.post('/api/management/invoices/:id/payments', [verifyToken, isOrgAdminOrAccountant], addInvoicePayment);
app.post('/api/management/invoices/:id/send-email', [verifyToken, isOrgAdminOrAccountant], sendInvoiceEmail);
app.get('/api/management/invoices/:id/adjustments', [verifyToken, isOrgAdminOrAccountant], getInvoiceAdjustments);
app.post('/api/management/invoices/:id/adjustments', [verifyToken, isOrgAdminOrAccountant], addInvoiceAdjustment);
app.delete('/api/management/invoices/:id/adjustments/:adjId', [verifyToken, isOrgAdminOrAccountant], deleteInvoiceAdjustment);

// ── Payroll: ORG_ADMIN + ACCOUNTANT ──────────────────────────────────────────
app.get('/api/management/payroll', [verifyToken, isOrgAdminOrAccountant], getPayrollRuns);
app.post('/api/management/payroll/run', [verifyToken, isOrgAdminOrAccountant], generatePayrollRun);
app.get('/api/management/payroll/:id', [verifyToken, isOrgAdminOrAccountant], getPayrollRunDetail);
app.post('/api/management/payroll/:id/submit', [verifyToken, isOrgAdminOrAccountant], submitPayrollRun);
app.put('/api/management/payroll/:id/refresh', [verifyToken, isOrgAdminOrAccountant], refreshPayrollRun);
app.get('/api/management/payroll/:id/adjustments', [verifyToken, isOrgAdminOrAccountant], getPayrollAdjustments);
app.post('/api/management/payroll/:id/adjustments', [verifyToken, isOrgAdminOrAccountant], addPayrollAdjustment);
app.delete('/api/management/payroll/:id/adjustments/:adjId', [verifyToken, isOrgAdminOrAccountant], deletePayrollAdjustment);

// ── Reconcile: ORG_ADMIN only ────────────────────────────────────────────────
// Earned-vs-paid report. Read-only: it derives everything from timesheets, the
// payroll consumption ledger and the C2C ledger, and writes nothing.
app.get('/api/management/reconcile', [verifyToken, isOrgAdmin], getReconcileSummary);
app.get('/api/management/reconcile/:id', [verifyToken, isOrgAdmin], getReconcileDetail);

// ── Balance Sheet: ORG_ADMIN + ACCOUNTANT ────────────────────────────────────
app.get('/api/management/balance-sheets', [verifyToken, isOrgAdminOrAccountant], getBalanceSheets);
app.get('/api/management/balance-sheets/export', [verifyToken, isOrgAdminOrAccountant], getBalanceSheetsExport);
app.get('/api/management/balance-sheets/:id/summary', [verifyToken, isOrgAdminOrAccountant], getEmployeeBalanceSheetSummary);
app.get('/api/management/balance-sheets/:id/c2c-reprice/preview', [verifyToken, isOrgAdminOrAccountant], previewEmployeeC2CReprice);
app.post('/api/management/balance-sheets/:id/c2c-reprice', [verifyToken, isOrgAdminOrAccountant], applyEmployeeC2CReprice);
app.get('/api/management/balance-sheets/:id', [verifyToken, isOrgAdminOrAccountant], getEmployeeBalanceSheet);
app.post('/api/management/balance-sheets/adjustments', [verifyToken, isOrgAdminOrAccountant], addBalanceAdjustment);
// Manual additions/deductions only — the controller rejects system-generated ledger rows.
app.delete('/api/management/balance-sheets/adjustments/:id', [verifyToken, isOrgAdminOrAccountant], deleteBalanceAdjustment);
app.post('/api/management/balance-sheets/run-w2-payroll', [verifyToken, isOrgAdminOrAccountant], runManualPayroll);

// ── Dashboard Stats: all management roles ─────────────────────────────────────
app.get('/api/management/dashboard/stats', [verifyToken, isManagement], getManagementStats);

app.get('/api/lookups', verifyToken, getAllLookups);

// ── Organisation Settings: ORG_ADMIN only (GET details stays isManagement for sidebar logo/name fetch)
app.get('/api/management/organization/details', [verifyToken, isManagement], getOrganizationDetails);
app.put('/api/management/organization/details', [verifyToken, isOrgAdmin, uploadLogo.single('logo')], updateOrganizationDetails);
app.get('/api/management/organization/team', [verifyToken, isOrgAdmin], getOrganizationTeam);
app.post('/api/management/organization/team', [verifyToken, isOrgAdmin], createTeamMember);
app.put('/api/management/organization/team/:id/toggle-access', [verifyToken, isOrgAdmin], toggleTeamAccess);
app.delete('/api/management/organization/team/:id', [verifyToken, isOrgAdmin], deleteTeamMember);

// ── Audit Logs: ORG_ADMIN + ACCOUNTANT ───────────────────────────────────────
app.get('/api/management/audit-logs/:module', [verifyToken, isOrgAdminOrAccountant], getModuleAuditLogs);

// ── Employee Portal Routes: EMPLOYEE only ─────────────────────────────────────
app.get('/api/portal/org-info',                 [verifyToken, isEmployee], getMyOrgInfo);
app.get('/api/portal/my-profile',               [verifyToken, isEmployee], getMyProfile);
app.get('/api/portal/my-placements',            [verifyToken, isEmployee], getMyPlacements);
app.get('/api/portal/my-balance-sheet-summary', [verifyToken, isEmployee], getMyBalanceSheetSummary);
app.get('/api/portal/dashboard-stats',          [verifyToken, isEmployee], getMyDashboardStats);

const PORT = process.env.PORT;

const startServer = async () => {
    try {
        await pool.query('SELECT 1'); 
        console.log("Database connected successfully.");
        
        // Cron jobs enabled; the reminder emails inside them are commented out
        // (see invoiceCron.js / timesheetCron.js) so no mail is sent.
        startInvoiceCronJobs();
        console.log("Invoice Automation Cron Job initialized.");
        startTimesheetCronJobs();
        console.log("Timesheet Reminder Cron Job initialized.");

        app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
    } catch (error) {
        console.error("Server Error:", error);
    }
};

startServer();