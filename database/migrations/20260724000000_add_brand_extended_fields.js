/**
 * Add slug, description, website, country, and is_featured to brands.
 * Idempotent: safe when columns were already added via manual SQL.
 */

const slugify = (text) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

const uniqueSlugForBrand = async (knex, name, excludeId = null) => {
  const base = slugify(name) || 'brand';
  let candidate = base;
  let suffix = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = knex('brands').where({ slug: candidate }).whereNull('deleted_at');
    if (excludeId) q.whereNot({ id: excludeId });
    const existing = await q.first();
    if (!existing) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
};

const indexExists = async (knex, tableName, indexName) => {
  const result = await knex.raw(
    `
    SELECT COUNT(*) AS cnt
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
  `,
    [tableName, indexName],
  );

  return Number(result[0][0].cnt) > 0;
};

/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const addColumnIfMissing = async (columnName, builder) => {
    if (!(await knex.schema.hasColumn('brands', columnName))) {
      await knex.schema.alterTable('brands', (table) => builder(table));
    }
  };

  await addColumnIfMissing('slug', (table) => {
    table.string('slug', 120).nullable();
  });
  await addColumnIfMissing('description', (table) => {
    table.text('description').nullable();
  });
  await addColumnIfMissing('website', (table) => {
    table.string('website', 500).nullable();
  });
  await addColumnIfMissing('country', (table) => {
    table.string('country', 100).nullable();
  });
  await addColumnIfMissing('is_featured', (table) => {
    table.boolean('is_featured').defaultTo(false);
  });

  const brands = await knex('brands').select('id', 'name', 'slug', 'description');
  for (const brand of brands) {
    const updates = {};
    if (!brand.slug) {
      updates.slug = await uniqueSlugForBrand(knex, brand.name || `brand-${brand.id}`, brand.id);
    }
    if (brand.description === null) {
      updates.description = '';
    }
    if (Object.keys(updates).length) {
      await knex('brands').where({ id: brand.id }).update(updates);
    }
  }

  const remainingNullSlugs = await knex('brands').whereNull('slug').count({ count: '*' }).first();
  if (Number(remainingNullSlugs?.count) > 0) {
    throw new Error('Unable to backfill brand slugs before applying NOT NULL constraint');
  }

  const slugMeta = await knex.raw(`
    SELECT IS_NULLABLE AS nullable
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'brands'
      AND COLUMN_NAME = 'slug'
  `);

  if (slugMeta[0][0]?.nullable === 'YES') {
    await knex.schema.alterTable('brands', (table) => {
      table.string('slug', 120).notNullable().unique().alter();
    });
  }

  if (!(await indexExists(knex, 'brands', 'brands_slug_unique')) && !(await indexExists(knex, 'brands', 'slug'))) {
    await knex.schema.alterTable('brands', (table) => {
      table.index('slug');
    });
  }

  if (!(await indexExists(knex, 'brands', 'brands_country_index'))) {
    await knex.schema.alterTable('brands', (table) => {
      table.index('country');
    });
  }

  if (!(await indexExists(knex, 'brands', 'brands_is_featured_index'))) {
    await knex.schema.alterTable('brands', (table) => {
      table.index('is_featured');
    });
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const dropColumnIfExists = async (columnName) => {
    if (await knex.schema.hasColumn('brands', columnName)) {
      await knex.schema.alterTable('brands', (table) => {
        table.dropColumn(columnName);
      });
    }
  };

  for (const indexName of ['slug', 'brands_country_index', 'brands_is_featured_index', 'brands_slug_unique']) {
    if (await indexExists(knex, 'brands', indexName)) {
      const column = indexName === 'slug' || indexName === 'brands_slug_unique' ? 'slug' : indexName === 'brands_country_index' ? 'country' : 'is_featured';
      await knex.schema.alterTable('brands', (table) => {
        table.dropIndex([column], indexName);
      });
    }
  }

  await dropColumnIfExists('slug');
  await dropColumnIfExists('description');
  await dropColumnIfExists('website');
  await dropColumnIfExists('country');
  await dropColumnIfExists('is_featured');
};
