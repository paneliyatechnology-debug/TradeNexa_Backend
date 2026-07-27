/**
 * TradeNexa API catalog for k6.
 * safe=true → included in default smoke/load (read-heavy).
 * write=true → only when INCLUDE_WRITES=true (mutating; use carefully).
 * Multipart uploads are omitted (need real files).
 */

export const IDS = {
  categoryId: __ENV.CATEGORY_ID || '1',
  subcategoryId: __ENV.SUBCATEGORY_ID || '1',
  productId: __ENV.PRODUCT_ID || '1',
  brandId: __ENV.BRAND_ID || '1',
  bannerId: __ENV.BANNER_ID || '1',
  offerId: __ENV.OFFER_ID || '1',
  serviceId: __ENV.SERVICE_ID || '1',
  newsId: __ENV.NEWS_ID || '1',
  rfqId: __ENV.RFQ_ID || '1',
  quotationId: __ENV.QUOTATION_ID || '1',
  inquiryId: __ENV.INQUIRY_ID || '1',
  inquiryQuotationId: __ENV.INQUIRY_QUOTATION_ID || '1',
  conversationId: __ENV.CONVERSATION_ID || '1',
  notificationId: __ENV.NOTIFICATION_ID || '1',
  searchHistoryId: __ENV.SEARCH_HISTORY_ID || '1',
  sellerId: __ENV.SELLER_ID || '1',
  businessTypeId: __ENV.BUSINESS_TYPE_ID || '1',
  countryId: __ENV.COUNTRY_ID || '1',
  stateId: __ENV.STATE_ID || '1',
  cityId: __ENV.CITY_ID || '1',
};

