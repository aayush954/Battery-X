const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();
const { errorHandler } = require('./middleware/errorHandler');
const compatRoutes = require('./routes/compat.routes');
const lifecycleRoutes = require('./routes/lifecycle.routes');
const ownershipRoutes = require('./routes/ownership.routes');
const secondLifeRoutes = require('./routes/secondlife.routes');
const materialsRoutes = require('./routes/materials.routes');
const simulationRoutes = require('./routes/simulation.routes');
const manufacturerRoutes = require('./routes/manufacturer.routes');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '200kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
app.get('/api/health-check', (req,res)=>res.json({status:'ok'}));

// Updated BATTERYX-X UI/API compatibility layer backed by PostgreSQL + Prisma.
app.use('/api', compatRoutes);

// Original full database modules retained for faculty/demo/API completeness.
app.use('/api/batteries/:id/lifecycle', lifecycleRoutes);
app.use('/api/batteries/:id/ownership', ownershipRoutes);
app.use('/api/batteries/:id/second-life', secondLifeRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/simulations', simulationRoutes);
app.use('/api/manufacturers', manufacturerRoutes);

// Serve the updated BATTERYX-X UI from the same Express service.
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, { maxAge: 0 }));
app.get('*', (req,res)=>res.sendFile(path.join(publicDir,'index.html')));
app.use(errorHandler);
module.exports = app;
