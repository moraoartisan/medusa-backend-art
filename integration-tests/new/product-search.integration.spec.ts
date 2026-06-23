import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { IProductModuleService, MedusaContainer } from '@medusajs/framework/types';
import { Modules, ProductStatus } from '@medusajs/framework/utils';
import { createProductsWorkflow } from '@medusajs/medusa/core-flows';

const SEARCH_PATH = '/store/search';

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('Store Search Price Range Filter', () => {
      let container: MedusaContainer;

      beforeAll(async () => {
        container = getContainer();
      });

      beforeEach(async () => {
        const productModuleService = container.resolve<IProductModuleService>(Modules.PRODUCT);

        // Czyścimy i tworzymy produkty testowe o różnych cenach
        await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: 'Tani Produkt',
                status: ProductStatus.PUBLISHED,
                options: [{ title: 'Size', values: ['S'] }],
                variants: [
                  {
                    title: 'S',
                    sku: 'CHEAP-1',
                    prices: [{ currency_code: 'eur', amount: 100 }] // 1.00 EUR
                  }
                ]
              },
              {
                title: 'Średni Produkt',
                status: ProductStatus.PUBLISHED,
                options: [{ title: 'Size', values: ['M'] }],
                variants: [
                  {
                    title: 'M',
                    sku: 'MEDIUM-1',
                    prices: [{ currency_code: 'eur', amount: 500 }] // 5.00 EUR
                  }
                ]
              },
              {
                title: 'Drogi Produkt',
                status: ProductStatus.PUBLISHED,
                options: [{ title: 'Size', values: ['L'] }],
                variants: [
                  {
                    title: 'L',
                    sku: 'EXPENSIVE-1',
                    prices: [{ currency_code: 'eur', amount: 1000 }] // 10.00 EUR
                  }
                ]
              }
            ]
          }
        });
      });

      test('should return all products when no price filters are applied', async () => {
        const response = await api.get(SEARCH_PATH);
        expect(response.status).toEqual(200);
        expect(response.data.products.length).toBeGreaterThanOrEqual(3);
      });

      test('should filter products by min_price', async () => {
        // Produkty droższe lub równe 500 (Średni i Drogi)
        const response = await api.get(`${SEARCH_PATH}?min_price=500`);

        expect(response.status).toEqual(200);
        const titles = response.data.products.map((p) => p.title);
        expect(titles).toContain('Średni Produkt');
        expect(titles).toContain('Drogi Produkt');
        expect(titles).not.toContain('Tani Produkt');
      });

      test('should filter products by max_price', async () => {
        // Produkty tańsze lub równe 500 (Tani i Średni)
        const response = await api.get(`${SEARCH_PATH}?max_price=500`);

        expect(response.status).toEqual(200);
        const titles = response.data.products.map((p) => p.title);
        expect(titles).toContain('Tani Produkt');
        expect(titles).toContain('Średni Produkt');
        expect(titles).not.toContain('Drogi Produkt');
      });

      test('should filter products by price range (min and max)', async () => {
        // Tylko Średni Produkt (cena 500)
        const response = await api.get(`${SEARCH_PATH}?min_price=400&max_price=600`);

        expect(response.status).toEqual(200);
        expect(response.data.products.length).toEqual(1);
        expect(response.data.products[0].title).toEqual('Średni Produkt');
      });

      test('should return empty list when no products match price range', async () => {
        const response = await api.get(`${SEARCH_PATH}?min_price=2000`);

        expect(response.status).toEqual(200);
        expect(response.data.products.length).toEqual(0);
      });
    });
  }
});

jest.setTimeout(120 * 1000);
