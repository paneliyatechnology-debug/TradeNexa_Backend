/**
 * Quotation data access — CRUD, compare, and status updates.
 */
const db = require('../database/knex');
const { paginate } = require('../utils/pagination');
const { applyListSort } = require('../utils/listQuery');
const { resolveMediaUrl } = require('../utils/media');
const { QUOTATION_STATUS } = require('../constants/rfq');

const QUOTATION_SORT_FIELDS = {
  id: 'quotations.id',
  price: 'quotations.price',
  total_amount: 'quotations.total_amount',
  delivery_days: 'quotations.delivery_days',
  created_at: 'quotations.created_at',
};

const formatRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    price: row.price !== undefined ? parseFloat(row.price) : undefined,
    gst_percentage: row.gst_percentage !== undefined ? parseFloat(row.gst_percentage) : undefined,
    gst_amount: row.gst_amount !== undefined ? parseFloat(row.gst_amount) : undefined,
    transportation_charge:
      row.transportation_charge !== undefined ? parseFloat(row.transportation_charge) : undefined,
    total_amount: row.total_amount !== undefined ? parseFloat(row.total_amount) : undefined,
    attachment: row.attachment ? resolveMediaUrl(row.attachment) : null,
    supplier_rating: row.supplier_rating !== undefined ? parseFloat(row.supplier_rating || 0) : undefined,
  };
};

const baseQuotationQuery = () =>
  db('quotations')
    .leftJoin('users', 'quotations.supplier_id', '=', 'users.id')
    .leftJoin('company_details', 'users.id', '=', 'company_details.user_id');

const findById = async (id, options = {}) => {
  const row = await baseQuotationQuery()
    .where('quotations.id', id)
    .select(
      'quotations.*',
      'users.full_name as supplier_name',
      'company_details.company_name',
      'company_details.rating as supplier_rating',
    )
    .first();

  if (!row || options.raw) return row;
  return formatRow(row);
};

const findByRfqAndSupplier = (rfqId, supplierId) =>
  db('quotations').where({ rfq_id: rfqId, supplier_id: supplierId }).first();

const findByRfqId = async (rfqId, filters = {}) => {
  const q = baseQuotationQuery()
    .where('quotations.rfq_id', rfqId)
    .select(
      'quotations.*',
      'users.full_name as supplier_name',
      'company_details.company_name',
      'company_details.rating as supplier_rating',
    );

  if (filters.status) {
    q.where('quotations.status', filters.status);
  }

  applyListSort(q, filters, QUOTATION_SORT_FIELDS);
  return q.then((rows) => rows.map(formatRow));
};

const findSupplierQuotations = async (supplierId, filters = {}) => {
  const q = baseQuotationQuery()
    .leftJoin('rfqs', 'quotations.rfq_id', '=', 'rfqs.id')
    .where('quotations.supplier_id', supplierId)
    .whereNull('rfqs.deleted_at')
    .select(
      'quotations.*',
      'rfqs.title as rfq_title',
      'rfqs.rfq_number',
      'rfqs.status as rfq_status',
      'company_details.company_name',
      'company_details.rating as supplier_rating',
    );

  if (filters.status) q.where('quotations.status', filters.status);
  if (filters.search) {
    q.where(function () {
      this.where('rfqs.title', 'like', `%${filters.search}%`).orWhere(
        'rfqs.rfq_number',
        'like',
        `%${filters.search}%`,
      );
    });
  }

  applyListSort(q, filters, QUOTATION_SORT_FIELDS);

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

const findAllQuotations = async (filters = {}) => {
  const q = baseQuotationQuery()
    .leftJoin('rfqs', 'quotations.rfq_id', '=', 'rfqs.id')
    .whereNull('rfqs.deleted_at')
    .select(
      'quotations.*',
      'rfqs.title as rfq_title',
      'rfqs.rfq_number',
      'users.full_name as supplier_name',
      'company_details.company_name',
    );

  if (filters.status) q.where('quotations.status', filters.status);
  if (filters.rfq_id) q.where('quotations.rfq_id', filters.rfq_id);
  if (filters.supplier_id) q.where('quotations.supplier_id', filters.supplier_id);

  applyListSort(q, filters, QUOTATION_SORT_FIELDS);

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 10;
  const paginated = await paginate(q, page, limit);
  paginated.results = paginated.results.map(formatRow);
  return paginated;
};

const compareByRfqId = async (rfqId) => {
  const rows = await baseQuotationQuery()
    .where('quotations.rfq_id', rfqId)
    .whereNotIn('quotations.status', [QUOTATION_STATUS.WITHDRAWN, QUOTATION_STATUS.EXPIRED])
    .select(
      'quotations.id',
      'quotations.quotation_number',
      'quotations.supplier_id',
      'quotations.price',
      'quotations.gst_percentage',
      'quotations.gst_amount',
      'quotations.transportation_charge',
      'quotations.total_amount',
      'quotations.delivery_days',
      'quotations.status',
      'quotations.created_at',
      'users.full_name as supplier_name',
      'company_details.company_name',
      'company_details.rating as supplier_rating',
      'rfq_suppliers.responded_at',
    )
    .leftJoin('rfq_suppliers', function () {
      this.on('rfq_suppliers.rfq_id', '=', 'quotations.rfq_id').andOn(
        'rfq_suppliers.supplier_id',
        '=',
        'quotations.supplier_id',
      );
    })
    .orderBy('quotations.total_amount', 'asc');

  return rows.map((row) => ({
    quotation_id: row.id,
    quotation_number: row.quotation_number,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name || row.company_name,
    price: parseFloat(row.price),
    gst_percentage: parseFloat(row.gst_percentage || 0),
    gst_amount: parseFloat(row.gst_amount || 0),
    transportation_charge: parseFloat(row.transportation_charge || 0),
    total_amount: parseFloat(row.total_amount),
    delivery_days: row.delivery_days,
    supplier_rating: parseFloat(row.supplier_rating || 0),
    response_time: row.responded_at,
    status: row.status,
  }));
};

const createQuotation = async (data, trx = null) => {
  const client = trx || db;
  const [id] = await client('quotations').insert(data);
  return client('quotations').where({ id }).first();
};

const updateQuotation = async (id, data, trx = null) => {
  const client = trx || db;
  await client('quotations').where({ id }).update({ ...data, updated_at: client.fn.now() });
  return client('quotations').where({ id }).first();
};

const rejectOthersExcept = async (rfqId, acceptedId, trx = null) => {
  const client = trx || db;
  await client('quotations')
    .where({ rfq_id: rfqId })
    .whereNot({ id: acceptedId })
    .whereNotIn('status', [QUOTATION_STATUS.WITHDRAWN, QUOTATION_STATUS.REJECTED])
    .update({ status: QUOTATION_STATUS.REJECTED, updated_at: client.fn.now() });
};

module.exports = {
  formatRow,
  findById,
  findByRfqAndSupplier,
  findByRfqId,
  findSupplierQuotations,
  findAllQuotations,
  compareByRfqId,
  createQuotation,
  updateQuotation,
  rejectOthersExcept,
};
