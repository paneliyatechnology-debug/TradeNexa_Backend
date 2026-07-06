/**
 * Relative upload path builders (segments under uploads/).
 * Used by upload middleware and file processing services.
 */

// ==========================================
// Path builders
// ==========================================

const uploadPaths = {
  /** Profile images: uploads/profiles/{userId}/ */
  userProfile: (userId) => ['profiles', String(userId)],

  /** Category images: uploads/categories/{categoryId}/ */
  category: (categoryId) => ['categories', String(categoryId)],

  /** Temporary inbox before record ID exists: uploads/categories/_inbox/{userId}/ */
  categoryInbox: (userId) => ['categories', '_inbox', String(userId)],

  /** Brand logos: uploads/brands/{brandId}/ */
  brand: (brandId) => ['brands', String(brandId)],

  /** Temporary inbox before brand ID exists: uploads/brands/_inbox/{userId}/ */
  brandInbox: (userId) => ['brands', '_inbox', String(userId)],

  /** Product thumbnails: uploads/products/{productId}/ */
  product: (productId) => ['products', String(productId)],

  /** Temporary inbox before product ID exists: uploads/products/_inbox/{userId}/ */
  productInbox: (userId) => ['products', '_inbox', String(userId)],

  /** Banner images: uploads/banners/{bannerId}/ */
  banner: (bannerId) => ['banners', String(bannerId)],

  /** Temporary inbox before banner ID exists: uploads/banners/_inbox/{userId}/ */
  bannerInbox: (userId) => ['banners', '_inbox', String(userId)],

  /** Offer banners: uploads/offers/{offerId}/ */
  offer: (offerId) => ['offers', String(offerId)],

  /** Temporary inbox before offer ID exists: uploads/offers/_inbox/{userId}/ */
  offerInbox: (userId) => ['offers', '_inbox', String(userId)],

  /** News thumbnails: uploads/news/{newsId}/ */
  news: (newsId) => ['news', String(newsId)],

  /** Temporary inbox before news ID exists: uploads/news/_inbox/{userId}/ */
  newsInbox: (userId) => ['news', '_inbox', String(userId)],

  /** Service icons: uploads/services/{serviceId}/ */
  service: (serviceId) => ['services', String(serviceId)],

  /** Temporary inbox before service ID exists: uploads/services/_inbox/{userId}/ */
  serviceInbox: (userId) => ['services', '_inbox', String(userId)],
};

// ==========================================
// Exports
// ==========================================

module.exports = { uploadPaths };
