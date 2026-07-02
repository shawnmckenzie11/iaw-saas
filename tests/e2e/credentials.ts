import type { APIRequestContext, Page } from '@playwright/test';

/**
 * E2E credentials sourced from environment variables (see `.env.test.example`).
 * Playwright loads `.env.test` and `backend/.env` in `playwright.config.ts`.
 */
function required(name: string, value: string | undefined): string {
  if (!value?.trim()) {
    throw new Error(
      `Missing ${name} for E2E tests. Copy .env.test.example to .env.test or set vars in backend/.env`
    );
  }
  return value.trim();
}

function driverPin(index: number, fallbackList: string[]): string {
  const perDriver = process.env[`E2E_DRIVER${index}_PIN`] ?? process.env[`SEED_DRIVER_0${index}_PIN`];
  if (perDriver?.trim()) return perDriver.trim();
  const fromList = fallbackList[index - 1];
  if (fromList) return fromList;
  throw new Error(`Missing driver ${index} PIN — set E2E_DRIVER${index}_PIN or SEED_DRIVER_PINS`);
}

const seedPins = (process.env.SEED_DRIVER_PINS ?? '')
  .split(',')
  .map((pin) => pin.trim())
  .filter(Boolean);

/** Dispatcher and driver credentials for Playwright specs. */
export const e2eCredentials = {
  get dispatcherEmail(): string {
    return (
      process.env.E2E_DISPATCHER_EMAIL?.trim() ||
      process.env.SEED_DISPATCHER_EMAIL?.trim() ||
      'dispatcher@example.com'
    );
  },
  get dispatcherPassword(): string {
    return required(
      'E2E_DISPATCHER_PASSWORD or SEED_DISPATCHER_PASSWORD',
      process.env.E2E_DISPATCHER_PASSWORD ?? process.env.SEED_DISPATCHER_PASSWORD
    );
  },
  get driver1Pin(): string {
    return driverPin(1, seedPins);
  },
  get driver2Pin(): string {
    return driverPin(2, seedPins);
  },
};

/**
 * Authenticates a driver via API and returns the JWT.
 */
export async function getDriverToken(request: APIRequestContext, pin: string): Promise<string> {
  const response = await request.post('/api/auth/driver/login', { data: { pin } });
  if (response.status() !== 200) {
    throw new Error(`Driver login failed with status ${response.status()}`);
  }
  const body = await response.json();
  return body.token as string;
}

/**
 * Authenticates the seeded dispatcher via API and returns the JWT.
 */
export async function getDispatcherToken(request: APIRequestContext): Promise<string> {
  const response = await request.post('/api/auth/dispatcher/login', {
    data: {
      email: e2eCredentials.dispatcherEmail,
      password: e2eCredentials.dispatcherPassword,
    },
  });
  if (response.status() !== 200) {
    throw new Error(`Dispatcher login failed with status ${response.status()}`);
  }
  const body = await response.json();
  return body.token as string;
}

/**
 * Signs in as a driver through the login UI.
 */
export async function loginDriverViaUi(
  page: Page,
  username = 'driver1',
  pin = e2eCredentials.driver1Pin
): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Driver (PIN)' }).click();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('4-Digit PIN').fill(pin);
  await page.getByText('SIGN IN').click();
}

/**
 * Signs in as a dispatcher through the login UI.
 */
export async function loginDispatcherViaUi(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Dispatcher' }).click();
  await page.getByLabel('Email').fill(e2eCredentials.dispatcherEmail);
  await page.getByLabel('Password').fill(e2eCredentials.dispatcherPassword);
  await page.getByText('SIGN IN').click();
}
