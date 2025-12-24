import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { authRequired } from './middleware/auth.js';
import { permit } from './middleware/permit.js';

import { login, createUser, updateUser, listUsers, listUsersBasic, deleteUser } from './controllers/authController.js';
import { upsertRole, getRoles, deleteRole } from './controllers/rolesController.js';
import {
  createMaterial, listMaterials, getMaterial,
  updateMaterial, deleteMaterial, stockOperation
} from './controllers/materialsController.js';
import {
  createTool, listTools, getTool,
  updateTool, deleteTool
} from './controllers/toolsController.js';
import { listMovements, deleteMovement } from './controllers/movementsController.js';
import {
  listWorkOrders,
  createWorkOrder,
  updateWorkOrder,
  deleteWorkOrder,
  ensureWorkOrderManager
} from './controllers/workOrdersController.js';
import {
  createTimesheetEntry,
  deleteTimesheetEntry,
  listTimesheets,
  listMyTimesheets,
  updateTimesheetEntry,
  summarizeTimesheets
} from './controllers/timesheetsController.js';
import { listHourClients, addHourClient, deleteHourClient, ensureHourClientManager } from './controllers/hourClientsController.js';

import { db } from './config/firebase.js';
import { toCSV } from './utils/csv.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/auth/login', login);

app.get('/users',  authRequired, permit('users.manage'), listUsers);
app.post('/users', authRequired, permit('users.manage'), createUser);
app.patch('/users/:uid', authRequired, permit('users.manage'), updateUser);
app.delete('/users/:uid', authRequired, permit('users.manage'), deleteUser);
app.get(
  '/users/minimal',
  authRequired,
  permit('users.manage', 'materials.create', 'materials.update'),
  listUsersBasic
);

app.get('/roles',          authRequired, permit('roles.manage'), getRoles);
app.post('/roles',         authRequired, permit('roles.manage'), upsertRole);
app.delete('/roles/:name', authRequired, permit('roles.manage'), deleteRole);

app.get('/materials',        authRequired, permit('materials.read'),   listMaterials);
app.get('/materials/:id',    authRequired, permit('materials.read'),   getMaterial);
app.post('/materials',       authRequired, permit('materials.create'), createMaterial);
app.patch('/materials/:id',  authRequired, permit('materials.update'), updateMaterial);
app.delete('/materials/:id', authRequired, permit('materials.delete'), deleteMaterial);
app.post('/materials/:id/stock', authRequired, permit('materials.update'), stockOperation);

app.get('/tools',        authRequired, permit('tools.read'),   listTools);
app.get('/tools/:id',    authRequired, permit('tools.read'),   getTool);
app.post('/tools',       authRequired, permit('tools.create'), createTool);
app.patch('/tools/:id',  authRequired, permit('tools.update'), updateTool);
app.delete('/tools/:id', authRequired, permit('tools.delete'), deleteTool);

app.get('/timesheets', authRequired, permit('timesheets.read', 'timesheets.viewAll'), listTimesheets);
app.get(
  '/timesheets/mine',
  authRequired,
  permit('timesheets.submit', 'timesheets.read'),
  listMyTimesheets
);
app.post('/timesheets', authRequired, permit('timesheets.submit'), createTimesheetEntry);
app.patch(
  '/timesheets/:id',
  authRequired,
  permit('timesheets.submit', 'timesheets.manage'),
  updateTimesheetEntry
);
app.delete(
  '/timesheets/:id',
  authRequired,
  permit('timesheets.submit', 'timesheets.manage'),
  deleteTimesheetEntry
);
app.get('/timesheets/summary', authRequired, permit('timesheets.read', 'timesheets.viewAll'), summarizeTimesheets);

app.get('/movements', authRequired, permit('materials.read'), listMovements);
app.delete('/movements/:id', authRequired, deleteMovement);

app.get('/materials/export.csv', authRequired, permit('materials.read'), async (_req, res) => {
  const snap = await db.collection('materials').get();
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const csv = toCSV(rows);
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename=\"materiales.csv\"');
  res.send(csv);
});

app.get('/tools/export.csv', authRequired, permit('tools.read'), async (_req, res) => {
  const snap = await db.collection('tools').get();
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const csv = toCSV(rows);
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename=\"herramientas.csv\"');
  res.send(csv);
});

app.get('/hours/clients', authRequired, listHourClients);
app.post('/hours/clients', authRequired, ensureHourClientManager, addHourClient);
app.delete('/hours/clients/:name', authRequired, ensureHourClientManager, deleteHourClient);
app.get('/work-orders', authRequired, listWorkOrders);
app.post('/work-orders', authRequired, ensureWorkOrderManager, createWorkOrder);
app.patch('/work-orders/:id', authRequired, ensureWorkOrderManager, updateWorkOrder);
app.delete('/work-orders/:id', authRequired, ensureWorkOrderManager, deleteWorkOrder);

export default app;
