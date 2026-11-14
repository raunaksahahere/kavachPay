import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Uses Meera Das, whom no other "open" test touches, so these payments cannot change other tests' risk scores.
test('a stopped payment offers its reason as audio, and its history entry downloads a PDF and report links', async ({ page }) => {
  await page.goto('/app');
  await page.getByTestId('user-switcher').selectOption({ label: 'Meera Das' });
  await expect(page.getByTestId('balance')).toBeVisible();
  await page.getByTestId('lang-en').click();

  // A payment to the mule-ring "Refund Helpdesk" is flagged.
  await page.getByTestId('action-pay').click();
  await page.getByTestId('pay-vpa').fill('refund.helpdesk@kavach');
  await expect(page.getByTestId('payee-name')).toContainText('Refund Helpdesk');
  await page.getByTestId('pay-amount').fill('4999');
  await page.getByTestId('pay-continue').click();
  const sheet = page.getByTestId('risk-sheet');
  await expect(sheet).toHaveAttribute('data-decision', /warn|hold/);

  // Listen: the test servers run without an ElevenLabs key, so the button reports that cleanly.
  await expect(page.getByTestId('listen-button')).toBeVisible();
  await page.getByTestId('voice-lang-bn').click();
  await expect(page.getByTestId('voice-lang-bn')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('listen-button').click();
  await expect(page.getByTestId('listen-error')).toContainText('Voice playback is not set up');

  await page.getByTestId('stop-button').click();
  await page.getByRole('button', { name: 'Done' }).click();

  // The cancelled payment is now the newest history entry; open it.
  await page.getByTestId('history-item').first().click();
  const detail = page.getByTestId('txn-detail');
  await expect(detail).toBeVisible();
  await expect(page.getByTestId('txn-counterparty')).toHaveText('refund.helpdesk@kavach');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('download-statement').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^kavach-transactions-refund\.helpdesk_kavach-\d{4}-\d{2}-\d{2}\.pdf$/);
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  await expect(page.getByTestId('download-status')).toHaveText('PDF downloaded');

  await page.getByTestId('report-button').click();
  await expect(page.getByTestId('report-options')).toBeVisible();
  await expect(page.getByTestId('report-cybercrime')).toHaveAttribute('href', 'https://cybercrime.gov.in/');
  await expect(page.getByTestId('report-cybercrime')).toHaveAttribute('target', '_blank');
  await expect(page.getByTestId('report-helpline')).toHaveAttribute('href', 'tel:1930');
  await expect(page.getByTestId('report-chakshu')).toHaveAttribute('href', 'https://sancharsaathi.gov.in/sfc/');
  await expect(page.getByTestId('report-rbi')).toHaveAttribute('href', 'https://cms.rbi.org.in/');
});
