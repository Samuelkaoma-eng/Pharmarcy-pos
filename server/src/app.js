const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { initDb, pool } = require('./config/db');

// Controllers
const authController = require('./controllers/authController');
const controlHubController = require('./controllers/controlHubController');
const tenantController = require('./controllers/tenantController');
const productController = require('./controllers/productController');
const inventoryController = require('./controllers/inventoryController');
const patientController = require('./controllers/patientController');
const triageController = require('./controllers/triageController');
const prescriptionController = require('./controllers/prescriptionController');
const saleController = require('./controllers/saleController');
const receiptController = require('./controllers/receiptController');
const agentController = require('./controllers/agentController');
const documentController = require('./controllers/documentController');
const userController = require('./controllers/userController');
const approvalController = require('./controllers/approvalController');
const supplierController = require('./controllers/supplierController');
const insuranceController = require('./controllers/insuranceController');
const drugController = require('./controllers/drugController');
const fiscalController = require('./controllers/fiscalController');
const insightController = require('./controllers/insightController');
const recallController = require('./controllers/recallController');
const tillController = require('./controllers/tillController');
const reportController = require('./controllers/reportController');

const { authenticate, controlHubOnly, requireRole } = require('./middleware/auth');
const { dbContext } = require('./middleware/dbContext');

const app = express();

// Security headers. The API serves JSON and one server-rendered receipt, never
// a page that embeds third-party content, so the defaults are close to right.
//
// crossOriginResourcePolicy is relaxed to same-site because the client is
// served from a different port in development and fetches uploaded documents
// and the receipt from here. contentSecurityPolicy is disabled on this API
// because it protects documents, and the only document this origin serves is
// the receipt, which sets its own.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' }
  })
);

// The refresh token travels as an HttpOnly cookie, so the parser has to run
// before any route that reads it.
app.use(cookieParser());

// Behind a proxy in deployment, so req.ip is the client rather than the hop.
// Rate limiting and the IP recorded against a refresh chain both depend on it.
app.set('trust proxy', 1);

// CORS Allowlist
const defaultOrigins = ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173'];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : defaultOrigins;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));

app.use(express.json());

// Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Too many login attempts. Please try again in 15 minutes.' }
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Please slow down.' }
});

app.use('/api', generalLimiter);

// Every API request gets its own database connection, carrying its own tenant,
// released when the response closes. This has to be mounted before any route
// that reads or writes: a request without it has no scope, and a query without
// a scope sees nothing.
app.use('/api', dbContext);

// Init DB Schema & Seed
initDb();

// Health Check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', database: 'disconnected', error: err.message });
  }
});

// Public Routes
app.get('/api/tenants/directory', tenantController.getDirectory);
app.post('/api/auth/login', authLimiter, authController.login);
app.post('/api/controlhub/login', authLimiter, authController.controlHubLogin);
// Both read the refresh cookie rather than a body, and both are safe to call
// with a dead session: refresh says so, sign-out succeeds regardless.
app.post('/api/auth/refresh', authController.refresh);
app.post('/api/auth/logout', authController.logout);
app.post('/api/onboarding/register', controlHubController.registerTenant);

// ControlHub Routes (SuperAdmin only)
const controlHubRouter = express.Router();
controlHubRouter.use(authenticate, controlHubOnly);
controlHubRouter.get('/tenants', controlHubController.getTenants);
controlHubRouter.get('/tenants/:id', controlHubController.getTenant);
controlHubRouter.put('/tenants/:id/status', controlHubController.updateTenantStatus);
controlHubRouter.get('/tenants/:id/settings', controlHubController.getTenantSettings);
controlHubRouter.put('/tenants/:id/settings', controlHubController.updateTenantSettings);
controlHubRouter.get('/onboarding', controlHubController.getOnboarding);

// Compliance document review
controlHubRouter.get('/tenants/:id/documents', documentController.getDocuments);
controlHubRouter.get('/tenants/:id/readiness', documentController.getReadiness);
controlHubRouter.patch('/documents/:documentId/review', documentController.reviewDocument);
controlHubRouter.get('/documents/types', documentController.getRequiredTypes);
controlHubRouter.get('/documents/:documentId/file', documentController.downloadDocument);
controlHubRouter.post(
  '/tenants/:id/documents',
  documentController.upload.single('file'),
  documentController.uploadDocument
);

// Maker-checker
controlHubRouter.get('/approvals/actions', approvalController.getActions);
controlHubRouter.get('/approvals', approvalController.getRequests);
controlHubRouter.post('/approvals', approvalController.createRequest);
controlHubRouter.patch('/approvals/:id/decide', approvalController.decide);

app.use('/api/controlhub', controlHubRouter);

// Tenant-scoped Routes (Authenticated)
const apiRouter = express.Router();
apiRouter.use(authenticate);

// Auth Profile
apiRouter.get('/auth/profile', authController.getProfile);

