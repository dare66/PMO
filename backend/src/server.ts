import { buildApp } from './app.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { bootstrap } from './seed/bootstrap.js';
import { startJobs } from './jobs.js';

const applied = await migrate();
if (applied.length) console.log('Applied migrations:', applied.join(', '));
await bootstrap();
const app = await buildApp();
if (config.jobsEnabled) startJobs();
await app.listen({ port: config.port, host: '0.0.0.0' });
