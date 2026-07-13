// Product CRUD handlers with multipart thumbnail upload support.

const productModel = require('../models/productModel');
const productService = require('../services/productService');
const productReviewService = require('../services/productReviewService');
const wishlistService = require('../services/wishlistService');
const { success, AppError } = require('../utils/response');
const { HTTP_STATUS, ADMIN_PANEL_ROLE_CODES } = require('../constants');
const { PRODUCT_APPROVAL_STATUS } = require('../constants/product');

// ==========================================
// Product Operations
// ==========================================

/** Default values for extended product fields (additive only). */
const PRODUCT_EXTENDED_FIELD_DEFAULTS = {
  category_id: null,
  subcategory_id: null,
  short_description: null,
  description: null,
  material: null,
  country_of_origin: null,
  product_condition: null,
  stock_status: null,
  stock_quantity: null,
  warranty: null,
  hsn_code: null,
  gst_percentage: null,
  show_price: null,
  accept_inquiry: null,
  search_tags: [],
  specifications: [],
  approval_status: null,
  review_version: null,
  submitted_at: null,
  resubmitted_at: null,
  reviewed_at: null,
  reviewed_by: null,
  latest_review_remarks: null,
};

/** Merge extended product fields onto a list/card payload without changing existing keys. */
const withExtendedProductFields = (product = {}) => ({
  ...PRODUCT_EXTENDED_FIELD_DEFAULTS,
  category_id: product.category_id ?? null,
  subcategory_id: product.subcategory_id ?? null,
  short_description: product.short_description ?? null,
  description: product.description ?? null,
  material: product.material ?? null,
  country_of_origin: product.country_of_origin ?? null,
  product_condition: product.product_condition ?? null,
  stock_status: product.stock_status ?? null,
  stock_quantity: product.stock_quantity ?? null,
  warranty: product.warranty ?? null,
  hsn_code: product.hsn_code ?? null,
  gst_percentage: product.gst_percentage ?? null,
  show_price: product.show_price ?? null,
  accept_inquiry: product.accept_inquiry ?? null,
  search_tags: Array.isArray(product.search_tags) ? product.search_tags : [],
  specifications: Array.isArray(product.specifications) ? product.specifications : [],
  approval_status: product.approval_status ?? null,
  review_version: product.review_version ?? null,
  submitted_at: product.submitted_at ?? null,
  resubmitted_at: product.resubmitted_at ?? null,
  reviewed_at: product.reviewed_at ?? null,
  reviewed_by: product.reviewed_by ?? null,
  latest_review_remarks: product.latest_review_remarks ?? null,
});

/** Resolve role code from req.user (string, { code }, or role_code). */
const resolveRoleCode = (user) => {
  if (!user) return null;
  if (typeof user.role === 'string') return user.role;
  if (user.role?.code) return user.role.code;
  if (typeof user.role_code === 'string') return user.role_code;
  return null;
};

/** True when user has an admin-panel role (admin | super_admin | supporter). */
const isAdminUser = (user) => ADMIN_PANEL_ROLE_CODES.includes(resolveRoleCode(user));

const pickProductListFilters = (req, extra = {}) => ({
  search: req.query.search,
  brand_id: req.query.brand_id,
  city_id: req.query.city_id,
  exclude_seller_id: req.query.seller_id,
  min_price: req.query.min_price,
  max_price: req.query.max_price,
  page: req.query.page,
  limit: req.query.limit,
  sort_by: req.query.sort_by,
  sort_order: req.query.sort_order,
  ...extra,
});

/** Merge is_wishlist filter when query param is present (requires authenticated user). */
const withWishlistFilter = (req, filters) => {
  if (req.query.is_wishlist === undefined) return filters;

  if (!req.user?.id) {
    throw new AppError(
      'Authentication required to filter by is_wishlist',
      HTTP_STATUS.UNAUTHORIZED,
    );
  }

  return {
    ...filters,
    is_wishlist: req.query.is_wishlist === 'true',
    user_id: req.user.id,
  };
};

/** Ensure the user may modify a product (assigned seller or admin). */
const assertCanModifyProduct = async (productId, user) => {
  const existing = await productModel.findProductById(productId, { raw: true });
  if (!existing) {
    throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND);
  }

  if (!isAdminUser(user) && String(existing.seller_id) !== String(user.id)) {
    throw new AppError('Forbidden: You can only modify your own products', HTTP_STATUS.FORBIDDEN);
  }

  return existing;
};

/** Buyers only see approved+active; owner/admin can see any status (incl. revision_required). */
const assertCanViewProduct = (product, user) => {
  const approved =
    product.approval_status === PRODUCT_APPROVAL_STATUS.APPROVED || !product.approval_status;
  const active = product.is_active !== false && product.is_active !== 0;

  if (approved && active) return true;
  if (!user) return false;
  if (isAdminUser(user)) return true;
  if (String(product.seller_id) === String(user.id)) return true;
  return false;
};

/**
 * POST /products
 * Create a new product listing — starts in_review (not buyer-visible until approved).
 */
