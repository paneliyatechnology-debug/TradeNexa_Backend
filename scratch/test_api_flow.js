const db = require('../database/knex');
const categoryModel = require('../models/categoryModel');
const brandModel = require('../models/brandModel');
const supplierModel = require('../models/supplierModel');
const productModel = require('../models/productModel');
const bannerModel = require('../models/bannerModel');
const offerModel = require('../models/offerModel');
const rfqModel = require('../models/rfqModel');
const serviceModel = require('../models/serviceModel');
const newsModel = require('../models/newsModel');

async function test() {
  console.log('--- STARTING MODEL CRUD INTEGRATION TEST (INTEGRATED SCHEMAS) ---');
  let category, brand, supplier, product, banner, offer, rfq, service, news, activeUser;

  try {
    // Dynamically look up the first active non-deleted user in the database
    activeUser = await db('users').whereNull('deleted_at').first();
    if (!activeUser) {
      throw new Error('No active user found in database. Run seeds first.');
    }
    const userId = activeUser.id;
    console.log(`Using active user ID: ${userId} (${activeUser.full_name})`);

    // Make sure this user is a seller in roles table (role ID dynamically queried)
    const sellerRole = await db('roles').where({ code: 'seller' }).first();
    const sellerRoleId = sellerRole ? sellerRole.id : 2;
    await db('users').where({ id: userId }).update({ role_id: sellerRoleId, is_active: true });

    // Clean up any old test records first
    await db('products').where('name', 'like', '%Test%').orWhere('name', 'like', '%Widget%').del();
    await db('rfqs').where('title', 'like', '%Test%').orWhere('title', 'like', '%Widget%').orWhere('title', 'like', '%Bulk%').del();
    await db('banners').where('title', 'like', '%Test%').orWhere('title', 'like', '%Sale%').del();
    await db('brands').where('name', 'like', '%Test%').del();
    await db('categories').where('name', 'like', '%Test%').del();
    await db('offers').where('title', 'like', '%Test%').del();
    await db('services').where('name', 'like', '%Test%').del();
    await db('news').where('title', 'like', '%Test%').del();

    // Reset user supplier details/coordinates
    await db('company_details').where({ user_id: userId }).update({
      rating: 0.00,
      response_rate: 0.00,
      years_in_business: 0
    });
    await db('addresses').where({ user_id: userId }).update({
      latitude: null,
      longitude: null
    });

    // 1. Categories
    console.log('Testing Categories...');
    category = await categoryModel.createCategory({ name: 'Test Category', slug: 'test-category' });
    console.log('Created Category:', category);
    
    let categoriesList = await categoryModel.findCategories({ q: 'Test' });
    console.log('Listed Categories:', categoriesList.results);
    
    // 2. Brands
    console.log('\nTesting Brands...');
    brand = await brandModel.createBrand({ name: 'Test Brand', is_popular: true });
    console.log('Created Brand:', brand);
    
    let brandsList = await brandModel.findBrands({ is_popular: true });
    console.log('Listed Popular Brands:', brandsList.results);

    // 3. Suppliers (Mapped to Active User)
    console.log('\nTesting Suppliers...');
    await db('users').where({ id: userId }).update({ role_id: sellerRoleId, is_verified: true });
    
    const companyExists = await db('company_details').where({ user_id: userId }).first();
    if (companyExists) {
      await db('company_details').where({ user_id: userId }).update({
        company_name: 'Super Supplier Corp',
        rating: 4.8,
        response_rate: 95.0,
        years_in_business: 12
      });
    } else {
      await db('company_details').insert({
        user_id: userId,
        company_name: 'Super Supplier Corp',
        rating: 4.8,
        response_rate: 95.0,
        years_in_business: 12
      });
    }

    await db('addresses').where({ user_id: userId }).update({
      latitude: 12.9716,
      longitude: 77.5946
    });

    supplier = await supplierModel.findSupplierById(userId);
    console.log('Created Supplier:', supplier);
    
    // Test nearby search
    console.log('Testing nearby suppliers (Bangalore query)...');
    let nearby = await supplierModel.findNearbySuppliers(12.9716, 77.5946, 10);
    console.log('Nearby Suppliers:', nearby.results);

    // 4. Products (supplier_id maps to active user ID)
    console.log('\nTesting Products...');
    product = await productModel.createProduct({
      name: 'Industrial Widget A',
      price: 1500.00,
      moq: 10,
      unit: 'boxes',
      supplier_id: supplier.id, // active userId
      category_id: category.id,
      brand_id: brand.id,
      is_trending: true,
      is_recommended: true,
      rating: 4.5
    });
    console.log('Created Product:', product);

    let productsList = await productModel.findProducts({ is_trending: true });
    console.log('Listed Trending Products:', productsList.results);

    // 5. Banners
    console.log('\nTesting Banners...');
    banner = await bannerModel.createBanner({
      title: 'Summer Mega Sale',
      image: 'https://example.com/banner.jpg',
      redirect_type: 'category',
      redirect_id: category.id,
      priority: 1
    });
    console.log('Created Banner:', banner);
    
    let bannersList = await bannerModel.findBanners();
    console.log('Listed Banners:', bannersList);

    // 6. Offers
    console.log('\nTesting Offers...');
    offer = await offerModel.createOffer({
      title: 'Flat 20% Off Electronics',
      banner: 'https://example.com/offer.jpg',
      discount: '20% OFF',
      expiry_date: new Date(Date.now() + 86400000).toISOString() // 1 day from now
    });
    console.log('Created Offer:', offer);
    
    let offersList = await offerModel.findOffers();
    console.log('Listed Offers:', offersList.results);

    // 7. RFQs
    console.log('\nTesting RFQs...');
    const dbCity = await db('cities').first();
    const cityId = dbCity ? dbCity.id : 1;
    rfq = await rfqModel.createRfq({
      title: 'Bulk order of Industrial Widgets',
      category_id: category.id,
      city_id: cityId,
      description: 'Need 500 units of widgets ASAP',
      quantity: 500,
      budget: 750000.00
    }, userId); // Active User ID
    console.log('Created RFQ:', rfq);
    
    let rfqsList = await rfqModel.findRfqs({ category_id: category.id });
    console.log('Listed RFQs:', rfqsList.results);

    // 8. Services
    console.log('\nTesting Services...');
    service = await serviceModel.createService({
      name: 'Custom Logistics & Shipping',
      description: 'Pan-India shipping for bulk cargo'
    });
    console.log('Created Service:', service);
    
    let servicesList = await serviceModel.findServices();
    console.log('Listed Services:', servicesList);

    // 9. News
    console.log('\nTesting News...');
    news = await newsModel.createNews({
      title: 'TradeNexa launches new B2B features',
      content: 'Today TradeNexa announced key upgrades to the supplier search and RFQ portal...',
      published_at: new Date().toISOString()
    });
    console.log('Created News:', news);
    
    let newsList = await newsModel.findNewsList();
    console.log('Listed News Articles:', newsList.results);

    console.log('\n--- ALL MODEL TESTS COMPLETED SUCCESSFULLY ---');
  } catch (err) {
    console.error('Test Failed:', err);
  } finally {
    // Clean up
    console.log('\nCleaning up test data...');
    if (product) await db('products').where('id', product.id).del();
    if (rfq) await db('rfqs').where('id', rfq.id).del();
    if (banner) await db('banners').where('id', banner.id).del();
    if (brand) await db('brands').where('id', brand.id).del();
    if (category) await db('categories').where('id', category.id).del();
    if (offer) await db('offers').where('id', offer.id).del();
    if (service) await db('services').where('id', service.id).del();
    if (news) await db('news').where('id', news.id).del();

    // Reset coordinates/supplier details
    if (activeUser) {
      await db('company_details').where({ user_id: activeUser.id }).update({
        rating: 0.00,
        response_rate: 0.00,
        years_in_business: 0
      });
      await db('addresses').where({ user_id: activeUser.id }).update({
        latitude: null,
        longitude: null
      });
    }

    console.log('Cleanup completed.');
    await db.destroy();
  }
}

test();
