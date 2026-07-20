/**
 * Seller / admin dashboard summary service.
 *
 * Seller dashboard returns four KPIs only:
 * total products, today's leads, profile views, replies sent.
 */
const dashboardModel = require('../models/dashboardModel');

const getSellerDashboard = async (userId) => {
  const metrics = await dashboardModel.getSellerDashboardMetrics(userId);
  const today = new Date();
  const as_of = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return {
    role: 'seller',
    as_of,
    total_products: metrics.total_products,
    todays_leads: metrics.todays_leads.total,
    todays_leads_breakdown: {
      inquiries: metrics.todays_leads.inquiries,
      rfq_invites: metrics.todays_leads.rfq_invites,
    },
    profile_views: metrics.profile_views,
    replies_sent: metrics.replies_sent,
  };
};

/**
 * Platform-wide admin dashboard (all users, RFQs, inquiries, products, chat).
 */
const getAdminDashboard = async () => {
  const [users, rfqs, inquiries, quotations, products, chat, chartSeries] = await Promise.all([
    dashboardModel.countUsersPlatform(),
    dashboardModel.countRfqsPlatform(),
    dashboardModel.countInquiriesPlatform(),
    dashboardModel.countQuotationsPlatform(),
    dashboardModel.countProductsPlatform(),
    dashboardModel.countChatPlatform(),
    dashboardModel.getAdminChartSeries(),
  ]);

  return {
    role: 'admin',
    summary: {
      users_total: users.total,
      users_buyers: users.buyers,
      users_sellers: users.sellers,
      users_active: users.active,
      products_total: products.total,
      products_in_review: products.in_review,
      products_moderation_queue: products.moderation_queue,
      products_approved: products.approved,
      rfqs_total: rfqs.total,
      rfqs_open: rfqs.open,
      rfqs_awarded: rfqs.awarded,
      inquiries_total: inquiries.total,
      inquiries_pending: inquiries.pending,
      quotations_total: quotations.total,
      quotations_pending: quotations.pending_review,
      chat_conversations: chat.conversations,
      chat_unread_total: chat.unread_total,
    },
    users,
    products,
    rfqs,
    inquiries,
    quotations,
    chat,
    charts: {
      ...chartSeries,
      users_by_role: dashboardModel.toPieSeries(users.by_role),
      products_by_approval: dashboardModel.toPieSeries(products.by_approval_status),
      rfqs_by_status: dashboardModel.toPieSeries(rfqs.by_status),
      inquiries_by_status: dashboardModel.toPieSeries(inquiries.by_status),
      quotations_by_status: dashboardModel.toPieSeries(quotations.by_status),
      rfqs_lifecycle: [
        { label: 'draft', value: rfqs.draft },
        { label: 'open', value: rfqs.open },
        { label: 'awarded', value: rfqs.awarded },
        { label: 'completed', value: rfqs.completed },
        { label: 'cancelled', value: rfqs.cancelled },
        { label: 'expired', value: rfqs.expired },
        { label: 'closed', value: rfqs.closed },
      ].filter((item) => item.value > 0),
      moderation_pipeline: [
        { label: 'in_review', value: products.in_review },
        { label: 'revision_required', value: products.revision_required },
        { label: 'approved', value: products.approved },
        { label: 'rejected', value: products.rejected },
      ].filter((item) => item.value > 0),
    },
  };
};

module.exports = {
  getSellerDashboard,
  getAdminDashboard,
};
