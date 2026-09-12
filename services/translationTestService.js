/**
 * Reusable Testing Translation Service.
 *
 * Dedicated to testing automatic product translation (e.g. English -> Hindi & Gujarati)
 * without affecting production databases or existing product APIs.
 *
 * Configurable via environment variables or per-request options:
 * - TRANSLATION_PROVIDER: 'free_google' | 'google' | 'gemini' | 'openai' | 'libre'
 * - TRANSLATION_API_KEY: Provider API key
 * - TRANSLATION_BASE_URL: Custom endpoint URL (e.g. for self-hosted LibreTranslate or LLM proxy)
 * - TRANSLATION_TIMEOUT_MS: Request timeout in milliseconds (default: 10000)
 */

const config = require('../config');

// In-memory cache to prevent repeated external network requests
const translationCache = new Map();

// Supported language codes
const SUPPORTED_LANGUAGES = {
  en: 'English',
  hi: 'Hindi',
  gu: 'Gujarati',
  mr: 'Marathi',
  ta: 'Tamil',
  te: 'Telugu',
  bn: 'Bengali',
  kn: 'Kannada',
  ml: 'Malayalam',
  pa: 'Punjabi',
  ur: 'Urdu',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ru: 'Russian',
};

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Helper to fetch with timeout using AbortController
 */
const fetchWithTimeout = async (url, options = {}, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Translation request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Fallback free translator (MyMemory API) if Google is rate limited
 */
const translateWithMyMemory = async (text, targetLang, sourceLang = 'auto', timeoutMs = 10000) => {
  const sLang = sourceLang === 'auto' ? 'autodetect' : sourceLang;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(
    sLang
  )}|${encodeURIComponent(targetLang)}`;
  const response = await fetchWithTimeout(url, { method: 'GET' }, timeoutMs);
  if (!response.ok) {
    throw new Error(`MyMemory API responded with status ${response.status}`);
  }
  const data = await response.json();
  const translated = data?.responseData?.translatedText;
  if (translated) {
    return translated;
  }
  throw new Error('No translation in MyMemory response');
};

/**
 * 1. Google Web / Free Translation Provider (Zero-config for instant local testing)
 */
const translateWithFreeGoogle = async (text, targetLang, sourceLang = 'auto', timeoutMs = 10000) => {
  if (!text || typeof text !== 'string') return '';
  const sl = sourceLang || 'auto';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
    sl
  )}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: '*/*',
        },
      },
      timeoutMs
    );

    if (response.ok) {
      const raw = await response.json();
      if (Array.isArray(raw) && Array.isArray(raw[0])) {
        return raw[0].map((item) => (Array.isArray(item) ? item[0] : '')).join('');
      }
    }
  } catch (googleErr) {
    // If google fails or throttles, fallback to MyMemory free endpoint
  }

  // Fallback to MyMemory
  return await translateWithMyMemory(text, targetLang, sourceLang, timeoutMs);
};

/**
 * 2. Official Google Cloud Translation API v2
 */
const translateWithGoogleCloud = async (text, targetLang, sourceLang = 'en', apiKey, timeoutMs = 10000) => {
  if (!apiKey) {
    throw new Error('TRANSLATION_API_KEY is required for provider "google" (Google Cloud Translation API)');
  }
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        target: targetLang,
        source: sourceLang,
        format: 'text',
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Google Cloud Translation API error: ${message}`);
  }

  const data = await response.json();
  const translated = data?.data?.translations?.[0]?.translatedText;
  if (translated === undefined) {
    throw new Error('No translated text returned from Google Cloud Translation API');
  }
  return translated;
};

/**
 * 3. LibreTranslate Provider (Open Source self-hosted or cloud)
 */
const translateWithLibre = async (text, targetLang, sourceLang = 'en', apiKey, baseUrl, timeoutMs = 10000) => {
  const endpoint = (baseUrl || 'https://libretranslate.com').replace(/\/+$/, '') + '/translate';
  const payload = {
    q: text,
    source: sourceLang,
    target: targetLang,
    format: 'text',
  };
  if (apiKey) {
    payload.api_key = apiKey;
  }

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    timeoutMs
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`LibreTranslate error (${response.status}): ${errData?.error || response.statusText}`);
  }

  const data = await response.json();
  if (data?.translatedText !== undefined) {
    return data.translatedText;
  }
  throw new Error('Invalid response structure from LibreTranslate');
};

/**
 * 4. Google Gemini Generative AI Provider
 */