/** @type {Array<{ name: string, method: string, path: string, auth?: string|null, group: string, safe?: boolean, write?: boolean, body?: object|null, query?: Record<string,string>, absolute?: boolean }>} */
export const ENDPOINTS = [
  // System
  { name: 'Health', method: 'GET', path: '/health', auth: null, group: 'system', safe: true, absolute: true },

  // Auth
  { name: 'Send OTP', method: 'POST', path: '/auth/send-otp', auth: null, group: 'auth', write: true, body: { mobile_number: '+919999999999', recaptcha_token: '' } },
  { name: 'Verify OTP', method: 'POST', path: '/auth/verify-otp', auth: null, group: 'auth', write: true, body: { mobile_number: '+919999999999', otp: '000000', firebase_verification_id: 'k6-load' } },
  { name: 'Resend OTP', method: 'POST', path: '/auth/resend-otp', auth: null, group: 'auth', write: true, body: { mobile_number: '+919999999999', firebase_verification_id: 'k6-load' } },
  { name: 'Refresh Token', method: 'POST', path: '/auth/refresh-token', auth: null, group: 'auth', write: true, body: { refresh_token: __ENV.REFRESH_TOKEN || '' } },
  { name: 'Logout', method: 'POST', path: '/auth/logout', auth: 'any', group: 'auth', write: true, body: { refresh_token: __ENV.REFRESH_TOKEN || '' } },
  { name: 'Get Profile', method: 'GET', path: '/auth/profile', auth: 'any', group: 'auth', safe: true },
  { name: 'Delete Profile', method: 'DELETE', path: '/auth/profile', auth: 'any', group: 'auth', write: true },

  // Admin auth
  { name: 'Admin Login', method: 'POST', path: '/admin/auth/login', auth: null, group: 'admin-auth', write: true, body: { email: __ENV.ADMIN_EMAIL || 'admin@example.com', password: __ENV.ADMIN_PASSWORD || 'password' } },
  { name: 'Create Admin User', method: 'POST', path: '/admin/auth/users', auth: 'admin', group: 'admin-auth', write: true, body: { full_name: 'K6 Admin', email: 'k6-admin@test.com', password: 'LoadTest@123', role_code: 'supporter' } },

  // Dashboard
  { name: 'Seller Dashboard', method: 'GET', path: '/dashboard/seller', auth: 'seller', group: 'dashboard', safe: true },
  { name: 'Seller Top Products', method: 'GET', path: '/dashboard/seller/top-performing-products', auth: 'seller', group: 'dashboard', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Admin Dashboard', method: 'GET', path: '/dashboard/admin', auth: 'admin', group: 'dashboard', safe: true },

  // Roles / business types
  { name: 'List Roles', method: 'GET', path: '/roles', auth: null, group: 'roles', safe: true, query: { page: '1', limit: '20' } },
  { name: 'List Business Types', method: 'GET', path: '/business-types', auth: null, group: 'business-types', safe: true, query: { page: '1', limit: '20' } },
  { name: 'Get Business Type', method: 'GET', path: `/business-types/${IDS.businessTypeId}`, auth: null, group: 'business-types', safe: true },
  { name: 'Create Business Type', method: 'POST', path: '/business-types', auth: 'admin', group: 'business-types', write: true, body: { name: 'K6 Type', code: 'k6_type', role_id: 1 } },
  { name: 'Update Business Type', method: 'PUT', path: `/business-types/${IDS.businessTypeId}`, auth: 'admin', group: 'business-types', write: true, body: { name: 'K6 Type Updated' } },
  { name: 'Delete Business Type', method: 'DELETE', path: `/business-types/${IDS.businessTypeId}`, auth: 'admin', group: 'business-types', write: true },

  // Locations
  { name: 'List Countries', method: 'GET', path: '/locations/countries', auth: null, group: 'locations', safe: true, query: { page: '1', limit: '20' } },
  { name: 'List States', method: 'GET', path: '/locations/states', auth: null, group: 'locations', safe: true, query: { country_id: IDS.countryId, page: '1', limit: '20' } },
  { name: 'List Cities', method: 'GET', path: '/locations/cities', auth: null, group: 'locations', safe: true, query: { state_id: IDS.stateId, page: '1', limit: '20' } },

  // Categories
  { name: 'List Categories', method: 'GET', path: '/categories', auth: null, group: 'categories', safe: true, query: { page: '1', limit: '20' } },
  { name: 'Get Category', method: 'GET', path: `/categories/${IDS.categoryId}`, auth: null, group: 'categories', safe: true },
  { name: 'Delete Category', method: 'DELETE', path: `/categories/${IDS.categoryId}`, auth: 'admin', group: 'categories', write: true },
  { name: 'List Subcategories', method: 'GET', path: `/categories/${IDS.categoryId}/subcategories`, auth: null, group: 'categories', safe: true, query: { page: '1', limit: '20' } },
  { name: 'Get Subcategory', method: 'GET', path: `/categories/${IDS.categoryId}/subcategories/${IDS.subcategoryId}`, auth: null, group: 'categories', safe: true },
  { name: 'Delete Subcategory', method: 'DELETE', path: `/categories/${IDS.categoryId}/subcategories/${IDS.subcategoryId}`, auth: 'admin', group: 'categories', write: true },

  // Banners
  { name: 'List Banners', method: 'GET', path: '/banners', auth: null, group: 'banners', safe: true, query: { page: '1', limit: '20' } },
  { name: 'Get Banner', method: 'GET', path: `/banners/${IDS.bannerId}`, auth: null, group: 'banners', safe: true },
  { name: 'Delete Banner', method: 'DELETE', path: `/banners/${IDS.bannerId}`, auth: 'admin', group: 'banners', write: true },

  // Products
  { name: 'List Products', method: 'GET', path: '/products', auth: null, group: 'products', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Trending Products', method: 'GET', path: '/products/trending', auth: null, group: 'products', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Related Products', method: 'GET', path: '/products/related', auth: null, group: 'products', safe: true, query: { subcategory_id: IDS.subcategoryId, page: '1', limit: '10' } },
  { name: 'My Products', method: 'GET', path: '/products/my', auth: 'seller', group: 'products', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Search History', method: 'GET', path: '/products/search-history', auth: 'any', group: 'products', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Clear Search History', method: 'DELETE', path: '/products/search-history', auth: 'any', group: 'products', write: true },
  { name: 'Delete Search History Item', method: 'DELETE', path: `/products/search-history/${IDS.searchHistoryId}`, auth: 'any', group: 'products', write: true },
  { name: 'Admin Product Reviews', method: 'GET', path: '/products/admin/reviews', auth: 'admin', group: 'products', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Approve Products', method: 'POST', path: '/products/admin/approve', auth: 'admin', group: 'products', write: true, body: { product_ids: [Number(IDS.productId)] } },
  { name: 'Request Product Revision', method: 'POST', path: '/products/admin/request-revision', auth: 'admin', group: 'products', write: true, body: { product_ids: [Number(IDS.productId)], remarks: 'k6 revision' } },
  { name: 'Reject Products', method: 'POST', path: '/products/admin/reject', auth: 'admin', group: 'products', write: true, body: { product_ids: [Number(IDS.productId)], remarks: 'k6 reject' } },
  { name: 'Get Product', method: 'GET', path: `/products/${IDS.productId}`, auth: null, group: 'products', safe: true },
  { name: 'Product Review History', method: 'GET', path: `/products/${IDS.productId}/reviews`, auth: 'seller', group: 'products', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Delete Product Media', method: 'DELETE', path: `/products/${IDS.productId}/media`, auth: 'seller', group: 'products', write: true, body: { image_ids: [], video_ids: [] } },
  { name: 'Delete Product', method: 'DELETE', path: `/products/${IDS.productId}`, auth: 'seller', group: 'products', write: true },

  // Wishlist
  { name: 'Get Wishlist', method: 'GET', path: '/wishlist', auth: 'buyer', group: 'wishlist', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Check Wishlist', method: 'GET', path: `/wishlist/check/${IDS.productId}`, auth: 'buyer', group: 'wishlist', safe: true },
  { name: 'Add Wishlist', method: 'POST', path: '/wishlist', auth: 'buyer', group: 'wishlist', write: true, body: { product_id: Number(IDS.productId) } },
  { name: 'Toggle Wishlist', method: 'POST', path: '/wishlist/toggle', auth: 'buyer', group: 'wishlist', write: true, body: { product_id: Number(IDS.productId) } },
  { name: 'Remove Wishlist', method: 'DELETE', path: `/wishlist/${IDS.productId}`, auth: 'buyer', group: 'wishlist', write: true },

  // Sellers
  { name: 'List Sellers', method: 'GET', path: '/sellers', auth: null, group: 'sellers', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Verified Sellers', method: 'GET', path: '/sellers/verified', auth: null, group: 'sellers', safe: true },
  { name: 'Nearby Sellers', method: 'GET', path: '/sellers/nearby', auth: null, group: 'sellers', safe: true, query: { latitude: '23.0225', longitude: '72.5714', radius_km: '50' } },
  { name: 'Get Seller', method: 'GET', path: `/sellers/${IDS.sellerId}`, auth: null, group: 'sellers', safe: true },
  { name: 'Seller Products', method: 'GET', path: `/sellers/${IDS.sellerId}/products`, auth: null, group: 'sellers', safe: true, query: { page: '1', limit: '10' } },

  // Brands
  { name: 'List Brands', method: 'GET', path: '/brands', auth: null, group: 'brands', safe: true, query: { page: '1', limit: '20' } },
  { name: 'Get Brand', method: 'GET', path: `/brands/${IDS.brandId}`, auth: null, group: 'brands', safe: true },
  { name: 'Delete Brand', method: 'DELETE', path: `/brands/${IDS.brandId}`, auth: 'admin', group: 'brands', write: true },

  // Offers
  { name: 'List Offers', method: 'GET', path: '/offers', auth: null, group: 'offers', safe: true, query: { page: '1', limit: '20' } },
  { name: 'Get Offer', method: 'GET', path: `/offers/${IDS.offerId}`, auth: null, group: 'offers', safe: true },
  { name: 'Delete Offer', method: 'DELETE', path: `/offers/${IDS.offerId}`, auth: 'admin', group: 'offers', write: true },

  // RFQs
  { name: 'List RFQs', method: 'GET', path: '/rfqs', auth: null, group: 'rfqs', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Latest RFQs', method: 'GET', path: '/rfqs/latest', auth: null, group: 'rfqs', safe: true, query: { limit: '10' } },
  { name: 'Get RFQ', method: 'GET', path: `/rfqs/${IDS.rfqId}`, auth: 'any', group: 'rfqs', safe: true },
  { name: 'My RFQs', method: 'GET', path: '/rfqs/my', auth: 'buyer', group: 'rfqs', safe: true, query: { page: '1', limit: '10' } },
  {
    name: 'Create RFQ',
    method: 'POST',
    path: '/rfqs',
    auth: 'buyer',
    group: 'rfqs',
    write: true,
    body: {
      title: 'K6 Load RFQ',
      category_id: Number(IDS.categoryId),
      subcategory_id: Number(IDS.subcategoryId),
      description: 'K6 load test description long enough',
      quantity: 10,
      unit: 'pcs',
      quotation_deadline: '2030-12-31T23:59:59.000Z',
      address_line_1: 'Test Address Line',
      city: 'Ahmedabad',
      state: 'Gujarat',
      country: 'India',
      pincode: '380001',
    },
  },
  { name: 'Publish RFQ', method: 'POST', path: `/rfqs/${IDS.rfqId}/publish`, auth: 'buyer', group: 'rfqs', write: true },
  { name: 'Update RFQ', method: 'PUT', path: `/rfqs/${IDS.rfqId}`, auth: 'buyer', group: 'rfqs', write: true, body: { title: 'K6 RFQ Updated' } },
  { name: 'Cancel RFQ', method: 'POST', path: `/rfqs/${IDS.rfqId}/cancel`, auth: 'buyer', group: 'rfqs', write: true },
  { name: 'Close RFQ', method: 'POST', path: `/rfqs/${IDS.rfqId}/close`, auth: 'buyer', group: 'rfqs', write: true },
  { name: 'Delete RFQ', method: 'DELETE', path: `/rfqs/${IDS.rfqId}`, auth: 'buyer', group: 'rfqs', write: true },
  { name: 'RFQ Quotations', method: 'GET', path: `/rfqs/${IDS.rfqId}/quotations`, auth: 'buyer', group: 'rfqs', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Compare RFQ Quotations', method: 'GET', path: `/rfqs/${IDS.rfqId}/quotations/compare`, auth: 'buyer', group: 'rfqs', safe: true },
  { name: 'Seller RFQ Feed', method: 'GET', path: '/rfqs/seller/feed', auth: 'seller', group: 'rfqs', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Seller RFQ Detail', method: 'GET', path: `/rfqs/seller/${IDS.rfqId}`, auth: 'seller', group: 'rfqs', safe: true },
  { name: 'Seller Quotations', method: 'GET', path: '/rfqs/seller/quotations', auth: 'seller', group: 'rfqs', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Seller Quotation Detail', method: 'GET', path: `/rfqs/seller/quotations/${IDS.quotationId}`, auth: 'seller', group: 'rfqs', safe: true },
  { name: 'Submit RFQ Quotation', method: 'POST', path: `/rfqs/${IDS.rfqId}/quotations`, auth: 'seller', group: 'rfqs', write: true, body: { price: 100, quantity: 10, unit: 'pcs' } },
  { name: 'Get Quotation', method: 'GET', path: `/rfqs/quotations/${IDS.quotationId}`, auth: 'any', group: 'rfqs', safe: true },
  { name: 'Update Quotation', method: 'PUT', path: `/rfqs/quotations/${IDS.quotationId}`, auth: 'seller', group: 'rfqs', write: true, body: { price: 110 } },
  { name: 'Withdraw Quotation', method: 'POST', path: `/rfqs/quotations/${IDS.quotationId}/withdraw`, auth: 'seller', group: 'rfqs', write: true },
  { name: 'Accept Quotation', method: 'POST', path: `/rfqs/quotations/${IDS.quotationId}/accept`, auth: 'buyer', group: 'rfqs', write: true },
  { name: 'Reject Quotation', method: 'POST', path: `/rfqs/quotations/${IDS.quotationId}/reject`, auth: 'buyer', group: 'rfqs', write: true },
  { name: 'Request Quotation Revision', method: 'POST', path: `/rfqs/quotations/${IDS.quotationId}/request-revision`, auth: 'buyer', group: 'rfqs', write: true, body: { buyer_remark: 'Please revise' } },
  { name: 'Revise Quotation', method: 'POST', path: `/rfqs/quotations/${IDS.quotationId}/revise`, auth: 'seller', group: 'rfqs', write: true, body: { price: 95 } },
  { name: 'Admin RFQ List', method: 'GET', path: '/rfqs/admin/list', auth: 'admin', group: 'rfqs', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Admin RFQ Detail', method: 'GET', path: `/rfqs/admin/${IDS.rfqId}`, auth: 'admin', group: 'rfqs', safe: true },
  { name: 'Admin RFQ Status', method: 'PATCH', path: `/rfqs/admin/${IDS.rfqId}/status`, auth: 'admin', group: 'rfqs', write: true, body: { status: 'CLOSED' } },
  { name: 'Admin RFQ Quotations', method: 'GET', path: '/rfqs/admin/quotations', auth: 'admin', group: 'rfqs', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Admin RFQ Summary', method: 'GET', path: '/rfqs/admin/dashboard/summary', auth: 'admin', group: 'rfqs', safe: true },

  // Inquiries
  { name: 'Create Inquiry', method: 'POST', path: '/inquiries', auth: 'buyer', group: 'inquiries', write: true, body: { product_id: Number(IDS.productId), quantity: 10, message: 'K6 load test inquiry message' } },
  { name: 'My Inquiries', method: 'GET', path: '/inquiries/my', auth: 'buyer', group: 'inquiries', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Seller Inquiries', method: 'GET', path: '/inquiries/seller', auth: 'seller', group: 'inquiries', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Seller Inquiry Quotations', method: 'GET', path: '/inquiries/seller/quotations', auth: 'seller', group: 'inquiries', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Get Inquiry', method: 'GET', path: `/inquiries/${IDS.inquiryId}`, auth: 'any', group: 'inquiries', safe: true },
  { name: 'Update Inquiry', method: 'PUT', path: `/inquiries/${IDS.inquiryId}`, auth: 'buyer', group: 'inquiries', write: true, body: { message: 'Updated k6 inquiry message' } },
  { name: 'Cancel Inquiry', method: 'POST', path: `/inquiries/${IDS.inquiryId}/cancel`, auth: 'buyer', group: 'inquiries', write: true },
  { name: 'Reject Inquiry', method: 'POST', path: `/inquiries/${IDS.inquiryId}/reject`, auth: 'seller', group: 'inquiries', write: true, body: { reason: 'k6' } },
  { name: 'Submit Inquiry Quotation', method: 'POST', path: `/inquiries/${IDS.inquiryId}/quotations`, auth: 'seller', group: 'inquiries', write: true, body: { price: 50, quantity: 10 } },
  { name: 'Start Inquiry Chat', method: 'POST', path: `/inquiries/${IDS.inquiryId}/chat`, auth: 'any', group: 'inquiries', write: true },
  { name: 'Update Inquiry Quotation', method: 'PUT', path: `/inquiries/quotations/${IDS.inquiryQuotationId}`, auth: 'seller', group: 'inquiries', write: true, body: { price: 55 } },
  { name: 'Withdraw Inquiry Quotation', method: 'POST', path: `/inquiries/quotations/${IDS.inquiryQuotationId}/withdraw`, auth: 'seller', group: 'inquiries', write: true },
  { name: 'Accept Inquiry Quotation', method: 'POST', path: `/inquiries/quotations/${IDS.inquiryQuotationId}/accept`, auth: 'buyer', group: 'inquiries', write: true },
  { name: 'Reject Inquiry Quotation', method: 'POST', path: `/inquiries/quotations/${IDS.inquiryQuotationId}/reject`, auth: 'buyer', group: 'inquiries', write: true },

  // Chat
  { name: 'List Conversations', method: 'GET', path: '/chats/conversations', auth: 'any', group: 'chats', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Unread Summary', method: 'GET', path: '/chats/unread-summary', auth: 'any', group: 'chats', safe: true },
  { name: 'Start Conversation', method: 'POST', path: '/chats/conversations', auth: 'buyer', group: 'chats', write: true, body: { seller_id: Number(IDS.sellerId) } },
  { name: 'RFQ Conversations', method: 'GET', path: `/chats/rfqs/${IDS.rfqId}/conversations`, auth: 'buyer', group: 'chats', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Inquiry Conversations', method: 'GET', path: `/chats/inquiries/${IDS.inquiryId}/conversations`, auth: 'any', group: 'chats', safe: true, query: { page: '1', limit: '10' } },
  { name: 'Get Conversation', method: 'GET', path: `/chats/conversations/${IDS.conversationId}`, auth: 'any', group: 'chats', safe: true },
  { name: 'List Messages', method: 'GET', path: `/chats/conversations/${IDS.conversationId}/messages`, auth: 'any', group: 'chats', safe: true, query: { page: '1', limit: '20' } },
  { name: 'Send Message', method: 'POST', path: `/chats/conversations/${IDS.conversationId}/messages`, auth: 'any', group: 'chats', write: true, body: { message_type: 'TEXT', content: 'K6 load test message' } },
  { name: 'Mark Read', method: 'POST', path: `/chats/conversations/${IDS.conversationId}/read`, auth: 'any', group: 'chats', write: true, body: {} },

  // Notifications
  { name: 'List Notifications', method: 'GET', path: '/notifications', auth: 'any', group: 'notifications', safe: true, query: { page: '1', limit: '20' } },
  { name: 'Unread Notification Count', method: 'GET', path: '/notifications/unread-count', auth: 'any', group: 'notifications', safe: true },
  { name: 'Mark Notification Read', method: 'PATCH', path: `/notifications/${IDS.notificationId}/read`, auth: 'any', group: 'notifications', write: true },
  { name: 'Mark Many Notifications Read', method: 'POST', path: '/notifications/read', auth: 'any', group: 'notifications', write: true, body: { ids: [Number(IDS.notificationId)] } },
  { name: 'Mark All Notifications Read', method: 'POST', path: '/notifications/read-all', auth: 'any', group: 'notifications', write: true, body: {} },

  // Services / News
  { name: 'List Services', method: 'GET', path: '/services', auth: null, group: 'services', safe: true, query: { page: '1', limit: '20' } },
  { name: 'Get Service', method: 'GET', path: `/services/${IDS.serviceId}`, auth: null, group: 'services', safe: true },
  { name: 'Delete Service', method: 'DELETE', path: `/services/${IDS.serviceId}`, auth: 'admin', group: 'services', write: true },
  { name: 'List News', method: 'GET', path: '/news', auth: null, group: 'news', safe: true, query: { page: '1', limit: '20' } },
  { name: 'Get News', method: 'GET', path: `/news/${IDS.newsId}`, auth: null, group: 'news', safe: true },
  { name: 'Delete News', method: 'DELETE', path: `/news/${IDS.newsId}`, auth: 'admin', group: 'news', write: true },
];

export function selectEndpoints() {
  const includeWrites = String(__ENV.INCLUDE_WRITES || 'false').toLowerCase() === 'true';
  const groupFilter = (__ENV.GROUP || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return ENDPOINTS.filter((ep) => {
    if (groupFilter.length && !groupFilter.includes(ep.group)) return false;
    if (includeWrites) return true;
    return Boolean(ep.safe);
  });
}
