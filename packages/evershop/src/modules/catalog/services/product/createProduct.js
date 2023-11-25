const { hookable } = require('@evershop/evershop/src/lib/util/hookable');
const { get, getSync } = require('@evershop/evershop/src/lib/util/registry');
const {
  startTransaction,
  commit,
  rollback,
  insert,
  select,
  update,
  insertOnUpdate
} = require('@evershop/postgres-query-builder');
const {
  getConnection
} = require('@evershop/evershop/src/lib/postgres/connection');
const { getAjv } = require('../../../base/services/getAjv');
const productDataSchema = require('./productDataSchema.json');

function validateProductDataBeforeInsert(data) {
  const ajv = getAjv();
  productDataSchema.required = [
    'name',
    'url_key',
    'status',
    'sku',
    'qty',
    'price',
    'group_id',
    'visibility'
  ];
  const jsonSchema = getSync('createProductDataJsonSchema', productDataSchema);
  const validate = ajv.compile(jsonSchema);
  const valid = validate(data);
  if (valid) {
    return data;
  } else {
    throw new Error(validate.errors[0].message);
  }
}

async function insertProductInventory(inventoryData, productId, connection) {
  // Save the product inventory
  await insert('product_inventory')
    .given(inventoryData)
    .prime('product_inventory_product_id', productId)
    .execute(connection);
}

async function insertProductAttributes(attributes, productId, connection) {
  // Looping attributes array
  for (let i = 0; i < attributes.length; i += 1) {
    const attribute = attributes[i];
    if (attribute.value) {
      const attr = await select()
        .from('attribute')
        .where('attribute_code', '=', attribute.attribute_code)
        .load(connection);

      if (!attr) {
        return;
      }

      if (attr.type === 'textarea' || attr.type === 'text') {
        const flag = await select('attribute_id')
          .from('product_attribute_value_index')
          .where('product_id', '=', productId)
          .and('attribute_id', '=', attr.attribute_id)
          .load(connection);

        if (flag) {
          await update('product_attribute_value_index')
            .given({ option_text: attribute.value.trim() })
            .where('product_id', '=', productId)
            .and('attribute_id', '=', attr.attribute_id)
            .execute(connection);
        } else {
          await insert('product_attribute_value_index')
            .prime('product_id', productId)
            .prime('attribute_id', attr.attribute_id)
            .prime('option_text', attribute.value.trim())
            .execute(connection);
        }
      } else if (attr.type === 'multiselect') {
        await Promise.all(
          attribute.value.map(() =>
            (async () => {
              const option = await select()
                .from('attribute_option')
                .where(
                  'attribute_option_id',
                  '=',
                  parseInt(attribute.value, 10)
                )
                .load(connection);

              if (option === null) {
                return;
              }
              await insertOnUpdate('product_attribute_value_index', [
                'product_id',
                'attribute_id',
                'option_id'
              ])
                .prime('option_id', option.attribute_option_id)
                .prime('product_id', productId)
                .prime('attribute_id', attr.attribute_id)
                .prime('option_text', option.option_text)
                .execute(connection);
            })()
          )
        );
      } else if (attr.type === 'select') {
        const option = await select()
          .from('attribute_option')
          .where('attribute_option_id', '=', parseInt(attribute.value, 10))
          .load(connection);
        // eslint-disable-next-line no-continue
        if (option === false) {
          continue;
        }
        // Insert new option
        await insertOnUpdate('product_attribute_value_index', [
          'product_id',
          'attribute_id',
          'option_id'
        ])
          .prime('option_id', option.attribute_option_id)
          .prime('product_id', productId)
          .prime('attribute_id', attr.attribute_id)
          .prime('option_text', option.option_text)
          .execute(connection);
      } else {
        await insertOnUpdate('product_attribute_value_index', [
          'product_id',
          'attribute_id',
          'option_id'
        ])
          .prime('option_text', attribute.value)
          .execute(connection);
      }
    }
  }
}

async function insertProductImages(images, productId, connection) {
  await Promise.all(
    images.map((f, index) =>
      (async () => {
        await insert('product_image')
          .given({ origin_image: f, is_main: index === 0 })
          .prime('product_image_product_id', productId)
          .execute(connection);
      })()
    )
  );
}

async function insertProductData(data, connection) {
  const result = await insert('product').given(data).execute(connection);
  const description = await insert('product_description')
    .given(data)
    .prime('product_description_product_id', result.product_id)
    .execute(connection);

  return {
    ...description,
    ...result
  };
}

/**
 * Create product service. This service will create a product with all related data
 * @param {Object} data
 */
async function createProduct(data) {
  const connection = await getConnection();
  await startTransaction(connection);
  try {
    const productData = await get('productDataBeforeCreate', data);

    // Validate product data
    validateProductDataBeforeInsert(productData);

    // Insert product data
    const product = await hookable(insertProductData, { connection })(
      productData,
      connection
    );

    // Insert product inventory
    await hookable(insertProductInventory, { connection, product })(
      productData,
      product.insertId,
      connection
    );

    // Insert product attributes
    await hookable(insertProductAttributes, {
      connection,
      product
    })(productData.attributes || [], product.insertId, connection);

    // Insert product images
    await hookable(insertProductImages, { connection, product })(
      productData.images || [],
      product.insertId,
      connection
    );
    await commit(connection);
    return product;
  } catch (e) {
    await rollback(connection);
    throw e;
  }
}

module.exports = async (data) => {
  const result = await hookable(createProduct)(data);
  return result;
};
