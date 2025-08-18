const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all stock items
router.get('/', authenticateToken, async (req, res) => {
  try {
    const stockItems = await prisma.stockItem.findMany({
      orderBy: { name: 'asc' }
    });

    res.json(stockItems);
  } catch (error) {
    console.error('Get stock items error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add new stock item (Manager only)
router.post('/', authenticateToken, requireRole(['MANAGER']), async (req, res) => {
  try {
    const { name, quantity, buyingPrice } = req.body;

    if (!name || quantity === undefined || buyingPrice === undefined) {
      return res.status(400).json({ error: 'Name, quantity, and buying price are required' });
    }

    if (quantity < 0 || buyingPrice < 0) {
      return res.status(400).json({ error: 'Values must be non-negative' });
    }

    const existingItem = await prisma.stockItem.findUnique({
      where: { name }
    });

    if (existingItem) {
      return res.status(400).json({ error: 'Item with this name already exists' });
    }

    const stockItem = await prisma.stockItem.create({
      data: {
        name,
        quantity: parseInt(quantity),
        buyingPrice: parseFloat(buyingPrice)
      }
    });

    res.status(201).json(stockItem);
  } catch (error) {
    console.error('Create stock item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update stock item (Manager only)
router.patch('/:id', authenticateToken, requireRole(['MANAGER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, buyingPrice } = req.body;

    const updateData = {};
    if (quantity !== undefined) updateData.quantity = parseInt(quantity);
    if (buyingPrice !== undefined) updateData.buyingPrice = parseFloat(buyingPrice);

    const stockItem = await prisma.stockItem.update({
      where: { id },
      data: updateData
    });

    res.json(stockItem);
  } catch (error) {
    console.error('Update stock item error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;