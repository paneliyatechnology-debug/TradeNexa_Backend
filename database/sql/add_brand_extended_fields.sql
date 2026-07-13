-- Add extended fields to brands (slug, description, website, country, is_featured)
-- Run via migration: npx knex migrate:latest

ALTER TABLE brands
  ADD COLUMN slug VARCHAR(120) NULL AFTER name,
  ADD COLUMN description TEXT NULL AFTER slug,
  ADD COLUMN website VARCHAR(500) NULL AFTER description,
  ADD COLUMN country VARCHAR(100) NULL AFTER website,
  ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0 AFTER is_popular;

-- Backfill slug from name (ensure uniqueness manually if needed)
UPDATE brands SET slug = LOWER(REPLACE(TRIM(name), ' ', '-')), description = '' WHERE slug IS NULL;

ALTER TABLE brands
  MODIFY slug VARCHAR(120) NOT NULL,
  ADD UNIQUE KEY brands_slug_unique (slug),
  ADD INDEX brands_country_index (country),
  ADD INDEX brands_is_featured_index (is_featured);
