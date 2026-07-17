/**
 * Buyer / seller dashboard summary service.
 *
 * Aggregates RFQs, inquiries, quotations, products, wishlist, and chart series.
 * There is no orders module — "deals" map to awarded RFQs / accepted inquiries.
 */
const dashboardModel = require('../models/dashboardModel');
const chatConversationModel = require('../models/chatConversationModel');

const getBuyerDashboard = async (userId) => {
  const [profile, rfqs, pending_quotations, inquiries, wishlist_total, chat, chartSeries] =
    await Promise.all([
      dashboardModel.getUserDashboardProfile(userId),
      dashboardModel.countRfqsByBuyer(userId),
      dashboardModel.countPendingRfqQuotationsForBuyer(userId),
      dashboardModel.countInquiriesByRole(userId, 'buyer_id'),
      dashboardModel.countWishlistByUser(userId),
      chatConversationModel.getTotalUnreadCount(userId),
      dashboardModel.getBuyerChartSeries(userId),
    ]);

  return {
    role: 'buyer',
    profile,
    summary: {
      rfqs_total: rfqs.total,
      rfqs_open: rfqs.open,
      rfqs_draft: rfqs.draft,
      rfqs_awarded: rfqs.awarded,
      inquiries_total: inquiries.total,
      inquiries_pending: inquiries.pending,
      inquiries_quoted: inquiries.quoted,
      inquiries_accepted: inquiries.accepted,
      pending_quotations_to_review: pending_quotations,
      wishlist_total,
      unread_messages: chat.as_buyer,
    },
    rfqs: {
      ...rfqs,
      pending_quotations_to_review: pending_quotations,
    },
    inquiries,
    wishlist: {
      total: wishlist_total,
    },
    charts: {
      ...chartSeries,
      // Pie / donut — use label + value with chart libraries
      rfqs_by_status: dashboardModel.toPieSeries(rfqs.by_status),
      inquiries_by_status: dashboardModel.toPieSeries(inquiries.by_status),
      rfqs_lifecycle: [
        { label: 'draft', value: rfqs.draft },
        { label: 'open', value: rfqs.open },
        { label: 'awarded', value: rfqs.awarded },
        { label: 'completed', value: rfqs.completed },
        { label: 'cancelled', value: rfqs.cancelled },
        { label: 'expired', value: rfqs.expired },
        { label: 'closed', value: rfqs.closed },
      ].filter((item) => item.value > 0),
    },
  };
};

const getSellerDashboard = async (userId) => {
  const [profile, products, inquiries, rfq_quotations, rfq_opportunities, chat, chartSeries] =
    await Promise.all([
      dashboardModel.getUserDashboardProfile(userId),
      dashboardModel.countProductsBySeller(userId),
      dashboardModel.countInquiriesByRole(userId, 'seller_id'),
      dashboardModel.countSellerRfqQuotations(userId),
      dashboardModel.countSellerRfqOpportunities(userId),
      chatConversationModel.getTotalUnreadCount(userId),
      dashboardModel.getSellerChartSeries(userId),
    ]);

  return {
    role: 'seller',
    profile,
    summary: {
      products_total: products.total,
      products_active: products.active_approved,
      products_in_review: products.in_review,
      products_revision_required: products.revision_required,
      inquiries_pending: inquiries.pending,
      inquiries_quoted: inquiries.quoted,
      inquiries_accepted: inquiries.accepted,
      rfq_quotations_pending: rfq_quotations.pending_review,
      rfq_quotations_accepted: rfq_quotations.accepted,
      rfq_opportunities,
      unread_messages: chat.as_seller,
      rating: profile?.rating ?? null,
      response_rate: profile?.response_rate ?? null,
    },
    products,
    inquiries,
    rfq_quotations: {
      ...rfq_quotations,
      opportunities: rfq_opportunities,
    },
    charts: {
      ...chartSeries,
      products_by_approval: dashboardModel.toPieSeries(products.by_approval_status),
      inquiries_by_status: dashboardModel.toPieSeries(inquiries.by_status),
      quotations_by_status: dashboardModel.toPieSeries(rfq_quotations.by_status),
      pipeline: [
        { label: 'rfq_opportunities', value: rfq_opportunities },
        { label: 'inquiries_pending', value: inquiries.pending },
        { label: 'quotations_pending', value: rfq_quotations.pending_review },
        { label: 'quotations_accepted', value: rfq_quotations.accepted },
        { label: 'inquiries_accepted', value: inquiries.accepted },
      ].filter((item) => item.value > 0),
    },
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
  getBuyerDashboard,
  getSellerDashboard,
  getAdminDashboard,
};
