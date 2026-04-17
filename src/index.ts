#!/usr/bin/env node
import { buildProgram } from './cli/commands.js';

const program = buildProgram();
program.parse();