// Tenants Config
apiRouter.get('/tenants/config', tenantController.getConfig);
apiRouter.put('/tenants/config', requireRole('Admin'), tenantController.updateConfig);

// Staff and roles. Listing is open to any signed-in member so the app can show
// who recorded what; creating and changing accounts is an Admin action.
apiRouter.get('/users', userController.getUsers);
apiRouter.get('/users/roles', userController.getAssignableRoles);
apiRouter.post('/users', requireRole('Admin'), userController.createUser);
apiRouter.put('/users/:id', requireRole('Admin'), userController.updateUser);
apiRouter.put('/profile/avatar', userController.updateOwnAvatar);

// Suppliers and procurement
apiRouter.get('/suppliers', supplierController.getSuppliers);
apiRouter.post('/suppliers', requireRole('Admin', 'Pharmacist'), supplierController.createSupplier);
apiRouter.put('/suppliers/:id', requireRole('Admin', 'Pharmacist'), supplierController.updateSupplier);
apiRouter.get('/purchase-orders', supplierController.getPurchaseOrders);
apiRouter.get('/purchase-orders/:id', supplierController.getPurchaseOrder);
apiRouter.post('/purchase-orders', requireRole('Admin', 'Pharmacist'), supplierController.createPurchaseOrder);
apiRouter.post('/purchase-orders/:id/receive', requireRole('Admin', 'Pharmacist'), supplierController.receiveAgainstOrder);

// Insurance
apiRouter.get('/insurance/schemes', insuranceController.getSchemes);
apiRouter.post('/insurance/schemes', requireRole('Admin'), insuranceController.createScheme);
apiRouter.post('/insurance/memberships', requireRole('Admin', 'Pharmacist'), insuranceController.enrolPatient);
apiRouter.get('/insurance/coverage/:customerId', insuranceController.getCoverage);

// SIMFIS: simulated fiscalisation. Demonstrates the Smart Invoice mechanism
// this system is not authorised to perform. Everything it returns is marked.
apiRouter.get('/fiscal/status', fiscalController.getStatus);
apiRouter.post('/fiscal/sales/:id/fiscalise', requireRole('Admin', 'Pharmacist', 'Cashier'), fiscalController.fiscaliseSale);
apiRouter.get('/fiscal/sales/:id/verify', fiscalController.verifySale);

// Patient recall. The list is real; the reminders are simulated and never sent.
apiRouter.get('/recalls/status', recallController.getStatus);
apiRouter.get('/recalls', recallController.getRecalls);
apiRouter.post('/recalls', requireRole('Admin', 'Pharmacist', 'Doctor'), recallController.createRecall);
apiRouter.post('/recalls/:id/remind', requireRole('Admin', 'Pharmacist'), recallController.simulateReminder);
apiRouter.patch('/recalls/:id', requireRole('Admin', 'Pharmacist'), recallController.updateRecall);

// Clinical insight. Shows what this pharmacy recorded before for similar
// presentations, and counts complaints trending unusually. It never diagnoses.
apiRouter.get('/insight/status', insightController.getStatus);
apiRouter.get('/insight/visits/:id/similar', requireRole('Admin', 'Pharmacist', 'Doctor'), insightController.getSimilarPresentations);
apiRouter.get('/insight/trends', requireRole('Admin', 'Pharmacist', 'Doctor'), insightController.getTrends);

// Drug directory. Reference data, not clinical authority.
apiRouter.get('/drugs/search', drugController.search);
apiRouter.post('/drugs/interactions', drugController.checkBasket);

// Products
apiRouter.get('/products', productController.getProducts);
apiRouter.get('/products/low-stock', productController.getLowStock);
apiRouter.get('/products/expiry-alerts', productController.getExpiryAlerts);
apiRouter.get('/products/:id', productController.getProduct);
apiRouter.post('/products', requireRole('Admin', 'Pharmacist'), productController.createProduct);
apiRouter.put('/products/:id', requireRole('Admin', 'Pharmacist'), productController.updateProduct);

// Inventory
apiRouter.post('/inventory/receive', requireRole('Admin', 'Pharmacist'), inventoryController.receiveStock);
apiRouter.post('/inventory/dispense', requireRole('Admin', 'Pharmacist', 'Cashier'), inventoryController.dispenseStock);
apiRouter.post('/inventory/adjust', requireRole('Admin', 'Pharmacist'), inventoryController.adjustStock);
apiRouter.get('/inventory/movements/:productId', inventoryController.getMovements);

// Patients
apiRouter.get('/patients', patientController.getPatients);
apiRouter.get('/patients/:id', patientController.getPatient);
apiRouter.post('/patients', patientController.createPatient);
apiRouter.put('/patients/:id', patientController.updatePatient);