const translateWithGemini = async (text, targetLang, sourceLang = 'en', apiKey, timeoutMs = 15000) => {
  if (!apiKey) {
    throw new Error('TRANSLATION_API_KEY is required for provider "gemini"');
  }
  const targetName = SUPPORTED_LANGUAGES[targetLang] || targetLang;
  const sourceName = SUPPORTED_LANGUAGES[sourceLang] || sourceLang;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt = `Translate the following text accurately from ${sourceName} (${sourceLang}) to ${targetName} (${targetLang}). Return ONLY the translated text without any explanation, quotes, or markdown wrappers.\n\nText:\n${text}`;

  const response = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
        },
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error (${response.status}): ${errData?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!resultText) {
    throw new Error('Empty response from Gemini translation');
  }
  return resultText.trim();
};

/**
 * 5. OpenAI / Compatible LLM Provider
 */
const translateWithOpenAI = async (text, targetLang, sourceLang = 'en', apiKey, baseUrl, timeoutMs = 15000) => {
  if (!apiKey) {
    throw new Error('TRANSLATION_API_KEY is required for provider "openai"');
  }
  const endpoint = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions';
  const targetName = SUPPORTED_LANGUAGES[targetLang] || targetLang;
  const sourceName = SUPPORTED_LANGUAGES[sourceLang] || sourceLang;

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `You are a professional B2B marketplace translator. Translate product information from ${sourceName} to ${targetName}. Output only the direct translation with no explanations.`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
      }),
    },
    timeoutMs
  );

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error (${response.status}): ${errData?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const result = data?.choices?.[0]?.message?.content;
  if (!result) {
    throw new Error('Empty translation response from OpenAI');
  }
  return result.trim();
};

/**
 * Core text translation router with caching
 */
