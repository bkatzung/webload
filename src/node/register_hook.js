import { registerHooks } from 'node:module';
import { load, resolve } from './hook.js';

registerHooks({ load, resolve });
