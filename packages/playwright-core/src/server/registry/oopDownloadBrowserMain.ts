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

import fs from 'fs';
import { progress as ProgressBar } from '../../utilsBundle';
import { httpRequest } from '../../utils/network';
import { ManualPromise } from '../../utils/manualPromise';
import { extract } from '../../zipBundle';
import { getUserAgent } from '../../utils/userAgent';
import { browserDirectoryToMarkerFilePath } from '.';

type OnProgressCallback = (downloadedBytes: number, totalBytes: number) => void;
type DownloadFileLogger = (message: string) => void;
type DownloadFileOptions = {
  progressCallback: OnProgressCallback,
  log: DownloadFileLogger,
  userAgent: string,
  connectionTimeout: number,
};

function downloadFile(url: string, destinationPath: string, options: DownloadFileOptions): Promise<void> {
  const {
    progressCallback,
    log = () => { },
  } = options;
  log(`running download:`);
  log(`-- from url: ${url}`);
  log(`-- to location: ${destinationPath}`);
  let downloadedBytes = 0;
  let totalBytes = 0;

  const promise = new ManualPromise<void>();

  httpRequest({
    url,
    headers: {
      'User-Agent': options.userAgent,
    },
    timeout: options.connectionTimeout,
  }, response => {
    log(`-- response status code: ${response.statusCode}`);
    if (response.statusCode !== 200) {
      let content = '';
      const handleError = () => {
        const error = new Error(`Download failed: server returned code ${response.statusCode} body '${content}'. URL: ${url}`);
        // consume response data to free up memory
        response.resume();
        promise.reject(error);
      };
      response
          .on('data', chunk => content += chunk)
          .on('end', handleError)
          .on('error', handleError);
      return;
    }
    totalBytes = parseInt(response.headers['content-length'] || '0', 10);
    log(`-- total bytes: ${totalBytes}`);
    const file = fs.createWriteStream(destinationPath);
    file.on('finish', () => {
      if (downloadedBytes !== totalBytes) {
        log(`-- download failed, size mismatch: ${downloadedBytes} != ${totalBytes}`);
        promise.reject(new Error(`Download failed: size mismatch, file size: ${downloadedBytes}, expected size: ${totalBytes} URL: ${url}`));
      } else {
        log(`-- download complete, size: ${downloadedBytes}`);
        promise.resolve();
      }
    });
    file.on('error', error => promise.reject(error));
    response.pipe(file);
    response.on('data', onData);
  }, (error: any) => promise.reject(error));
  return promise;

  function onData(chunk: string) {
    downloadedBytes += chunk.length;
    progressCallback!(downloadedBytes, totalBytes);
  }
}

function getDownloadProgress(): OnProgressCallback {
  if (process.stdout.isTTY)
    return getAnimatedDownloadProgress();
  return getBasicDownloadProgress();
}

function getAnimatedDownloadProgress(): OnProgressCallback {
  let progressBar: ProgressBar;
  let lastDownloadedBytes = 0;

  return (downloadedBytes: number, totalBytes: number) => {
    if (!progressBar) {
      progressBar = new ProgressBar(
          `${toMegabytes(
              totalBytes
          )} [:bar] :percent :etas`,
          {
            complete: '=',
            incomplete: ' ',
            width: 20,
            total: totalBytes,
          }
      );
    }
    const delta = downloadedBytes - lastDownloadedBytes;
    lastDownloadedBytes = downloadedBytes;
    progressBar.tick(delta);
  };
}

function getBasicDownloadProgress(): OnProgressCallback {
  // eslint-disable-next-line no-console
  const totalRows = 10;
  const stepWidth = 8;
  let lastRow = -1;
  return (downloadedBytes: number, totalBytes: number) => {
    const percentage = downloadedBytes / totalBytes;
    const row = Math.floor(totalRows * percentage);
    if (row > lastRow) {
      lastRow = row;
      const percentageString = String(percentage * 100 | 0).padStart(3);
      // eslint-disable-next-line no-console
      console.log(`|${'■'.repeat(row * stepWidth)}${' '.repeat((totalRows - row) * stepWidth)}| ${percentageString}% of ${toMegabytes(totalBytes)}`);
    }
  };
}

function toMegabytes(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return `${Math.round(mb * 10) / 10} Mb`;
}

async function main() {
  const log = (message: string) => process.send?.({ method: 'log', params: { message } });
  const [title, browserDirectory, url, zipPath, executablePath, downloadConnectionTimeout] = process.argv.slice(2);
  await downloadFile(url, zipPath, {
    progressCallback: getDownloadProgress(),
    userAgent: getUserAgent(),
    log,
    connectionTimeout: +downloadConnectionTimeout,
  });
  log(`SUCCESS downloading ${title}`);
  log(`extracting archive`);
  log(`-- zip: ${zipPath}`);
  log(`-- location: ${browserDirectory}`);
  await extract(zipPath, { dir: browserDirectory });
  if (executablePath) {
    log(`fixing permissions at ${executablePath}`);
    await fs.promises.chmod(executablePath, 0o755);
  }
  await fs.promises.writeFile(browserDirectoryToMarkerFilePath(browserDirectory), '');
}

main().catch(error => {
  // eslint-disable-next-line no-console
  console.error(error);
  // eslint-disable-next-line no-restricted-properties
  process.exit(1);
});