// Triage / Visits.
// Each station is gated to the people who staff it. Previously every one of
// these was open to any signed-in user, so a cashier could assign a doctor.
apiRouter.get('/doctors', triageController.getDoctors);
apiRouter.get('/visits/queue', triageController.getQueue);
apiRouter.get('/visits/stats', triageController.getStats);
// Reception registers arrivals.
apiRouter.post('/visits', triageController.createVisit);
apiRouter.get('/visits/:id', triageController.getVisit);
apiRouter.patch('/visits/:id/status', requireRole('Admin', 'Pharmacist', 'Doctor'), triageController.updateStatus);
// Routing a patient to a clinician is a front-desk action.
apiRouter.patch('/visits/:id/assign', requireRole('Admin', 'Pharmacist'), triageController.assignDoctor);
// Taking vitals is clinical, and it is what moves a visit into TRIAGE.
apiRouter.post('/visits/:id/vitals', requireRole('Admin', 'Pharmacist', 'Doctor'), triageController.recordVitals);
// Writing up the consultation and handing the patient to the counter.
apiRouter.patch('/visits/:id/assessment', requireRole('Admin', 'Pharmacist', 'Doctor'), triageController.recordAssessment);

// Prescriptions
apiRouter.get('/prescriptions', prescriptionController.getPrescriptions);
apiRouter.get('/prescriptions/:id', prescriptionController.getPrescription);
apiRouter.post('/prescriptions', requireRole('Admin', 'Pharmacist', 'Doctor'), prescriptionController.createPrescription);
apiRouter.patch('/prescriptions/:id/verify', requireRole('Admin', 'Pharmacist'), prescriptionController.verifyPrescription);
apiRouter.patch('/prescriptions/:id/dispense', requireRole('Admin', 'Pharmacist', 'Cashier'), prescriptionController.dispensePrescription);

// Sales
apiRouter.get('/sales', saleController.getSales);
apiRouter.get('/sales/:id', saleController.getSale);
apiRouter.post('/sales', saleController.createSale);

// Till sessions. A shift at a drawer: float in, takings recorded, cash counted,
// variance reported. Anyone who can ring up a sale can open and close their own
// till; only a supervisor sees the whole floor.
apiRouter.get('/till/current', tillController.getCurrent);
apiRouter.get('/till/sessions', tillController.getSessions);
apiRouter.post('/till/open', requireRole('Admin', 'Pharmacist', 'Cashier'), tillController.open);
apiRouter.get('/till/sessions/:id', tillController.getSession);
apiRouter.post('/till/sessions/:id/close', requireRole('Admin', 'Pharmacist', 'Cashier'), tillController.close);

// Reporting. Working figures the pharmacy prepares from its own records — for
// the owner, and for whoever prepares its VAT return. Nothing here is a filing
// and nothing here is a Smart Invoice. Restricted to the people entitled to
// see trading and patient-level dispensing data.
apiRouter.get('/reports/vat', requireRole('Admin', 'Pharmacist'), reportController.vatSummary);
apiRouter.get('/reports/trading', requireRole('Admin', 'Pharmacist'), reportController.tradingSummary);
apiRouter.get('/reports/stock', requireRole('Admin', 'Pharmacist'), reportController.stockValuation);
apiRouter.get('/reports/dispensing', requireRole('Admin', 'Pharmacist'), reportController.dispensingRegister);
// The audit trail. Admin only: it names who did what, which is not something
// one member of staff should be able to read about another.
apiRouter.get('/reports/audit', requireRole('Admin'), reportController.auditTrail);

// Receipts
apiRouter.get('/receipts/:receiptNumber/html', receiptController.getReceiptHtml);

// AI Agent
apiRouter.post('/agent/query', agentController.query);

app.use('/api', apiRouter);

// ---------------------------------------------------------------------------
// The built client, served from this same origin.
//
// Deploying the API and the client as two services would put them on two
// domains, and the refresh token is an HttpOnly SameSite=Lax cookie: it would
// stop being sent, and making it SameSite=None would weaken the control that
// exists to stop a stolen token being replayed. Serving both from one origin
// keeps the cookie as designed and avoids CORS entirely.
//
// Mounted only when a build is actually present, and never under test. In
// development the client runs on Vite's own port and proxies /api here, so
// there is no build to serve; the suite asserts the JSON 404 below, which is
// the API's contract and must not become an HTML page.
const CLIENT_DIST = path.join(__dirname, '../../client/dist');
const serveClient = process.env.NODE_ENV !== 'test' && fs.existsSync(path.join(CLIENT_DIST, 'index.html'));

if (serveClient) {
  app.use(express.static(CLIENT_DIST));
}

// 404 Handler
//
// Anything under /api that reached here is a genuinely missing endpoint and
// answers as JSON. Everything else is a client-side route, which only the
// browser can resolve, so the app shell is returned and React Router decides.
app.use((req, res) => {
  if (!serveClient || req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Requested endpoint does not exist' });
  }
  return res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

module.exports = app;
