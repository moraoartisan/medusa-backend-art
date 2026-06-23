import { MedusaRequest, MedusaResponse } from '@medusajs/framework';
import { StoreSearchProductsParamsType } from './validators';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { QueryContext } from '@medusajs/utils';

export const GET = async (
  req: MedusaRequest<StoreSearchProductsParamsType>,
  res: MedusaResponse
) => {
  const { 
    q, 
    limit, 
    offset, 
    order, 
    collection_id,
    category_id,
    type_id,
    materials,
    price_from,
    price_to,
    region_id,
    currency_code
  } = req.validatedQuery;

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);

  const filters: any = {};

  if (q) {
    filters.q = q;
  }

  if (collection_id) {
    filters.collection_id = collection_id;
  }

  if (category_id) {
    filters.categories = {
      id: category_id
    };
  }

  if (type_id) {
    filters.type_id = type_id;
  }

  if (materials) {
    filters.material = materials;
  }

  if (price_from !== undefined || price_to !== undefined) {
    filters.variants = {
      prices: {
        amount: {}
      }
    };

    if (price_from !== undefined) {
      filters.variants.prices.amount['$gte'] = price_from;
    }

    if (price_to !== undefined) {
      filters.variants.prices.amount['$lte'] = price_to;
    }
  }

  const { data: products, metadata } = await query.index({
    entity: 'product',
    fields: req.queryConfig.fields,
    filters,
    pagination: {
      skip: offset,
      take: limit,
      order:
        order === 'relevance'
          ? undefined
          : {
              [order.startsWith('-') ? order.slice(1) : order]: order.startsWith('-')
                ? 'DESC'
                : 'ASC'
            }
    },
    context: {
      variants: {
        calculated_price: QueryContext({
          region_id: region_id,
          currency_code: currency_code
        })
      }
    }
  });

  res.json({
    products,
    count: metadata?.estimate_count ?? products.length,
    limit,
    offset
  });
};
