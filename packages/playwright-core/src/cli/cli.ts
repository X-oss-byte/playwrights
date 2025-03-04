#!/usr/bin/env node

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable no-console */

import { getPackageManager, gracefullyProcessExitDoNotHang } from '../utils';
import program from './program';

function printPlaywrightTestError(command: string) {
  const packages: string[] = [];
  for (const pkg of ['playwright', 'playwright-chromium', 'playwright-firefox', 'playwright-webkit']) {
    try {
      require.resolve(pkg);
      packages.push(pkg);
    } catch (e) {
    }
  }
  if (!packages.length)
    packages.push('playwright');
  const packageManager = getPackageManager();
  if (packageManager === 'yarn') {
    console.error(`Please install @playwright/test package before running "yarn playwright ${command}"`);
    console.error(`  yarn remove ${packages.join(' ')}`);
    console.error('  yarn add -D @playwright/test');
  } else if (packageManager === 'pnpm') {
    console.error(`Please install @playwright/test package before running "pnpm exec playwright ${command}"`);
    console.error(`  pnpm remove ${packages.join(' ')}`);
    console.error('  pnpm add -D @playwright/test');
  } else {
    console.error(`Please install @playwright/test package before running "npx playwright ${command}"`);
    console.error(`  npm uninstall ${packages.join(' ')}`);
    console.error('  npm install -D @playwright/test');
  }
}

{
  const command = program.command('test').allowUnknownOption(true);
  command.description('Run tests with Playwright Test. Available in @playwright/test package.');
  command.action(async () => {
    printPlaywrightTestError('test');
    gracefullyProcessExitDoNotHang(1);
  });
}

{
  const command = program.command('show-report').allowUnknownOption(true);
  command.description('Show Playwright Test HTML report. Available in @playwright/test package.');
  command.action(async () => {
    printPlaywrightTestError('show-report');
    gracefullyProcessExitDoNotHang(1);
  });
}

program.parse(process.argv);
