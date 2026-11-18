// Demo tenants (SRS section 13), based on the real brands.
// Facts taken from the live sites / public listings where available (see README "Data sources").
// Anything not publicly confirmed (prices, some contact details) is sample data and should be replaced by the owner.
const { photo, brand } = require('./photos');

const hours = (open, close) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({ day, open, close, closed: false }));
const mark = (text, bg, fg = '#fff', size = 64) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><rect width='120' height='120' rx='28' fill='${bg}'/><text x='60' y='${60 + size / 3}' font-size='${size}' font-family='Georgia' font-weight='bold' text-anchor='middle' fill='${fg}'>${text}</text></svg>`)}`;
const item = (name, description, price, key) => ({ name, description, price, image: key ? photo(key, 700) : '' });

module.exports = [
  {
    name: 'Kababjees', slug: 'kababjees', templateKey: 'restaurant', businessType: 'restaurant', status: 'active',
    owner: { name: 'Kababjees Owner', email: 'owner@kababjees.test' }, editor: { name: 'Kababjees Editor', email: 'editor@kababjees.test' },
    branding: { logo: mark('K', '#c1121f'), tagline: 'Grilled to perfection, served with love' },
    theme: { primary: '#c1121f', secondary: '#2b1a14', fontHeading: 'Georgia, serif', fontBody: 'system-ui, sans-serif' },
    hero: { title: 'Authentic Kababs & Grills', subtitle: 'Karachi\'s charcoal-fired favourites — dine in at Do Darya or order for delivery', image: photo('kjHero', 1800) },
    about: 'Kababjees is a Karachi restaurant brand known for charcoal-grilled kababs, tikka and BBQ platters, with branches across Pakistan including the famous Do Darya seaside strip.\n\nBeyond the grill we serve karahi, steaks and a Kababjees Express fast-food range with burgers, pasta and fries — fresh, hot and made to order.',
    contact: { phone: '', email: '', address: 'Do Darya, Seaview, DHA Phase 8, Karachi, Pakistan', map: 'https://maps.google.com/?q=Kababjees+Do+Darya+Karachi' },
    socials: {},
    openingHours: hours('12:00', '00:00'),
    seo: { title: 'Kababjees | Grills, BBQ & Karahi in Karachi', description: 'Charcoal-grilled kababs, tikka, karahi, steaks and fast food from Kababjees.', ogImage: photo('kjHero', 1200) },
    categories: [
      { name: 'BBQ', items: [item('Chicken Tikka', 'Juicy marinated chicken tikka grilled over charcoal', 790, 'seekh'), item('Chicken Malai Boti', 'Creamy, melt-in-the-mouth marinated chicken', 780, 'malai'), item('Beef Boti', 'Tender marinated cubes served with chutney', 850, 'boti')] },
      { name: 'Karahi & Steaks', items: [item('Peshawari Karahi', 'Slow cooked in a traditional wok with tomato and green chilli', 1450, 'karahi'), item('Grilled Steak', 'Seared steak with sauce and sides', 1650, 'steak')] },
      { name: 'Kababjees Express', items: [item('Zingo Burger', 'Crunchy fried chicken, lettuce and house sauce', 480, 'zinger'), item('Alfredo Pasta', 'Creamy white-sauce pasta', 650, 'pasta'), item('Mayo Garlic Fries', 'Golden fries with garlic mayo', 320, 'fries')] },
      { name: 'Drinks', items: [item('Mint Margarita', 'Fresh mint, lemon and soda over ice', 220, 'mint'), item('Soft Drink', 'Chilled, 345 ml', 120, 'cola')] },
    ],
    pages: [{ title: 'Our Story', body: 'From a charcoal grill by the sea to branches across the country, Kababjees has stayed true to one idea: great kababs, cooked over real fire.' }],
    gallery: ['kj1', 'kj2', 'kj3', 'kj4', 'kj5'],
  },
  {
    name: 'United King', slug: 'unitedking', templateKey: 'restaurant', businessType: 'bakery', status: 'active',
    owner: { name: 'United King Owner', email: 'owner@unitedking.test' }, editor: { name: 'United King Editor', email: 'editor@unitedking.test' },
    branding: { logo: mark('UK', '#cc1a1f', '#ffd400', 52), tagline: 'The Food Kingdom' },
    theme: { primary: '#cc1a1f', secondary: '#2a0b0d', fontHeading: 'Trebuchet MS, sans-serif', fontBody: 'system-ui, sans-serif' },
    hero: { title: 'Cakes, Bakery, Sweets & Fast Food', subtitle: 'Karachi\'s trusted bakery since 1984 — now delivered to your door', image: photo('ukHero', 1800) },
    about: 'United King began in Karachi in 1984 as a small sweet and bakery shop and has grown into one of Pakistan\'s best-loved food brands, with over 250 products.\n\nFrom celebration cakes and fresh bakery items to traditional sweets and fast food, everything is made with care and delivered fresh. Call 021-111-022-022 or order online.',
    contact: { phone: '021-111-022-022', email: '', address: 'Plot-64, Ibrahim Residency, Sharfabad, Karachi 75300, Pakistan', map: 'https://maps.google.com/?q=United+King+Sharfabad+Karachi', },
    socials: {},
    openingHours: hours('09:00', '23:00'),
    seo: { title: 'United King | Cakes, Bakery, Sweets & Fast Food', description: 'Order cakes, bakery items, sweets and fast food from United King, Karachi.', ogImage: photo('ukHero', 1200) },
    categories: [
      { name: 'Cakes', items: [item('Chocolate Fudge Cake', '1 lb, rich dark chocolate layers', 1500, 'fudge'), item('Red Velvet Cake', '1 lb with cream cheese frosting', 1700, 'velvet')] },
      { name: 'Bakery', items: [item('Chicken Patties', 'Flaky pastry, spiced chicken filling', 180, 'patty'), item('Milk Bread', 'Soft sliced loaf, baked every morning', 240, 'bread')] },
      { name: 'Sweets', items: [item('Fresh Jalebi', 'Crisp, golden and syrupy, per kg', 900, 'jalebi'), item('Mithai Box', 'Assorted traditional sweets, 1 kg', 1800, 'sweets')] },
      { name: 'Fast Food', items: [item('Cheese Pizza', 'Hand-stretched crust, mozzarella and tomato', 950, 'pizza'), item('Zinger Burger', 'Crispy chicken fillet with sauce', 450, 'zinger')] },
    ],
    pages: [{ title: 'Custom Cakes', body: 'Planning a birthday or wedding? Tell us your idea and our bakers will design a cake just for you. Orders need 48 hours notice.' }],
    gallery: ['uk1', 'uk2', 'uk3', 'uk4', 'uk5'],
  },
  {
    name: 'Foodin', slug: 'foodin', templateKey: 'restaurant', businessType: 'food', status: 'active',
    owner: { name: 'Foodin Owner', email: 'owner@foodin.test' }, editor: { name: 'Foodin Editor', email: 'editor@foodin.test' },
    branding: { logo: mark('F', '#00796b'), tagline: 'Good food, good mood' },
    theme: { primary: '#00796b', secondary: '#263238', fontHeading: 'Verdana, sans-serif', fontBody: 'system-ui, sans-serif' },
    hero: { title: 'Eat Well. Feel Good.', subtitle: 'Burgers, bowls and desi comfort food, made to order', image: photo('fiHero', 1800) },
    about: 'Foodin brings together fast, fresh and flavourful meals for busy people.\n\nEverything is made to order with quality ingredients, so every bite tastes the way it should.',
    contact: { phone: '', email: '', address: 'Pakistan', map: '' },
    socials: {},
    openingHours: hours('11:00', '01:00'),
    seo: { title: 'Foodin', description: 'Burgers, bowls and desi comfort food.', ogImage: photo('fiHero', 1200) },
    categories: [
      { name: 'Burgers', items: [item('Classic Smash', 'Double smashed patty, cheese, house sauce', 890, 'smash'), item('Crispy Chicken', 'Buttermilk fried chicken, slaw, pickles', 790, 'crispy')] },
      { name: 'Bowls', items: [item('Chicken Tikka Bowl', 'Rice, tikka, fresh salad and raita', 690, 'bowl')] },
      { name: 'Sides', items: [item('Loaded Fries', 'Golden fries with cheese and special sauce', 390, 'fries')] },
    ],
    pages: [{ title: 'Catering', body: 'Hosting an office lunch or party? We cater for groups with custom menus. Message us to get a quote.' }],
    gallery: ['fi1', 'fi2', 'fi3', 'fi4', 'fi5'],
  },
  {
    name: 'Kravemart', slug: 'kravemart', templateKey: 'store', businessType: 'store', status: 'active',
    owner: { name: 'Kravemart Owner', email: 'owner@kravemart.test' }, editor: { name: 'Kravemart Editor', email: 'editor@kravemart.test' },
    branding: { logo: brand('kmLogo'), tagline: 'Soch se ziada tez' },
    theme: { primary: '#e0aa00', secondary: '#282828', fontHeading: 'Trebuchet MS, sans-serif', fontBody: 'system-ui, sans-serif' },
    hero: { title: 'Groceries & More At Your Door', subtitle: 'Your one-stop online delivery store for groceries and everyday essentials — Soch se ziada tez', image: photo('kmHero', 1800) },
    about: 'Krave Mart is your one-stop online delivery store for groceries, everyday essentials and much more.\n\nWe are live in Karachi, Lahore and Rawalpindi. Add to cart, check out and pay, and our rockstar rider will be at your doorstep within minutes — no more long queues.',
    contact: { phone: '', email: 'support@kravemart.com', address: 'Thinkhub – Basement Floor, Plot 41, Block B, SMCHS, Karachi', map: 'https://maps.google.com/?q=Thinkhub+SMCHS+Karachi' },
    socials: { facebook: 'https://www.facebook.com/kravemart.pk/', instagram: 'https://www.instagram.com/kravemartpk/', twitter: 'https://twitter.com/kravemart/' },
    openingHours: hours('08:00', '00:00'),
    seo: { title: 'Krave Mart | Groceries & More At Your Door', description: 'Fast online grocery delivery in Karachi, Lahore and Rawalpindi.', ogImage: photo('kmHero', 1200) },
    categories: [
      { name: 'Snacks', items: [item('Potato Chips 150g', 'Classic salted, extra crunchy', 150, 'chips'), item('Chocolate Bar', 'Smooth milk chocolate 80g', 180, 'choc'), item('Salted Peanuts', 'Roasted and lightly salted, 200g', 220, 'peanuts')] },
      { name: 'Beverages', items: [item('Orange Juice 1L', 'Cold pressed, no added sugar', 340, 'oj'), item('Mineral Water 1.5L', 'Natural spring water', 90, 'water')] },
      { name: 'Fresh Produce', items: [item('Fresh Tomatoes 1kg', 'Farm fresh, hand picked', 160, 'tomato'), item('Mixed Vegetables 1kg', 'Seasonal selection', 280, 'veg')] },
      { name: 'Household', items: [item('Dishwash Liquid', 'Lemon fresh, 500ml', 260, 'dish')] },
    ],
    pages: [
      { title: 'How It Works', body: '1. Add to cart — select from a wide variety of groceries and much more.\n\n2. Check out & pay — our rockstar rider will be at your doorstep within minutes.\n\n3. Enjoy — no more long queues, get the fastest grocery delivery at home.' },
      { title: 'Areas', body: 'We are now live in Karachi, Rawalpindi and Lahore.' },
    ],
    gallery: ['km1', 'km2', 'km3', 'km4'],
  },
];
module.exports.photo = photo;
