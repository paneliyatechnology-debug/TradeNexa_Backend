/**
 * Human-readable title/body builders for FCM + in-app notifications.
 * Keep copy short (mobile notification limits) but specific enough to tell items apart.
 */

const truncate = (value, max = 80) => {
  const text = String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** Prefer company name, then person name. */
const partyLabel = ({ companyName, fullName, fallback = 'Someone' } = {}) =>
  truncate(companyName || fullName || fallback, 40) || fallback;

const productLabel = (name) => truncate(name, 50) || 'a product';

/** e.g. "RFQ-2026-001 — Steel pipes" */
const rfqLabel = (rfq = {}) => {
  const num = truncate(rfq.rfq_number, 30);
  const title = truncate(rfq.title, 45);
  if (num && title) return `${num} — ${title}`;
  return title || num || 'an RFQ';
};

const inquiryRef = (inquiry = {}) => truncate(inquiry.inquiry_number, 30) || null;

const formatMoney = (amount, currency = 'INR') => {
  if (amount === undefined || amount === null || amount === '') return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const cur = currency || 'INR';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${cur} ${n}`;
  }
};

const qtyPhrase = (quantity, unit) => {
  if (quantity == null || quantity === '') return '';
  const u = unit ? ` ${String(unit).trim()}` : '';
  return ` (${quantity}${u})`;
};

const moneyPhrase = (amount, currency) => {
  const m = formatMoney(amount, currency);
  return m ? ` for ${m}` : '';
};

// ==========================================
// Inquiry / inquiry-quotation copy
// ==========================================

const inquiryReceived = ({ productName, buyerCompany, buyerName, quantity, unit, inquiryNumber }) => {
  const product = productLabel(productName);
  const buyer = partyLabel({ companyName: buyerCompany, fullName: buyerName, fallback: 'A buyer' });
  const ref = inquiryNumber ? ` (${inquiryNumber})` : '';
  return {
    title: `New inquiry on ${product}`,
    body: `${buyer} sent an inquiry on "${product}"${qtyPhrase(quantity, unit)}${ref}.`,
  };
};

const inquiryRejected = ({ productName, sellerCompany, sellerName, reason, inquiryNumber }) => {
  const product = productLabel(productName);
  const seller = partyLabel({
    companyName: sellerCompany,
    fullName: sellerName,
    fallback: 'The seller',
  });
  const ref = inquiryNumber ? ` (${inquiryNumber})` : '';
  const reasonText = reason ? truncate(reason, 100) : null;
  return {
    title: `Inquiry rejected — ${product}`,
    body: reasonText
      ? `${seller} rejected your inquiry on "${product}"${ref}: ${reasonText}`
      : `${seller} rejected your inquiry on "${product}"${ref}.`,
  };
};

const quotationReceived = ({
  productName,
  sellerCompany,
  sellerName,
  totalAmount,
  currency,
  quantity,
  unit,
  inquiryNumber,
}) => {
  const product = productLabel(productName);
  const seller = partyLabel({
    companyName: sellerCompany,
    fullName: sellerName,
    fallback: 'A seller',
  });
  const ref = inquiryNumber ? ` (${inquiryNumber})` : '';
  return {
    title: `Quote on ${product}`,
    body: `${seller} sent a quotation on "${product}"${qtyPhrase(quantity, unit)}${moneyPhrase(
      totalAmount,
      currency,
    )}${ref}.`,
  };
};

const quotationUpdated = ({
  productName,
  sellerCompany,
  sellerName,
  totalAmount,
  currency,
  inquiryNumber,
}) => {
  const product = productLabel(productName);
  const seller = partyLabel({
    companyName: sellerCompany,
    fullName: sellerName,
    fallback: 'A seller',
  });
  const ref = inquiryNumber ? ` (${inquiryNumber})` : '';
  return {
    title: `Quote updated — ${product}`,
    body: `${seller} updated their quotation on "${product}"${moneyPhrase(
      totalAmount,
      currency,
    )}${ref}.`,
  };
};

const quotationAccepted = ({ productName, buyerCompany, buyerName, totalAmount, currency }) => {
  const product = productLabel(productName);
  const buyer = partyLabel({ companyName: buyerCompany, fullName: buyerName, fallback: 'The buyer' });
  return {
    title: `Quote accepted — ${product}`,
    body: `${buyer} accepted your quotation on "${product}"${moneyPhrase(totalAmount, currency)}.`,
  };
};

const quotationRejected = ({ productName, buyerCompany, buyerName }) => {
  const product = productLabel(productName);
  const buyer = partyLabel({ companyName: buyerCompany, fullName: buyerName, fallback: 'The buyer' });
  return {
    title: `Quote rejected — ${product}`,
    body: `${buyer} rejected your quotation on "${product}".`,
  };
};

// ==========================================
// RFQ copy
// ==========================================

const rfqCancelled = (rfq) => {
  const label = rfqLabel(rfq);
  return {
    title: `RFQ cancelled — ${truncate(rfq.title || rfq.rfq_number || 'RFQ', 50)}`,
    body: `RFQ "${label}" has been cancelled by the buyer.`,
  };
};

const rfqClosed = (rfq) => {
  const label = rfqLabel(rfq);
  return {
    title: `RFQ closed — ${truncate(rfq.title || rfq.rfq_number || 'RFQ', 50)}`,
    body: `RFQ "${label}" has been closed.`,
  };
};

const rfqStatusUpdated = (rfq, status) => {
  const label = rfqLabel(rfq);
  return {
    title: `RFQ status — ${truncate(rfq.title || rfq.rfq_number || 'RFQ', 50)}`,
    body: `Your RFQ "${label}" status is now ${status}.`,
  };
};

const rfqNewQuotation = ({
  rfq,
  sellerCompany,
  sellerName,
  totalAmount,
  currency,
  quotationNumber,
}) => {
  const label = rfqLabel(rfq);
  const seller = partyLabel({
    companyName: sellerCompany,
    fullName: sellerName,
    fallback: 'A seller',
  });
  const qRef = quotationNumber ? ` (${quotationNumber})` : '';
  return {
    title: `New quote on ${truncate(rfq.title || rfq.rfq_number || 'RFQ', 45)}`,
    body: `${seller} submitted a quotation on "${label}"${moneyPhrase(totalAmount, currency)}${qRef}.`,
  };
};

const rfqQuotationUpdated = ({
  rfq,
  sellerCompany,
  sellerName,
  totalAmount,
  currency,
  quotationNumber,
}) => {
  const label = rfqLabel(rfq);
  const seller = partyLabel({
    companyName: sellerCompany,
    fullName: sellerName,
    fallback: 'A seller',
  });
  const qRef = quotationNumber ? ` (${quotationNumber})` : '';
  return {
    title: `Quote updated — ${truncate(rfq.title || rfq.rfq_number || 'RFQ', 45)}`,
    body: `${seller} updated their quotation on "${label}"${moneyPhrase(totalAmount, currency)}${qRef}.`,
  };
};

const rfqQuotationAccepted = ({ rfq, buyerCompany, buyerName, totalAmount, currency }) => {
  const label = rfqLabel(rfq);
  const buyer = partyLabel({
    companyName: buyerCompany || rfq.company_name,
    fullName: buyerName || rfq.buyer_name,
    fallback: 'The buyer',
  });
  return {
    title: `Quote accepted — ${truncate(rfq.title || rfq.rfq_number || 'RFQ', 45)}`,
    body: `${buyer} accepted your quotation on "${label}"${moneyPhrase(totalAmount, currency)}.`,
  };
};

const rfqQuotationRejected = ({ rfq, buyerCompany, buyerName }) => {
  const label = rfqLabel(rfq);
  const buyer = partyLabel({
    companyName: buyerCompany || rfq.company_name,
    fullName: buyerName || rfq.buyer_name,
    fallback: 'The buyer',
  });
  return {
    title: `Quote rejected — ${truncate(rfq.title || rfq.rfq_number || 'RFQ', 45)}`,
    body: `${buyer} rejected your quotation on "${label}".`,
  };
};

const rfqRevisionRequested = ({ rfq, remarks }) => {
  const label = rfqLabel(rfq);
  const remarkText = remarks ? truncate(remarks, 100) : null;
  return {
    title: `Revision requested — ${truncate(rfq.title || rfq.rfq_number || 'RFQ', 45)}`,
    body: remarkText
      ? `Buyer requested a revision on "${label}": ${remarkText}`
      : `Buyer requested a revision on your quotation for "${label}".`,
  };
};

module.exports = {
  truncate,
  partyLabel,
  productLabel,
  rfqLabel,
  inquiryRef,
  formatMoney,
  inquiryReceived,
  inquiryRejected,
  quotationReceived,
  quotationUpdated,
  quotationAccepted,
  quotationRejected,
  rfqCancelled,
  rfqClosed,
  rfqStatusUpdated,
  rfqNewQuotation,
  rfqQuotationUpdated,
  rfqQuotationAccepted,
  rfqQuotationRejected,
  rfqRevisionRequested,
};
