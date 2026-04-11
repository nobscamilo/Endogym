import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('../../src/lib/auth.js', () => {
  class AuthenticationError extends Error {}
  return {
    AuthenticationError,
    getAuthenticatedUser: mocks.getAuthenticatedUser,
  };
});

vi.mock('../../src/lib/logger.js', () => ({
  withTrace: async (_operation, handler) => handler({ traceId: 'trace-test' }),
}));

const { GET } = await import('../../src/app/api/products/barcode/route.js');

async function readJson(response) {
  return response.json();
}

describe('/api/products/barcode route', () => {
  beforeEach(() => {
    mocks.getAuthenticatedUser.mockReset();
    mocks.getAuthenticatedUser.mockResolvedValue({ uid: 'user-1' });
    vi.restoreAllMocks();
  });

  it('returns 400 for invalid barcode format', async () => {
    const response = await GET(new Request('http://localhost/api/products/barcode?code=abc'));
    const json = await readJson(response);

    expect(response.status).toBe(400);
    expect(json.error).toContain('Código de barras inválido');
  });

  it('returns 404 when product is not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 0 }),
    }));

    const response = await GET(new Request('http://localhost/api/products/barcode?code=8410100083897'));
    const json = await readJson(response);

    expect(response.status).toBe(404);
    expect(json.error).toContain('Producto no encontrado');
  });

  it('returns normalized nutrition data for valid products', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: 'Yogur natural',
          brands: 'Marca X',
          serving_size: '125 g',
          serving_quantity: 125,
          serving_quantity_unit: 'g',
          nova_group: 2,
          nutriments: {
            'energy-kcal_100g': 62,
            proteins_100g: 3.9,
            carbohydrates_100g: 6.2,
            fat_100g: 2.9,
            sugars_100g: 5.8,
            fiber_100g: 0,
          },
        },
      }),
    }));

    const response = await GET(new Request('http://localhost/api/products/barcode?code=8410100083897'));
    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.product.name).toBe('Yogur natural');
    expect(json.product.nutritionPerServing.calories).toBeGreaterThan(0);
    expect(json.product.glycemic.indexEstimate).toBeGreaterThanOrEqual(0);
    expect(json.product.insulinIndexEstimate).toBeGreaterThanOrEqual(0);
  });
});
