// Templates are defined once in code and registered in the DB (FR-M1, FR-M2).
const { Template } = require('../models');

const definitions = [
  {
    key: 'restaurant', name: 'Restaurant', description: 'Menu-driven site for restaurants, bakeries and food brands.',
    supportedSections: ['hero', 'about', 'menu', 'gallery', 'contact'],
    dataSchema: { itemLabel: 'Menu', categoryLabel: 'Menu categories', itemsLabel: 'Menu items', fields: ['name', 'description', 'price', 'image', 'isAvailable'], cart: false },
  },
  {
    key: 'store', name: 'Store', description: 'Product catalog with categories and a shopping cart.',
    supportedSections: ['hero', 'about', 'menu', 'gallery', 'contact'],
    dataSchema: { itemLabel: 'Products', categoryLabel: 'Product categories', itemsLabel: 'Products', fields: ['name', 'description', 'price', 'image', 'isAvailable'], cart: true },
  },
];

exports.registerTemplates = async () => {
  for (const d of definitions) {
    await Template.updateOne({ key: d.key }, { $set: d, $setOnInsert: { status: 'enabled' } }, { upsert: true });
  }
};
