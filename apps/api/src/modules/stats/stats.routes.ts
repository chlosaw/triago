import { Router } from 'express';
import * as controller from './stats.controller.js';

export const statsRouter = Router();

statsRouter.get('/', controller.show);
