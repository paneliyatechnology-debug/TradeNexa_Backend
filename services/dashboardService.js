/**
 * Buyer / seller dashboard summary service.
 *
 * Aggregates RFQs, inquiries, quotations, products, wishlist, and chat unread.
 * There is no orders module — "deals" map to awarded RFQs / accepted inquiries.
 */
const dashboardModel = require('../models/dashboardModel');
const chatConversationModel = require('../models/chatConversationModel');

const getBuyerDashboard = async (userId) => {
  const [profile, rfqs, pending_quotations, inquiries, wishlist_total, chat] = await Promise.all([
    dashboardModel.getUserDashboardProfile(userId),
    dashboardModel.countRfqsByBuyer(userId),
    dashboardModel.countPendingRfqQuotationsForBuyer(userId),
    dashboardModel.countInquiriesByRole(userId, 'buyer_id'),
    dashboardModel.countWishlistByUser(userId),
    chatConversationModel.getTotalUnreadCount(userId),
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
    chat: {
      unread: chat.as_buyer,
      total_unread: chat.total,
      as_buyer: chat.as_buyer,
      as_seller: chat.as_seller,
    },
  };
};

const getSellerDashboard = async (userId) => {
  const [profile, products, inquiries, rfq_quotations, rfq_opportunities, chat] = await Promise.all([
    dashboardModel.getUserDashboardProfile(userId),
    dashboardModel.countProductsBySeller(userId),
    dashboardModel.countInquiriesByRole(userId, 'seller_id'),
    dashboardModel.countSellerRfqQuotations(userId),
    dashboardModel.countSellerRfqOpportunities(userId),
    chatConversationModel.getTotalUnreadCount(userId),
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
    chat: {
      unread: chat.as_seller,
      total_unread: chat.total,
      as_buyer: chat.as_buyer,
      as_seller: chat.as_seller,
    },
  };
};

module.exports = {
  getBuyerDashboard,
  getSellerDashboard,
};