const createProduct = async (req, res, next) => {
  try {
    const product = await productService.createProduct(
      req.body,
      req.files,
      req.user?.id,
      req.user?.role,
    );
    return success(
      res,
      'Product created successfully and submitted for review',
      product,
      HTTP_STATUS.CREATED,
    );
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products/:id
 * Retrieve a single product by ID (public only if approved).
 */
const getProduct = async (req, res, next) => {
  try {
    const raw = await productModel.findProductById(req.params.id, { raw: true });
    if (!raw) {
      return next(new AppError('Product not found', HTTP_STATUS.NOT_FOUND));
    }
    if (!assertCanViewProduct(raw, req.user)) {
      return next(new AppError('Product not found', HTTP_STATUS.NOT_FOUND));
    }

    const product = await productModel.findProductDetailById(req.params.id);
    const withWishlist = await wishlistService.attachWishlistToProductDetail(product, req.user?.id);
    return success(res, 'Product details retrieved successfully', withWishlist);
  } catch (err) {
    next(err);
  }
};

const buildProductListFilters = (req, { defaultActiveOnly = true, publicOnly = false } = {}) => ({
  search: req.query.search,
  category_id: req.query.category_id,
  subcategory_id: req.query.subcategory_id,
  city_id: req.query.city_id,
  brand_id: req.query.brand_id,
  exclude_seller_id: req.query.seller_id,
  min_price: req.query.min_price,
  max_price: req.query.max_price,
  page: req.query.page,
  limit: req.query.limit,
  sort_by: req.query.sort_by,
  sort_order: req.query.sort_order,
  approval_status: req.query.approval_status,
  public_only: publicOnly || undefined,
  is_active:
    req.query.is_active !== undefined
      ? req.query.is_active === 'true'
      : defaultActiveOnly
        ? true
        : undefined,
});

/**
 * GET /products
 * Public product list — approved + active only.
 */
const getProducts = async (req, res, next) => {
  try {
    const filters = withWishlistFilter(req, buildProductListFilters(req, { publicOnly: true }));
    const data = await productModel.findProducts(filters);
    const withWishlist = await wishlistService.attachWishlistToProductList(data, req.user?.id);
    return success(res, 'Products list retrieved successfully', withWishlist);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products/my
 * Seller's own products (all approval statuses).
 */
const getMyProducts = async (req, res, next) => {
  try {
    const filters = withWishlistFilter(req, {
      ...buildProductListFilters(req, { defaultActiveOnly: false, publicOnly: false }),
      seller_id: req.user.id,
      exclude_seller_id: undefined,
      public_only: false,
    });
    const data = await productModel.findProducts(filters);
    const withWishlist = await wishlistService.attachWishlistToProductList(data, req.user?.id);
    return success(res, 'Products list retrieved successfully', withWishlist);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products/trending
 */
const getTrendingProducts = async (req, res, next) => {
  try {
    const filters = withWishlistFilter(
      req,
      pickProductListFilters(req, {
        is_trending: true,
        is_active: true,
        public_only: true,
        category_id: req.query.category_id,
        subcategory_id: req.query.subcategory_id,
      }),
    );
    const data = await productModel.findProducts(filters);

    const formatted = data.results.map((p) => ({
      id: p.id,
      name: p.name,
      thumbnail: p.thumbnail,
      price: p.price,
      currency: p.currency,
      moq: p.moq,
      unit: p.unit,
      category_id: p.category_id ?? null,
      subcategory_id: p.subcategory_id ?? null,
      seller_id: p.seller_id,
      user_id: p.seller_id,
      seller_name: p.seller_name,
      verified: p.verified,
      rating: p.rating,
      address: p.address ?? null,
      ...withExtendedProductFields(p),
    }));

    const results = await wishlistService.attachWishlistFlags(formatted, req.user?.id);

    return success(res, 'Trending products retrieved successfully', {
      ...data,
      results,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products/related
 */
const getRelatedProducts = async (req, res, next) => {
  try {
    const filters = withWishlistFilter(
      req,
      pickProductListFilters(req, {
        subcategory_id: req.query.subcategory_id,
        is_active: true,
        public_only: true,
      }),
    );

    if (req.query.product_id) {
      filters.exclude_product_id = req.query.product_id;
    }

    const data = await productModel.findProducts(filters);

    const formatted = data.results.map((p) => ({
      id: p.id,
      name: p.name,
      thumbnail: p.thumbnail,
      price: p.price,
      moq: p.moq,
      unit: p.unit,
      category_id: p.category_id ?? null,
      subcategory_id: p.subcategory_id ?? null,
      seller_id: p.seller_id,
      user_id: p.seller_id,
      seller_name: p.seller_name,
      verified: p.verified,
      address: p.address ?? null,
      ...withExtendedProductFields(p),
    }));

    const results = await wishlistService.attachWishlistFlags(formatted, req.user?.id);

    return success(res, 'Related products retrieved successfully', {
      ...data,
      results,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /products/:id
 */
const updateProduct = async (req, res, next) => {
  try {
    const existing = await assertCanModifyProduct(req.params.id, req.user);

    if (
      !isAdminUser(req.user) &&
      req.body.seller_id !== undefined &&
      String(req.body.seller_id) !== String(existing.seller_id)
    ) {
      return next(new AppError('Forbidden: Cannot change product seller', HTTP_STATUS.FORBIDDEN));
    }

    const product = await productService.updateProduct(
      req.params.id,
      req.body,
      req.files,
      req.user?.id,
      req.user?.role,
    );
    return success(res, 'Product updated successfully', product);
  } catch (err) {
    next(err);
  }
};

const parseIdArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
};

/**
 * DELETE /products/:id/media
 */
const deleteProductMedia = async (req, res, next) => {
  try {
    const existing = await assertCanModifyProduct(req.params.id, req.user);
    if (existing.approval_status === PRODUCT_APPROVAL_STATUS.REJECTED) {
      return next(new AppError('Rejected products cannot be updated', HTTP_STATUS.CONFLICT));
    }

    const result = await productService.deleteProductMedia(req.params.id, {
      imageIds: parseIdArray(req.body.image_ids),
      videoIds: parseIdArray(req.body.video_ids),
    });

    if (!result) {
      return next(new AppError('No matching product media found to delete', HTTP_STATUS.NOT_FOUND));
    }

    if (existing.approval_status === PRODUCT_APPROVAL_STATUS.APPROVED) {
      await productReviewService.handleSellerUpdateApproval(
        existing,
        { __has_media_change: true },
        req.user.id,
        req.user.role,
      );
      result.product = await productModel.findProductDetailById(req.params.id);
    }

    return success(res, 'Product media deleted successfully', result);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /products/:id
 * Soft-delete a product (seller owner or admin).
 */
const deleteProduct = async (req, res, next) => {
  try {
    await assertCanModifyProduct(req.params.id, req.user);
    await productModel.deleteProduct(req.params.id, req.user?.id);
    return success(res, 'Product deleted successfully');
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Approval workflow — seller
// ==========================================

/**
 * POST /products/:id/submit
 * Seller resubmits after `revision_required` → `in_review`.
 */
const submitProductForReview = async (req, res, next) => {
  try {
    const product = await productReviewService.submitForReview(
      req.params.id,
      req.user.id,
      req.user.role,
    );
    return success(res, 'Product resubmitted for review', product);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /products/:id/reviews
 * Append-only review history (product owner or admin).
 */
const getProductReviews = async (req, res, next) => {
  try {
    const data = await productReviewService.getReviewHistory(req.params.id, req.user, {
      page: req.query.page,
      limit: req.query.limit,
    });
    return success(res, 'Product review history retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// Approval workflow — admin
// ==========================================

/**
 * GET /products/admin/reviews
 * Admin moderation queue (filter by approval_status, search, sort_by / sort_order).
 */
const getAdminProductReviews = async (req, res, next) => {
  try {
    const filters = {
      search: req.query.search,
      approval_status: req.query.approval_status || PRODUCT_APPROVAL_STATUS.IN_REVIEW,
      category_id: req.query.category_id,
      brand_id: req.query.brand_id,
      seller_id: req.query.seller_id,
      page: req.query.page,
      limit: req.query.limit,
      sort_by: req.query.sort_by || 'submitted_at',
      sort_order: req.query.sort_order || 'desc',
      admin_search: true,
      is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : undefined,
      public_only: false,
    };

    // `all` = no status filter (full catalog for admins)
    if (filters.approval_status === 'all') {
      delete filters.approval_status;
    }

    const data = await productModel.findProducts(filters);
    return success(res, 'Admin product review queue retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

/** POST /products/admin/approve — body.product_ids[] (1 or many); remarks optional. */
const approveProducts = async (req, res, next) => {
  try {
    const data = await productReviewService.approveProducts(
      req.body.product_ids,
      req.user.id,
      req.user.role,
      req.body.remarks,
    );
    return success(res, 'Product approval completed', data);
  } catch (err) {
    next(err);
  }
};

/** POST /products/admin/request-revision — body.product_ids[] + required remarks. */
const requestProductRevision = async (req, res, next) => {
  try {
    const data = await productReviewService.requestRevision(
      req.body.product_ids,
      req.user.id,
      req.user.role,
      req.body.remarks,
    );
    return success(res, 'Product revision requested', data);
  } catch (err) {
    next(err);
  }
};

/** POST /products/admin/reject — body.product_ids[] + required remarks. */
const rejectProducts = async (req, res, next) => {
  try {
    const data = await productReviewService.rejectProducts(
      req.body.product_ids,
      req.user.id,
      req.user.role,
      req.body.remarks,
    );
    return success(res, 'Product rejection completed', data);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createProduct,
  getProduct,
  getProducts,
  getMyProducts,
  getTrendingProducts,
  getRelatedProducts,
  updateProduct,
  deleteProductMedia,
  deleteProduct,
  submitProductForReview,
  getProductReviews,
  getAdminProductReviews,
  approveProducts,
  requestProductRevision,
  rejectProducts,
};
