import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

/** Synthetic driver record used during database seeding. */
export interface SeedDriverDef {
  id: string;
  firstName: string;
  lastName: string;
  pin: string;
}

/** Resolved seed credentials sourced from environment variables. */
export interface SeedConfig {
  dispatcherEmail: string;
  dispatcherPassword: string;
  drivers: SeedDriverDef[];
}

const DEFAULT_DRIVER_IDS = ['drv-01', 'drv-02', 'drv-03', 'drv-04'] as const;
const DEFAULT_DRIVER_NAMES: Array<{ firstName: string; lastName: string }> = [
  { firstName: 'Driver', lastName: 'One' },
  { firstName: 'Driver', lastName: 'Two' },
  { firstName: 'Driver', lastName: 'Three' },
  { firstName: 'Driver', lastName: 'Four' },
];

/**
 * Parses comma-separated driver PINs from `SEED_DRIVER_PINS` or per-driver overrides.
 */
export function parseDriverPins(): string[] {
  const perDriver = DEFAULT_DRIVER_IDS.map(
    (id, index) => process.env[`SEED_DRIVER_${String(index + 1).padStart(2, '0')}_PIN`]
  );
  if (perDriver.every(Boolean)) {
    return perDriver as string[];
  }

  const raw = process.env.SEED_DRIVER_PINS;
  if (!raw?.trim()) {
    throw new Error(
      '[Seed] Set SEED_DRIVER_PINS (comma-separated) or SEED_DRIVER_01_PIN … SEED_DRIVER_04_PIN in backend/.env'
    );
  }

  const pins = raw.split(',').map((pin) => pin.trim());
  if (pins.length !== DEFAULT_DRIVER_IDS.length || pins.some((pin) => !/^\d{4}$/.test(pin))) {
    throw new Error(
      `[Seed] SEED_DRIVER_PINS must contain exactly ${DEFAULT_DRIVER_IDS.length} four-digit PINs`
    );
  }
  return pins;
}

/**
 * Loads seed credentials from environment variables.
 * @param options.requirePassword When true, throws if `SEED_DISPATCHER_PASSWORD` is unset.
 */
export function loadSeedConfig(options: { requirePassword?: boolean } = {}): SeedConfig {
  const requirePassword = options.requirePassword ?? true;
  const dispatcherEmail = process.env.SEED_DISPATCHER_EMAIL?.trim() || 'dispatcher@example.com';
  const dispatcherPassword = process.env.SEED_DISPATCHER_PASSWORD?.trim() ?? '';

  if (requirePassword && !dispatcherPassword) {
    throw new Error(
      '[Seed] SEED_DISPATCHER_PASSWORD is required. Copy backend/.env.example and set credentials locally.'
    );
  }

  const pins = parseDriverPins();
  const drivers = DEFAULT_DRIVER_IDS.map((id, index) => ({
    id,
    ...DEFAULT_DRIVER_NAMES[index],
    pin: pins[index],
  }));

  return { dispatcherEmail, dispatcherPassword, drivers };
}

/**
 * Returns driver PINs and dispatcher credentials for integration/E2E tests.
 */
export function loadTestCredentials(): {
  dispatcherEmail: string;
  dispatcherPassword: string;
  driver1Pin: string;
  driver2Pin: string;
  driver3Pin: string;
  driver4Pin: string;
} {
  const config = loadSeedConfig({ requirePassword: true });
  return {
    dispatcherEmail: config.dispatcherEmail,
    dispatcherPassword: config.dispatcherPassword,
    driver1Pin: config.drivers[0].pin,
    driver2Pin: config.drivers[1].pin,
    driver3Pin: config.drivers[2].pin,
    driver4Pin: config.drivers[3].pin,
  };
}
