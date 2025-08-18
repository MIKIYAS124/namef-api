const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get orders based on role
router.get('/', authenticateToken, async (req, res) => {
  try {
    let orders;

    if (req.user.role === 'SALES_REPRESENTATIVE') {
      // Sales reps see only their orders
      orders = await prisma.order.findMany({
        where: { salesRepId: req.user.id },
        include: {
          orderItems: {
            include: {
              stockItem: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      // Store keepers and admins see all orders
      orders = await prisma.order.findMany({
        include: {
          salesRep: {
            select: { username: true }
          },
          orderItems: {
            include: {
              stockItem: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    res.json(orders);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create order (Sales Representative only)
router.post('/', authenticateToken, requireRole(['SALES_REPRESENTATIVE']), async (req, res) => {
  try {
    const { customerName, customerContact, items } = req.body;

    if (!customerName || !customerContact || !items || items.length === 0) {
      return res.status(400).json({ error: 'Customer details and items are required' });
    }

    // Calculate total amount and validate stock
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const stockItem = await prisma.stockItem.findUnique({
        where: { id: item.stockItemId }
      });

      if (!stockItem) {
        return res.status(400).json({ error: `Stock item not found: ${item.stockItemId}` });
      }

      if (stockItem.quantity < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${stockItem.name}` });
      }

      const sellingPrice = item.sellingPrice || 0;
      const itemTotal = sellingPrice * item.quantity;
      totalAmount += itemTotal;

      orderItems.push({
        stockItemId: item.stockItemId,
        quantity: item.quantity,
        unitPrice: sellingPrice,
        totalPrice: itemTotal
      });
    }

    const order = await prisma.order.create({
      data: {
        customerName,
        customerContact,
        totalAmount,
        salesRepId: req.user.id,
        orderItems: {
          create: orderItems
        }
      },
      include: {
        orderItems: {
          include: {
            stockItem: true
          }
        }
      }
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve order (Store Keeper only)
router.patch('/:id/approve', authenticateToken, requireRole(['STORE_KEEPER']), async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: {
          include: {
            stockItem: true
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'PENDING') {
      return res.status(400).json({ error: 'Order is not pending' });
    }

    // Check stock availability again
    for (const orderItem of order.orderItems) {
      if (orderItem.stockItem.quantity < orderItem.quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for ${orderItem.stockItem.name}` 
        });
      }
    }

    // Update stock quantities and approve order
    await prisma.$transaction(async (tx) => {
      // Deduct stock quantities
      for (const orderItem of order.orderItems) {
        await tx.stockItem.update({
          where: { id: orderItem.stockItemId },
          data: {
            quantity: {
              decrement: orderItem.quantity
            }
          }
        });
      }

      // Update order status
      await tx.order.update({
        where: { id },
        data: { status: 'APPROVED' }
      });
    });

    const updatedOrder = await prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: {
          include: {
            stockItem: true
          }
        }
      }
    });

    res.json(updatedOrder);
  } catch (error) {
    console.error('Approve order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reject order (Store Keeper only)
router.patch('/:id/reject', authenticateToken, requireRole(['STORE_KEEPER']), async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const order = await prisma.order.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason
      },
      include: {
        orderItems: {
          include: {
            stockItem: true
          }
        }
      }
    });

    res.json(order);
  } catch (error) {
    console.error('Reject order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;