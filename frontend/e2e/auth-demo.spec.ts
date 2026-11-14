import { expect, test, type Page } from '@playwright/test';

async function useDemoAccount(page: Page, name: string) {
  await page.goto('/demo');
  const card = page.getByTestId('demo-account').filter({ hasText: name });
  await card.getByRole('button', { name: 'Use this account' }).click();
  await expect(page.getByTestId('demo-badge')).toHaveAttribute('title', `Demo account: ${name}`);
  await expect(page.getByTestId('balance')).toBeVisible();
}

test('signed-out visitors land on sign-in, with demo trial and install buttons; APIs refuse them', async ({ page, request }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 90_000 });
  await expect(page.getByTestId('demo-trial')).toBeVisible();
  await expect(page.getByTestId('install-app')).toBeVisible();

  for (const path of ['/api/wallet', '/api/analyst/stats']) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).not.toBe(200);
  }
  const demoUsers = await request.get('/api/demo-users');
  expect(demoUsers.ok()).toBe(true);
});

test('two devices: a "refund" request sent from one demo account is stopped on the other', async ({ browser }) => {
  const phone1 = await (await browser.newContext()).newPage();
  const phone2 = await (await browser.newContext()).newPage();

  await useDemoAccount(phone1, 'Asha Devi');
  await phone1.getByTestId('lang-en').click();
  const before = await phone1.getByTestId('balance').innerText();

  await useDemoAccount(phone2, 'Refund Helpdesk');
  await phone2.getByTestId('action-request').click();
  await phone2.getByTestId('request-vpa').fill('asha@kavach');
  await phone2.getByTestId('request-amount').fill('4999');
  await phone2.getByTestId('request-note').fill('Refund for your order #9012');
  await phone2.getByTestId('request-send').click();
  await expect(phone2.getByText('Request sent')).toBeVisible();

  // Phone 1 is not reloaded: the inbox refreshes itself.
  const card = phone1.getByTestId('collect-request').filter({ hasText: 'Refund for your order #9012' });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByTestId('approve-request').click();
  await expect(phone1.getByTestId('risk-sheet')).toHaveAttribute('data-decision', 'hold');
  await expect(phone1.getByTestId('risk-headline')).toContainText('₹4,999 OUT of your account');
  await phone1.getByTestId('stop-button').click();
  await phone1.getByRole('button', { name: 'Done' }).click();
  await expect(phone1.getByTestId('balance')).toHaveText(before);

  // Ending the demo trial returns to sign-in.
  await phone1.getByTestId('exit-demo').click();
  await expect(phone1).toHaveURL(/\/sign-in/, { timeout: 90_000 });
});

test('a demo-trial session cannot open a non-demo account by sending its id', async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await useDemoAccount(page, 'Ravi Kumar');
  const users = await (await page.request.get('/api/demo-users')).json();
  const asha = users.users.find((u: { vpa: string }) => u.vpa === 'asha@kavach');
  // The server ignores the requested id and answers for the session's own persona.
  const wallet = await (await page.request.get(`/api/wallet?userId=${asha.userId}`)).json();
  expect(wallet.me.vpa).toBe('ravi@kavach');
  expect(wallet.mode).toBe('demo');
});
