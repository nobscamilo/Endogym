import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAdminServices: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock('../../src/lib/firebaseAdmin.js', () => ({ getAdminServices: mocks.getAdminServices }));
vi.mock('../../src/lib/logger.js', () => ({ logError: mocks.logError, logInfo: mocks.logInfo }));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { increment: (n) => ({ __inc: n }) },
}));

const {
  checkAiBudget,
  recordUserAiSpend,
  estimateCostUsd,
  budgetDayKey,
  __resetAiBudgetCache,
} = await import('../../src/lib/aiBudget.js');

// Firestore de mentira: un mapa de rutas -> datos.
function fakeDb(docs = {}, onSet) {
  const makeDoc = (path) => ({
    get: async () => ({ exists: path in docs, data: () => docs[path] }),
    set: async (data, opts) => { onSet?.(path, data, opts); },
    collection: (sub) => ({ doc: (id) => makeDoc(`${path}/${sub}/${id}`) }),
  });
  return { collection: (name) => ({ doc: (id) => makeDoc(`${name}/${id}`) }) };
}

describe('aiBudget — freno de gasto', () => {
  const envBackup = {
    user: process.env.AI_USER_DAILY_BUDGET_USD,
    global: process.env.AI_GLOBAL_DAILY_BUDGET_USD,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    __resetAiBudgetCache();
    process.env.AI_USER_DAILY_BUDGET_USD = '0.10';
    process.env.AI_GLOBAL_DAILY_BUDGET_USD = '1.00';
  });

  afterEach(() => {
    if (envBackup.user === undefined) delete process.env.AI_USER_DAILY_BUDGET_USD;
    else process.env.AI_USER_DAILY_BUDGET_USD = envBackup.user;
    if (envBackup.global === undefined) delete process.env.AI_GLOBAL_DAILY_BUDGET_USD;
    else process.env.AI_GLOBAL_DAILY_BUDGET_USD = envBackup.global;
  });

  it('estimateCostUsd cobra la salida más cara que la entrada y descuenta lo cacheado', () => {
    const soloEntrada = estimateCostUsd({ tokensIn: 1_000_000 });
    const soloSalida = estimateCostUsd({ tokensOut: 1_000_000 });
    expect(soloEntrada).toBeCloseTo(0.30, 5);
    expect(soloSalida).toBeCloseTo(2.50, 5);
    // El pensamiento se factura como salida.
    expect(estimateCostUsd({ tokensThink: 1_000_000 })).toBeCloseTo(2.50, 5);
    // Lo cacheado ya venía dentro de tokensIn: sale más barato, nunca negativo.
    const conCache = estimateCostUsd({ tokensIn: 1_000_000, tokensCached: 1_000_000 });
    expect(conCache).toBeLessThan(soloEntrada);
    expect(conCache).toBeGreaterThanOrEqual(0);
  });

  it('deja pasar cuando ni el usuario ni el global han llegado al tope', async () => {
    const day = budgetDayKey();
    mocks.getAdminServices.mockResolvedValue({
      db: fakeDb({
        [`aiMetrics/${day}`]: { 'coach-chat': { tokensIn: 1000, tokensOut: 100 } },
        [`users/user-1/aiBudget/${day}`]: { spentUsd: 0.01 },
      }),
    });

    const result = await checkAiBudget({ userId: 'user-1' });
    expect(result.allowed).toBe(true);
    expect(result.spentUsd).toBeCloseTo(0.01, 5);
  });

  it('para a UN usuario que se ha pasado, sin tocar a los demás', async () => {
    const day = budgetDayKey();
    const docs = {
      [`users/manirroto/aiBudget/${day}`]: { spentUsd: 0.25 }, // supera 0.10
      [`users/normal/aiBudget/${day}`]: { spentUsd: 0.01 },
    };
    mocks.getAdminServices.mockResolvedValue({ db: fakeDb(docs) });

    const bloqueado = await checkAiBudget({ userId: 'manirroto' });
    expect(bloqueado.allowed).toBe(false);
    expect(bloqueado.scope).toBe('user');
    expect(bloqueado.reason).toBe('user_daily_budget');

    __resetAiBudgetCache();
    const otro = await checkAiBudget({ userId: 'normal' });
    expect(otro.allowed).toBe(true);
  });

  it('el tope GLOBAL corta a todo el mundo, aunque el usuario no haya gastado nada', async () => {
    const day = budgetDayKey();
    mocks.getAdminServices.mockResolvedValue({
      db: fakeDb({
        // 1M de tokens de salida = $2.50, por encima del global de $1.00
        [`aiMetrics/${day}`]: { 'weekly-plan': { tokensOut: 1_000_000 } },
        [`users/inocente/aiBudget/${day}`]: { spentUsd: 0 },
      }),
    });

    const result = await checkAiBudget({ userId: 'inocente' });
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe('global');
    expect(result.reason).toBe('global_daily_budget');
  });

  it('cuenta también los documentos legacy de claves planas', async () => {
    const day = budgetDayKey();
    mocks.getAdminServices.mockResolvedValue({
      db: fakeDb({
        [`aiMetrics/${day}`]: { 'coach-chat.tokensOut': 1_000_000, updatedAt: 'x' },
      }),
    });

    const result = await checkAiBudget({ userId: 'user-1' });
    expect(result.allowed).toBe(false);
    expect(result.scope).toBe('global');
  });

  it('si Firestore falla, DEJA PASAR: el freno no puede tumbar la app', async () => {
    mocks.getAdminServices.mockRejectedValue(new Error('firestore caído'));
    const result = await checkAiBudget({ userId: 'user-1' });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('check_failed');
    expect(mocks.logError).toHaveBeenCalled();
  });

  it('recordUserAiSpend imputa el coste al día y al usuario', async () => {
    const writes = [];
    mocks.getAdminServices.mockResolvedValue({ db: fakeDb({}, (path, data) => writes.push({ path, data })) });

    await recordUserAiSpend('user-1', { tokensIn: 10_000, tokensOut: 1_000 });

    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(`users/user-1/aiBudget/${budgetDayKey()}`);
    expect(writes[0].data.spentUsd.__inc).toBeCloseTo(estimateCostUsd({ tokensIn: 10_000, tokensOut: 1_000 }), 8);
    expect(writes[0].data.calls.__inc).toBe(1);
  });

  it('no escribe nada si la llamada no gastó tokens (fallback heurístico)', async () => {
    const writes = [];
    mocks.getAdminServices.mockResolvedValue({ db: fakeDb({}, (path, data) => writes.push({ path, data })) });
    await recordUserAiSpend('user-1', {});
    await recordUserAiSpend('user-1', { tokensIn: 0, tokensOut: 0 });
    expect(writes).toHaveLength(0);
  });

  it('el gasto recién apuntado se suma al acumulado global cacheado (el freno no llega tarde)', async () => {
    const day = budgetDayKey();
    // Global a $0.90 de un tope de $1.00: aún deja pasar.
    mocks.getAdminServices.mockResolvedValue({
      db: fakeDb({ [`aiMetrics/${day}`]: { x: { tokensOut: 360_000 } } }),
    });
    expect((await checkAiBudget({ userId: 'u' })).allowed).toBe(true);

    // Una llamada cara entra ANTES de que expire la caché de 30 s: el freno debe verla
    // igualmente, sin esperar al siguiente refresco desde Firestore.
    await recordUserAiSpend('u', { tokensOut: 100_000 }); // +$0.25
    const despues = await checkAiBudget({ userId: 'u' });
    expect(despues.allowed).toBe(false);
    expect(despues.scope).toBe('global');
  });
});
