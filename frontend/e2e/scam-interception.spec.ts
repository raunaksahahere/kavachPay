import { expect, test, type Page } from '@playwright/test';

async function openAsha(page: Page) {
  await page.goto('/');
  const switcher = page.getByTestId('user-switcher');
  await expect(switcher).toBeVisible();
  await switcher.selectOption({ label: 'Asha Devi' });
  await expect(page.getByTestId('balance')).toBeVisible();
}

const balanceText = (page: Page) => page.getByTestId('balance').innerText();

test('a fake "refund" collect request is stopped before money leaves', async ({ page }) => {
  await openAsha(page);
  await page.getByTestId('lang-en').click();
  const before = await balanceText(page);

  const scam = page.getByTestId('collect-request').filter({ hasText: 'Refund for your cancelled order' });
  await expect(scam).toContainText('₹4,999');
  await scam.getByTestId('approve-request').click();

  const sheet = page.getByTestId('risk-sheet');
  await expect(sheet).toHaveAttribute('data-decision', 'hold');
  await expect(page.getByTestId('decision-label')).toHaveText('Payment stopped');
  await expect(page.getByTestId('risk-headline')).toContainText('sends ₹4,999 OUT of your account');
  const reasons = page.getByTestId('risk-reasons');
  await expect(reasons).toContainText('mentions "refund"');
  await expect(reasons).toContainText('created 2 days ago');
  await expect(reasons).toContainText(/received money from \d+ new senders/);
  await expect(page.getByTestId('ai-status')).toContainText('AI check unavailable');
  const score = Number((await page.getByTestId('risk-score').innerText()).match(/(\d+)\/100/)![1]);
  expect(score).toBeGreaterThanOrEqual(70);

  // Held: no PIN entry is offered at all during the cooling period.
  await expect(page.getByTestId('hold-timer')).toBeVisible();
  await expect(page.getByTestId('pin-input')).toHaveCount(0);

  await page.getByTestId('stop-button').click();
  await expect(page.getByTestId('payment-finished')).toContainText('No money was sent');
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByTestId('balance')).toHaveText(before);
  await expect(page.getByTestId('collect-request').filter({ hasText: 'Refund for your cancelled order' })).toHaveCount(0);
});

test('the same screen speaks Hindi, and a genuine shop request goes through with the PIN', async ({ page }) => {
  await openAsha(page);
  await page.getByTestId('lang-hi').click();
  const shop = page.getByTestId('collect-request').filter({ hasText: 'Sharma Kirana Store' });
  await expect(shop).toContainText('₹640');
  await shop.getByTestId('approve-request').click();

  await expect(page.getByTestId('risk-sheet')).toHaveAttribute('data-decision', 'allow');
  await expect(page.getByTestId('decision-label')).toHaveText('सुरक्षित लगता है');
  await page.getByTestId('pin-input').fill('1234');
  await page.getByTestId('pay-button').click();
  await expect(page.getByTestId('payment-finished')).toContainText('भुगतान सफल');
});

test('a wrong PIN is refused and no money moves', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('user-switcher').selectOption({ label: 'Ravi Kumar' });
  await page.getByTestId('lang-en').click();
  const before = await balanceText(page);
  await page.getByTestId('action-pay').click();
  await page.getByTestId('pay-vpa').fill('sharmakirana@kavach');
  await expect(page.getByTestId('payee-name')).toContainText('Sharma Kirana Store');
  await page.getByTestId('pay-amount').fill('120');
  await page.getByTestId('pay-continue').click();
  await expect(page.getByTestId('risk-sheet')).toBeVisible();
  await page.getByTestId('pin-input').fill('9999');
  const typed = page.getByTestId('typed-amount');
  if (await typed.count()) await typed.fill('120');
  await page.getByTestId('pay-button').click();
  await expect(page.getByTestId('pay-error')).toContainText('Incorrect UPI PIN');
  await page.getByTestId('stop-button').click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('balance')).toHaveText(before);
});

test('typed amount mismatch on a warned payment cannot settle', async ({ page }) => {
  await openAsha(page);
  await page.getByTestId('lang-en').click();
  await page.getByTestId('action-pay').click();
  await page.getByTestId('pay-vpa').fill('refund.helpdesk@kavach');
  await expect(page.getByTestId('payee-name')).toBeVisible();
  await page.getByTestId('pay-amount').fill('900');
  await page.getByTestId('pay-continue').click();
  await expect(page.getByTestId('risk-sheet')).toHaveAttribute('data-decision', 'warn');
  await page.getByTestId('pin-input').fill('1234');
  await page.getByTestId('typed-amount').fill('901');
  await expect(page.getByTestId('pay-button')).toBeDisabled();
  await expect(page.getByTestId('payment-finished')).toHaveCount(0);
  await page.getByTestId('stop-button').click();
  await page.getByRole('button', { name: 'Done' }).click();
});

test('payment API failure stays a failure and never renders a success state', async ({ page }) => {
  await openAsha(page);
  await page.getByTestId('lang-en').click();
  await page.route('**/api/payments', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'service_unavailable', message: 'Service temporarily unavailable.' } }),
  }));
  await page.getByTestId('action-pay').click();
  await page.getByTestId('pay-vpa').fill('sharmakirana@kavach');
  await expect(page.getByTestId('payee-name')).toBeVisible();
  await page.getByTestId('pay-amount').fill('120');
  await page.getByTestId('pay-continue').click();
  await expect(page.getByTestId('pay-form-error')).toContainText('Service temporarily unavailable.');
  await expect(page.getByTestId('payment-finished')).toHaveCount(0);
});

test('the analyst can see the held payment, the mule ring and a verified audit chain', async ({ page }) => {
  await page.goto('/analyst');
  await page.getByTestId('tab-flagged').click();
  await expect(page.getByTestId('flagged-table')).toBeVisible();
  await page.locator('[data-testid="flagged-table"] tbody tr').first().click();
  await expect(page.getByTestId('txn-detail')).toContainText('R1_DIRECTION_MISMATCH');

  await page.getByTestId('open-network').click();
  await expect(page.getByTestId('network-graph')).toBeVisible();

  await page.getByTestId('tab-audit').click();
  await page.getByTestId('verify-chain').click();
  await expect(page.getByTestId('verify-result')).toContainText('Chain intact');

  await page.getByTestId('tab-proof').click();
  await page.getByTestId('run-proof').click();
  await expect(page.getByTestId('proof-result')).toContainText('All checks passed');

  await page.getByTestId('tab-copilot').click();
  await page.getByTestId('copilot-input').fill('Why was the latest held payment held?');
  await page.getByTestId('copilot-ask').click();
  await expect(page.getByTestId('copilot-answer')).toContainText('unavailable');
});
