import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer';
import puppeteerCore from 'puppeteer-core';

function isServerlessRuntime(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_REGION || process.env.AWS_EXECUTION_ENV);
}

export async function launchBrowser() {
  if (isServerlessRuntime()) {
    const executablePath = await chromium.executablePath();
    return puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true
    });
  }

  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}