const translateSingleText = async (text, targetLang, sourceLang = 'auto', options = {}) => {
  if (!text || !text.trim()) {
    return '';
  }

  if (sourceLang !== 'auto' && targetLang === sourceLang) {
    return text;
  }

  const provider = (
    options.provider ||
    config.translation?.provider ||
    process.env.TRANSLATION_PROVIDER ||
    'free_google'
  ).toLowerCase();

  // Cache key
  const cacheKey = `${provider}:${sourceLang}:${targetLang}:${text.trim()}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey);
  }

  const apiKey = options.apiKey || config.translation?.apiKey || process.env.TRANSLATION_API_KEY;
  const baseUrl = options.baseUrl || config.translation?.baseUrl || process.env.TRANSLATION_BASE_URL;
  const timeoutMs = parseInt(
    options.timeoutMs || config.translation?.timeoutMs || process.env.TRANSLATION_TIMEOUT_MS || 10000,
    10
  );

  let translated = '';
  switch (provider) {
    case 'google':
      translated = await translateWithGoogleCloud(text, targetLang, sourceLang, apiKey, timeoutMs);
      break;
    case 'gemini':
      translated = await translateWithGemini(text, targetLang, sourceLang, apiKey, timeoutMs);
      break;
    case 'openai':
      translated = await translateWithOpenAI(text, targetLang, sourceLang, apiKey, baseUrl, timeoutMs);
      break;
    case 'libre':
      translated = await translateWithLibre(text, targetLang, sourceLang, apiKey, baseUrl, timeoutMs);
      break;
    case 'free_google':
    default:
      translated = await translateWithFreeGoogle(text, targetLang, sourceLang, timeoutMs);
      break;
  }

  if (translated) {
    // Keep cache from growing unbounded
    if (translationCache.size > 2000) {
      const firstKey = translationCache.keys().next().value;
      translationCache.delete(firstKey);
    }
    translationCache.set(cacheKey, translated);
  }

  return translated;
};

/**
 * Translates product name and description into multiple target languages.
 */
const translateProduct = async ({
  name,
  description,
  source_language = 'en',
  target_languages = ['hi', 'gu'],
  options = {},
}) => {
  const activeProvider = (
    options.provider ||
    config.translation?.provider ||
    process.env.TRANSLATION_PROVIDER ||
    'free_google'
  ).toLowerCase();

  const results = {
    source_language: source_language || 'en',
    target_languages: Array.isArray(target_languages) ? target_languages : ['hi', 'gu'],
    original: {
      name: name || '',
      description: description || '',
    },
    translations: {},
    provider: activeProvider,
    status: 'success',
    errors: {},
  };

  for (const targetLang of results.target_languages) {
    if (targetLang === results.source_language) {
      results.translations[targetLang] = {
        name: name || '',
        description: description || '',
      };
      continue;
    }

    try {
      const [translatedName, translatedDesc] = await Promise.all([
        name ? translateSingleText(name, targetLang, results.source_language, options) : Promise.resolve(''),
        description
          ? translateSingleText(description, targetLang, results.source_language, options)
          : Promise.resolve(''),
      ]);

      results.translations[targetLang] = {
        name: translatedName,
        description: translatedDesc,
      };
    } catch (langError) {
      results.status = 'partial_success';
      results.errors[targetLang] = langError.message || 'Translation failed';
      results.translations[targetLang] = {
        name: null,
        description: null,
      };
    }
  }

  const failedCount = Object.keys(results.errors).length;
  if (failedCount > 0 && failedCount === results.target_languages.length) {
    results.status = 'failed';
  }

  return results;
};

/**
 * Safe text translation helper that returns the original text if error occurs.
 */
const translateTextSafe = async (text, targetLang, sourceLang = 'auto', options = {}) => {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return text;
  }
  if (sourceLang !== 'auto' && targetLang === sourceLang) {
    return text;
  }
  try {
    const translated = await translateSingleText(text, targetLang, sourceLang, options);
    return translated || text;
  } catch (err) {
    return text;
  }
};

/**
 * Translates ALL fields of a full product detail object:
 * - basic_details (name, short_desc, desc, material, country, condition, category, subcategory, brand)
 * - pricing (unit)
 * - inventory (stock_status)
 * - seller (company name, business_type, address city, state, country)
 * - warranty
 * - search_tags
 * - specifications (key, value)
 */
const translateFullProductDetail = async (product, targetLang, sourceLang = 'en', options = {}) => {
  if (!product || targetLang === sourceLang) {
    return product;
  }

  const [
    tName,
    tShortDesc,
    tDesc,
    tMaterial,
    tCountryOrigin,
    tCondition,
    tCategoryName,
    tSubcategoryName,
    tBrandName,
    tBrandDesc,
    tBrandCountry,
    tUnit,
    tStockStatus,
    tSellerCompanyName,
    tSellerBusinessType,
    tSellerCity,
    tSellerState,
    tSellerCountry,
    tWarranty,
  ] = await Promise.all([
    translateTextSafe(product.basic_details?.name, targetLang, sourceLang, options),
    translateTextSafe(product.basic_details?.short_description, targetLang, sourceLang, options),
    translateTextSafe(product.basic_details?.description, targetLang, sourceLang, options),
    translateTextSafe(product.basic_details?.material, targetLang, sourceLang, options),
    translateTextSafe(product.basic_details?.country_of_origin, targetLang, sourceLang, options),
    translateTextSafe(product.basic_details?.product_condition, targetLang, sourceLang, options),
    translateTextSafe(product.basic_details?.category?.name, targetLang, sourceLang, options),
    translateTextSafe(product.basic_details?.subcategory?.name, targetLang, sourceLang, options),
    translateTextSafe(product.basic_details?.brand?.name, targetLang, sourceLang, options),
    translateTextSafe(product.basic_details?.brand?.description, targetLang, sourceLang, options),
    translateTextSafe(product.basic_details?.brand?.country, targetLang, sourceLang, options),
    translateTextSafe(product.pricing?.unit, targetLang, sourceLang, options),
    translateTextSafe(product.inventory?.stock_status, targetLang, sourceLang, options),
    translateTextSafe(product.seller?.company?.name, targetLang, sourceLang, options),
    translateTextSafe(product.seller?.company?.business_type, targetLang, sourceLang, options),
    translateTextSafe(product.seller?.address?.city, targetLang, sourceLang, options),
    translateTextSafe(product.seller?.address?.state, targetLang, sourceLang, options),
    translateTextSafe(product.seller?.address?.country, targetLang, sourceLang, options),
    translateTextSafe(product.warranty, targetLang, sourceLang, options),
  ]);

  // Translate search tags
  let translatedSearchTags = product.search_tags || [];
  if (Array.isArray(product.search_tags) && product.search_tags.length > 0) {
    translatedSearchTags = await Promise.all(
      product.search_tags.map((tag) => translateTextSafe(tag, targetLang, sourceLang, options))
    );
  }

  // Translate specifications
  let translatedSpecifications = product.specifications || [];
  if (Array.isArray(product.specifications) && product.specifications.length > 0) {
    translatedSpecifications = await Promise.all(
      product.specifications.map(async (spec) => ({
        ...spec,
        original_key: spec.key,
        original_value: spec.value,
        key: await translateTextSafe(spec.key, targetLang, sourceLang, options),
        value: await translateTextSafe(spec.value, targetLang, sourceLang, options),
      }))
    );
  }

  return {
    ...product,
    translated_language: targetLang,
    language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
    basic_details: {
      ...product.basic_details,
      original_name: product.basic_details?.name,
      original_short_description: product.basic_details?.short_description,
      original_description: product.basic_details?.description,
      original_material: product.basic_details?.material,
      original_country_of_origin: product.basic_details?.country_of_origin,
      original_product_condition: product.basic_details?.product_condition,
      name: tName,
      short_description: tShortDesc,
      description: tDesc,
      material: tMaterial,
      country_of_origin: tCountryOrigin,
      product_condition: tCondition,
      category: product.basic_details?.category
        ? {
            ...product.basic_details.category,
            original_name: product.basic_details.category.name,
            name: tCategoryName,
          }
        : null,
      subcategory: product.basic_details?.subcategory
        ? {
            ...product.basic_details.subcategory,
            original_name: product.basic_details.subcategory.name,
            name: tSubcategoryName,
          }
        : null,
      brand: product.basic_details?.brand
        ? {
            ...product.basic_details.brand,
            original_name: product.basic_details.brand.name,
            original_description: product.basic_details.brand.description,
            original_country: product.basic_details.brand.country,
            name: tBrandName,
            description: tBrandDesc,
            country: tBrandCountry,
          }
        : null,
    },
    pricing: {
      ...product.pricing,
      original_unit: product.pricing?.unit,
      unit: tUnit,
    },
    inventory: {
      ...product.inventory,
      original_stock_status: product.inventory?.stock_status,
      stock_status: tStockStatus,
    },
    seller: product.seller
      ? {
          ...product.seller,
          company: product.seller.company
            ? {
                ...product.seller.company,
                original_name: product.seller.company.name,
                original_business_type: product.seller.company.business_type,
                name: tSellerCompanyName,
                business_type: tSellerBusinessType,
              }
            : null,
          address: product.seller.address
            ? {
                ...product.seller.address,
                original_city: product.seller.address.city,
                original_state: product.seller.address.state,
                original_country: product.seller.address.country,
                city: tSellerCity,
                state: tSellerState,
                country: tSellerCountry,
              }
            : null,
        }
      : null,
    original_warranty: product.warranty,
    warranty: tWarranty,
    original_search_tags: product.search_tags,
    search_tags: translatedSearchTags,
    specifications: translatedSpecifications,
  };
};

/**
 * Translates ALL translatable fields of a product list item.
 */
const translateProductListItem = async (product, targetLang, sourceLang = 'en', options = {}) => {
  if (!product || targetLang === sourceLang) {
    return product;
  }

  const [
    tName,
    tShortDesc,
    tDesc,
    tCategoryName,
    tSubcategoryName,
    tSellerName,
    tMaterial,
    tCountryOrigin,
    tProductCondition,
    tStockStatus,
    tUnit,
    tWarranty,
    tCity,
    tState,
    tCountry,
  ] = await Promise.all([
    translateTextSafe(product.name, targetLang, sourceLang, options),
    translateTextSafe(product.short_description, targetLang, sourceLang, options),
    translateTextSafe(product.description, targetLang, sourceLang, options),
    translateTextSafe(product.category_name, targetLang, sourceLang, options),
    translateTextSafe(product.subcategory_name, targetLang, sourceLang, options),
    translateTextSafe(product.seller_name, targetLang, sourceLang, options),
    translateTextSafe(product.material, targetLang, sourceLang, options),
    translateTextSafe(product.country_of_origin, targetLang, sourceLang, options),
    translateTextSafe(product.product_condition, targetLang, sourceLang, options),
    translateTextSafe(product.stock_status, targetLang, sourceLang, options),
    translateTextSafe(product.unit, targetLang, sourceLang, options),
    translateTextSafe(product.warranty, targetLang, sourceLang, options),
    translateTextSafe(product.address?.city, targetLang, sourceLang, options),
    translateTextSafe(product.address?.state, targetLang, sourceLang, options),
    translateTextSafe(product.address?.country, targetLang, sourceLang, options),
  ]);

  let translatedSearchTags = product.search_tags || [];
  if (Array.isArray(product.search_tags) && product.search_tags.length > 0) {
    translatedSearchTags = await Promise.all(
      product.search_tags.map((tag) => translateTextSafe(tag, targetLang, sourceLang, options))
    );
  }

  let translatedSpecifications = product.specifications || [];
  if (Array.isArray(product.specifications) && product.specifications.length > 0) {
    translatedSpecifications = await Promise.all(
      product.specifications.map(async (spec) => ({
        ...spec,
        original_key: spec.key,
        original_value: spec.value,
        key: await translateTextSafe(spec.key, targetLang, sourceLang, options),
        value: await translateTextSafe(spec.value, targetLang, sourceLang, options),
      }))
    );
  }

  return {
    ...product,
    translated_language: targetLang,
    language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
    original_name: product.name,
    original_short_description: product.short_description,
    original_description: product.description,
    original_category_name: product.category_name,
    original_subcategory_name: product.subcategory_name,
    original_seller_name: product.seller_name,
    original_material: product.material,
    original_country_of_origin: product.country_of_origin,
    original_product_condition: product.product_condition,
    original_stock_status: product.stock_status,
    original_unit: product.unit,
    original_warranty: product.warranty,
    original_search_tags: product.search_tags,
    name: tName,
    short_description: tShortDesc,
    description: tDesc,
    category_name: tCategoryName,
    subcategory_name: tSubcategoryName,
    seller_name: tSellerName,
    material: tMaterial,
    country_of_origin: tCountryOrigin,
    product_condition: tProductCondition,
    stock_status: tStockStatus,
    unit: tUnit,
    warranty: tWarranty,
    search_tags: translatedSearchTags,
    specifications: translatedSpecifications,
    address: product.address
      ? {
          ...product.address,
          original_city: product.address.city,
          original_state: product.address.state,
          original_country: product.address.country,
          city: tCity,
          state: tState,
          country: tCountry,
        }
      : null,
  };
};

/**
 * Resolves search terms for multilingual search.
 * When a user searches in Hindi (e.g. "कार", "औद्योगिक पंप") or Gujarati (e.g. "ગાડી", "પાણી પંપ"),
 * it translates the search term into English so the database matches English records,
 * and returns both the original and translated terms.
 *
 * @param {string} searchQuery - The user's input search query
 * @param {string} [sourceLang='en'] - The active user language (e.g. 'hi', 'gu', 'en')
 * @returns {Promise<string[]>} Array of search terms to query against DB
 */
const resolveSearchTermsForLanguage = async (searchQuery, sourceLang = 'en') => {
  if (!searchQuery || typeof searchQuery !== 'string' || !searchQuery.trim()) {
    return [];
  }
  const clean = searchQuery.trim();
  const terms = new Set([clean]);

  // Check if string contains Indic/Unicode characters (e.g. Devanagari 0x0900-0x097F, Gujarati 0x0A80-0x0AFF)
  const isIndic = /[\u0900-\u0D7F]/.test(clean);
  const lang = sourceLang && sourceLang !== 'en' ? sourceLang : isIndic ? 'hi' : 'en';

  if (lang !== 'en' || isIndic) {
    try {
      const translatedEnglish = await translateTextSafe(clean, 'en', lang);
      if (translatedEnglish && translatedEnglish.trim()) {
        terms.add(translatedEnglish.trim());
      }
    } catch (err) {
      // Ignore translation errors
    }
  }

  return Array.from(terms);
};

/**
 * Translates a single category item (with optional nested subcategories).
 */
const translateCategoryItem = async (category, targetLang, sourceLang = 'en', options = {}) => {
  if (!category || !targetLang || targetLang === sourceLang) return category;

  const translatedName = await translateTextSafe(category.name, targetLang, sourceLang, options);
  let translatedSubcategories = category.subcategories;

  if (Array.isArray(category.subcategories) && category.subcategories.length > 0) {
    translatedSubcategories = await Promise.all(
      category.subcategories.map(async (sub) => ({
        ...sub,
        original_name: sub.name,
        name: await translateTextSafe(sub.name, targetLang, sourceLang, options),
      }))
    );
  }

  return {
    ...category,
    original_name: category.name,
    name: translatedName || category.name,
    subcategories: translatedSubcategories,
    translated_language: targetLang,
  };
};

/**
 * Translates categories list / pagination payload.
 */
const translateCategoryList = async (categoryData, targetLang, sourceLang = 'en', options = {}) => {
  if (!categoryData || !targetLang || targetLang === sourceLang) return categoryData;

  if (Array.isArray(categoryData)) {
    return await Promise.all(
      categoryData.map((cat) => translateCategoryItem(cat, targetLang, sourceLang, options))
    );
  } else if (categoryData.results && Array.isArray(categoryData.results)) {
    const translatedResults = await Promise.all(
      categoryData.results.map((cat) => translateCategoryItem(cat, targetLang, sourceLang, options))
    );
    return {
      ...categoryData,
      language: targetLang,
      language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
      results: translatedResults,
    };
  }
  return categoryData;
};

/**
 * Translates authenticated user profile object.
 */
const translateUserProfile = async (userProfile, targetLang, sourceLang = 'en', options = {}) => {
  if (!userProfile || !targetLang || targetLang === sourceLang) return userProfile;

  const [
    tFullName,
    tCompanyName,
    tIndustry,
    tBusinessDescription,
    tBusinessTypeName,
    tCategoryName,
    tCity,
    tState,
    tCountry,
    tAddress1,
    tAddress2,
  ] = await Promise.all([
    translateTextSafe(userProfile.full_name, targetLang, sourceLang, options),
    translateTextSafe(userProfile.company_name, targetLang, sourceLang, options),
    translateTextSafe(userProfile.industry, targetLang, sourceLang, options),
    translateTextSafe(userProfile.business_description, targetLang, sourceLang, options),
    translateTextSafe(userProfile.business_type?.name, targetLang, sourceLang, options),
    translateTextSafe(userProfile.category?.name, targetLang, sourceLang, options),
    translateTextSafe(userProfile.address?.city, targetLang, sourceLang, options),
    translateTextSafe(userProfile.address?.state, targetLang, sourceLang, options),
    translateTextSafe(userProfile.address?.country, targetLang, sourceLang, options),
    translateTextSafe(userProfile.address?.address_line_1, targetLang, sourceLang, options),
    translateTextSafe(userProfile.address?.address_line_2, targetLang, sourceLang, options),
  ]);

  return {
    ...userProfile,
    translated_language: targetLang,
    language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
    original_full_name: userProfile.full_name,
    original_company_name: userProfile.company_name,
    original_industry: userProfile.industry,
    original_business_description: userProfile.business_description,
    full_name: tFullName,
    company_name: tCompanyName,
    industry: tIndustry,
    business_description: tBusinessDescription,
    business_type: userProfile.business_type
      ? {
          ...userProfile.business_type,
          original_name: userProfile.business_type.name,
          name: tBusinessTypeName,
        }
      : null,
    category: userProfile.category
      ? {
          ...userProfile.category,
          original_name: userProfile.category.name,
          name: tCategoryName,
        }
      : null,
    address: userProfile.address
      ? {
          ...userProfile.address,
          original_city: userProfile.address.city,
          original_state: userProfile.address.state,
          original_country: userProfile.address.country,
          original_address_line_1: userProfile.address.address_line_1,
          original_address_line_2: userProfile.address.address_line_2,
          city: tCity,
          state: tState,
          country: tCountry,
          address_line_1: tAddress1,
          address_line_2: tAddress2,
        }
      : null,
  };
};

/**
 * Translates public seller profile object.
 */
const translateSellerProfile = async (seller, targetLang, sourceLang = 'en', options = {}) => {
  if (!seller || !targetLang || targetLang === sourceLang) return seller;

  const [
    tName,
    tCompanyName,
    tBusinessName,
    tBusinessType,
    tIndustry,
    tDescription,
    tCity,
    tState,
    tCountry,
    tAddress1,
  ] = await Promise.all([
    translateTextSafe(seller.name, targetLang, sourceLang, options),
    translateTextSafe(seller.company_name, targetLang, sourceLang, options),
    translateTextSafe(seller.business_name, targetLang, sourceLang, options),
    translateTextSafe(seller.business_type, targetLang, sourceLang, options),
    translateTextSafe(seller.industry, targetLang, sourceLang, options),
    translateTextSafe(seller.business_description || seller.description, targetLang, sourceLang, options),
    translateTextSafe(seller.city || seller.address?.city, targetLang, sourceLang, options),
    translateTextSafe(seller.state || seller.address?.state, targetLang, sourceLang, options),
    translateTextSafe(seller.country || seller.address?.country, targetLang, sourceLang, options),
    translateTextSafe(seller.address_line_1 || seller.address?.address_line_1, targetLang, sourceLang, options),
  ]);

  return {
    ...seller,
    translated_language: targetLang,
    language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
    original_name: seller.name,
    original_company_name: seller.company_name,
    name: tName,
    company_name: tCompanyName,
    business_name: tBusinessName,
    business_type: tBusinessType,
    industry: tIndustry,
    business_description: tDescription,
    description: tDescription,
    city: tCity,
    state: tState,
    country: tCountry,
    address: seller.address
      ? {
          ...seller.address,
          city: tCity,
          state: tState,
          country: tCountry,
          address_line_1: tAddress1,
        }
      : seller.address,
  };
};

/**
 * Translates seller list / pagination results.
 */
const translateSellerList = async (sellersData, targetLang, sourceLang = 'en', options = {}) => {
  if (!sellersData || !targetLang || targetLang === sourceLang) return sellersData;

  if (Array.isArray(sellersData)) {
    return await Promise.all(
      sellersData.map((s) => translateSellerProfile(s, targetLang, sourceLang, options))
    );
  } else if (sellersData.results && Array.isArray(sellersData.results)) {
    const translatedResults = await Promise.all(
      sellersData.results.map((s) => translateSellerProfile(s, targetLang, sourceLang, options))
    );
    return {
      ...sellersData,
      language: targetLang,
      language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
      results: translatedResults,
    };
  }
  return sellersData;
};

/**
 * Translates notification item.
 */
const translateNotificationItem = async (notification, targetLang, sourceLang = 'en', options = {}) => {
  if (!notification || !targetLang || targetLang === sourceLang) return notification;

  const [tTitle, tBody] = await Promise.all([
    translateTextSafe(notification.title, targetLang, sourceLang, options),
    translateTextSafe(notification.body, targetLang, sourceLang, options),
  ]);

  return {
    ...notification,
    translated_language: targetLang,
    language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
    original_title: notification.title,
    original_body: notification.body,
    title: tTitle,
    body: tBody,
  };
};

/**
 * Translates notification list / pagination payload.
 */
const translateNotificationList = async (data, targetLang, sourceLang = 'en', options = {}) => {
  if (!data || !targetLang || targetLang === sourceLang) return data;

  if (Array.isArray(data)) {
    return await Promise.all(
      data.map((item) => translateNotificationItem(item, targetLang, sourceLang, options))
    );
  } else if (data.results && Array.isArray(data.results)) {
    const translatedResults = await Promise.all(
      data.results.map((item) => translateNotificationItem(item, targetLang, sourceLang, options))
    );
    return {
      ...data,
      language: targetLang,
      language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
      results: translatedResults,
    };
  }
  return data;
};

/**
 * Translates login device item.
 */
const translateDeviceItem = async (device, targetLang, sourceLang = 'en', options = {}) => {
  if (!device || !targetLang || targetLang === sourceLang) return device;

  const [tTitle, tBrowser, tOs, tDeviceType] = await Promise.all([
    translateTextSafe(device.title, targetLang, sourceLang, options),
    translateTextSafe(device.browser, targetLang, sourceLang, options),
    translateTextSafe(device.os, targetLang, sourceLang, options),
    translateTextSafe(device.device_type, targetLang, sourceLang, options),
  ]);

  return {
    ...device,
    translated_language: targetLang,
    language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
    original_title: device.title,
    title: tTitle,
    browser: tBrowser,
    os: tOs,
    device_type: tDeviceType,
  };
};

/**
 * Translates login devices list.
 */
const translateDeviceList = async (devices, targetLang, sourceLang = 'en', options = {}) => {
  if (!devices || !targetLang || targetLang === sourceLang) return devices;

  if (Array.isArray(devices)) {
    return await Promise.all(
      devices.map((d) => translateDeviceItem(d, targetLang, sourceLang, options))
    );
  } else if (devices.devices && Array.isArray(devices.devices)) {
    const translated = await Promise.all(
      devices.devices.map((d) => translateDeviceItem(d, targetLang, sourceLang, options))
    );
    return {
      ...devices,
      language: targetLang,
      language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
      devices: translated,
    };
  }
  return devices;
};

/**
 * Translates Inquiry Quotation object.
 */
const translateInquiryQuotationItem = async (quotation, targetLang, sourceLang = 'auto', options = {}) => {
  if (!quotation || !targetLang) return quotation;

  const [tPaymentTerms, tRemarks, tUnit, tRejectionReason] = await Promise.all([
    translateTextSafe(quotation.payment_terms, targetLang, sourceLang, options),
    translateTextSafe(quotation.remarks, targetLang, sourceLang, options),
    translateTextSafe(quotation.unit, targetLang, sourceLang, options),
    translateTextSafe(quotation.rejection_reason, targetLang, sourceLang, options),
  ]);

  return {
    ...quotation,
    translated_language: targetLang,
    language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
    original_remarks: quotation.remarks,
    original_payment_terms: quotation.payment_terms,
    payment_terms: tPaymentTerms,
    remarks: tRemarks,
    unit: tUnit,
    rejection_reason: tRejectionReason,
  };
};

/**
 * Translates Inquiry Quotation list / pagination.
 */
const translateInquiryQuotationList = async (data, targetLang, sourceLang = 'auto', options = {}) => {
  if (!data || !targetLang) return data;

  if (Array.isArray(data)) {
    return await Promise.all(
      data.map((q) => translateInquiryQuotationItem(q, targetLang, sourceLang, options))
    );
  } else if (data.results && Array.isArray(data.results)) {
    const translated = await Promise.all(
      data.results.map((q) => translateInquiryQuotationItem(q, targetLang, sourceLang, options))
    );
    return {
      ...data,
      language: targetLang,
      language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
      results: translated,
    };
  }
  return data;
};

/**
 * Translates an Inquiry item (single inquiry, with optional product & quotation).
 */
const translateInquiryItem = async (inquiry, targetLang, sourceLang = 'auto', options = {}) => {
  if (!inquiry || !targetLang) return inquiry;

  const [tMessage, tRejectReason, tUnit, tProductName] = await Promise.all([
    translateTextSafe(inquiry.message, targetLang, sourceLang, options),
    translateTextSafe(inquiry.reject_reason, targetLang, sourceLang, options),
    translateTextSafe(inquiry.unit, targetLang, sourceLang, options),
    inquiry.product?.name ? translateTextSafe(inquiry.product.name, targetLang, 'auto', options) : Promise.resolve(inquiry.product?.name),
  ]);

  let translatedQuotation = inquiry.quotation;
  if (inquiry.quotation && typeof inquiry.quotation === 'object') {
    translatedQuotation = await translateInquiryQuotationItem(inquiry.quotation, targetLang, sourceLang, options);
  }

  return {
    ...inquiry,
    translated_language: targetLang,
    language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
    original_message: inquiry.message,
    original_reject_reason: inquiry.reject_reason,
    message: tMessage,
    reject_reason: tRejectReason,
    unit: tUnit,
    product: inquiry.product
      ? {
          ...inquiry.product,
          name: tProductName,
        }
      : null,
    quotation: translatedQuotation,
  };
};

/**
 * Translates Inquiry list / pagination response.
 */
const translateInquiryList = async (data, targetLang, sourceLang = 'auto', options = {}) => {
  if (!data || !targetLang) return data;

  if (Array.isArray(data)) {
    return await Promise.all(
      data.map((item) => translateInquiryItem(item, targetLang, sourceLang, options))
    );
  } else if (data.results && Array.isArray(data.results)) {
    const translated = await Promise.all(
      data.results.map((item) => translateInquiryItem(item, targetLang, sourceLang, options))
    );
    return {
      ...data,
      language: targetLang,
      language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
      results: translated,
    };
  }
  return data;
};

/**
 * Translates RFQ Quotation item.
 */
const translateRfqQuotationItem = async (quotation, targetLang, sourceLang = 'auto', options = {}) => {
  if (!quotation || !targetLang) return quotation;

  const [tPaymentTerms, tRemarks, tUnit] = await Promise.all([
    translateTextSafe(quotation.payment_terms, targetLang, sourceLang, options),
    translateTextSafe(quotation.remarks, targetLang, sourceLang, options),
    translateTextSafe(quotation.unit, targetLang, sourceLang, options),
  ]);

  return {
    ...quotation,
    translated_language: targetLang,
    language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
    original_remarks: quotation.remarks,
    original_payment_terms: quotation.payment_terms,
    payment_terms: tPaymentTerms,
    remarks: tRemarks,
    unit: tUnit,
  };
};

/**
 * Translates RFQ Quotation list.
 */
const translateRfqQuotationList = async (data, targetLang, sourceLang = 'auto', options = {}) => {
  if (!data || !targetLang) return data;

  if (Array.isArray(data)) {
    return await Promise.all(
      data.map((q) => translateRfqQuotationItem(q, targetLang, sourceLang, options))
    );
  } else if (data.results && Array.isArray(data.results)) {
    const translated = await Promise.all(
      data.results.map((q) => translateRfqQuotationItem(q, targetLang, sourceLang, options))
    );
    return {
      ...data,
      language: targetLang,
      language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
      results: translated,
    };
  }
  return data;
};

/**
 * Translates RFQ item (title, description, category, subcategory, unit, quotations).
 */
const translateRfqItem = async (rfq, targetLang, sourceLang = 'auto', options = {}) => {
  if (!rfq || !targetLang) return rfq;

  const [tTitle, tDescription, tUnit, tCategory, tSubcategory, tCity] = await Promise.all([
    translateTextSafe(rfq.title, targetLang, sourceLang, options),
    translateTextSafe(rfq.description, targetLang, sourceLang, options),
    translateTextSafe(rfq.unit, targetLang, sourceLang, options),
    translateTextSafe(rfq.category_name, targetLang, 'auto', options),
    translateTextSafe(rfq.subcategory_name, targetLang, 'auto', options),
    translateTextSafe(rfq.city, targetLang, 'auto', options),
  ]);

  let translatedQuotations = rfq.quotations;
  if (Array.isArray(rfq.quotations)) {
    translatedQuotations = await Promise.all(
      rfq.quotations.map((q) => translateRfqQuotationItem(q, targetLang, sourceLang, options))
    );
  }

  return {
    ...rfq,
    translated_language: targetLang,
    language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
    original_title: rfq.title,
    original_description: rfq.description,
    title: tTitle,
    description: tDescription,
    unit: tUnit,
    category_name: tCategory,
    subcategory_name: tSubcategory,
    city: tCity,
    quotations: translatedQuotations,
  };
};

/**
 * Translates RFQ list / pagination.
 */
const translateRfqList = async (data, targetLang, sourceLang = 'auto', options = {}) => {
  if (!data || !targetLang) return data;

  if (Array.isArray(data)) {
    return await Promise.all(
      data.map((item) => translateRfqItem(item, targetLang, sourceLang, options))
    );
  } else if (data.results && Array.isArray(data.results)) {
    const translated = await Promise.all(
      data.results.map((item) => translateRfqItem(item, targetLang, sourceLang, options))
    );
    return {
      ...data,
      language: targetLang,
      language_name: SUPPORTED_LANGUAGES[targetLang] || targetLang,
      results: translated,
    };
  }
  return data;
};

module.exports = {
  SUPPORTED_LANGUAGES,
  translateSingleText,
  translateTextSafe,
  translateProduct,
  translateFullProductDetail,
  translateProductListItem,
  resolveSearchTermsForLanguage,
  translateCategoryItem,
  translateCategoryList,
  translateUserProfile,
  translateSellerProfile,
  translateSellerList,
  translateNotificationItem,
  translateNotificationList,
  translateDeviceItem,
  translateDeviceList,
  translateInquiryItem,
  translateInquiryList,
  translateInquiryQuotationItem,
  translateInquiryQuotationList,
  translateRfqItem,
  translateRfqList,
  translateRfqQuotationItem,
  translateRfqQuotationList,
};



