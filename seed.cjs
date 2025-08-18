// server/seed.js
require('dotenv').config();
const { prisma } = require('./lib/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  console.log('Seeding database...');

  // Read from environment variables
  const adminUsername = process.env.SEED_ADMIN_USERNAME;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminUsername || !adminPassword) {
    console.error('❌ Missing SEED_ADMIN_USERNAME or SEED_ADMIN_PASSWORD in .env');
    process.exit(1);
  }

  const users = [
    { username: adminUsername, password: adminPassword, role: 'ADMIN' }
  ];

  for (const userData of users) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    await prisma.user.upsert({
      where: { username: userData.username },
      update: {},
      create: {
        username: userData.username,
        password: hashedPassword,
        role: userData.role
      }
    });

    console.log(`✅ Admin user '${userData.username}' created successfully`);
  }

  // Create stock items (ETB), placeholders for quantity & buyingPrice
  const stockItems = [
    { name: '18mm mdf UV (local )', quantity: 0, buyingPrice: 0 },
    { name: '18mm mdf  UV (imported )', quantity: 0, buyingPrice: 0 },
    { name: '18mm mdf veneer local', quantity: 0, buyingPrice: 0 },
    { name: '18mm mdf laminated', quantity: 0, buyingPrice: 0 },
    { name: '18mm mdf plain', quantity: 0, buyingPrice: 0 },
    { name: '18mm Chipwood laminated', quantity: 0, buyingPrice: 0 },
    { name: '12mm mdf plain', quantity: 0, buyingPrice: 0 },
    { name: '13mm chipwood', quantity: 0, buyingPrice: 0 },
    { name: '10mm mdf plain', quantity: 0, buyingPrice: 0 },
    { name: '10mm mdf veneer', quantity: 0, buyingPrice: 0 },
    { name: '5.7mm mdf plain', quantity: 0, buyingPrice: 0 },
    { name: '5.7mm mdf veneer', quantity: 0, buyingPrice: 0 },
    { name: '2.6mm mdf plain', quantity: 0, buyingPrice: 0 },
    { name: '2.6mm mdf laminated', quantity: 0, buyingPrice: 0 },
    { name: '3mm mdf veneer ( imported )', quantity: 0, buyingPrice: 0 },
    { name: 'Hardboard', quantity: 0, buyingPrice: 0 },
    { name: 'Block-board laminated', quantity: 0, buyingPrice: 0 },
    { name: 'Block-board uv', quantity: 0, buyingPrice: 0 },
  ];

  for (const item of stockItems) {
    await prisma.stockItem.upsert({
      where: { name: item.name },
      update: {},
      create: item
    });
  }

  console.log('📦 Sample stock items created with buying prices only');
  console.log('✅ Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
