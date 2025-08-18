const express = require('express');
const { prisma } = require('../lib/prisma');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get sales summary (Admin only)
router.get('/sales-summary', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let whereClause = { status: 'APPROVED' };
    
    // Add date filtering if provided
    if (startDate && endDate) {
      whereClause.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate + 'T23:59:59.999Z')
      };
    }
    
    const approvedOrders = await prisma.order.findMany({
      where: whereClause,
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

    // Calculate totals
    let totalRevenue = 0;
    let totalCost = 0;

    const salesData = approvedOrders.map(order => {
      let orderCost = 0;
      
      order.orderItems.forEach(item => {
        orderCost += item.stockItem.buyingPrice * item.quantity;
      });

      totalRevenue += order.totalAmount;
      totalCost += orderCost;

      return {
        id: order.id,
        customerName: order.customerName,
        customerContact: order.customerContact,
        salesRep: order.salesRep.username,
        totalAmount: order.totalAmount,
        cost: orderCost,
        profit: order.totalAmount - orderCost,
        createdAt: order.createdAt,
        items: order.orderItems.map(item => ({
          name: item.stockItem.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice
        }))
      };
    });

    const totalProfit = totalRevenue - totalCost;

    res.json({
      sales: salesData,
      summary: {
        totalRevenue,
        totalCost,
        totalProfit,
        totalOrders: approvedOrders.length
      }
    });
  } catch (error) {
    console.error('Get sales summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get dashboard stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const [
      totalUsers,
      totalStockItems,
      pendingOrders,
      approvedOrders,
      lowStockItems
    ] = await Promise.all([
      prisma.user.count({ where: { role: { not: 'ADMIN' }, isActive: true } }),
      prisma.stockItem.count(),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: 'APPROVED' } }),
      prisma.stockItem.count({ where: { quantity: { lte: 10 } } })
    ]);

    res.json({
      totalUsers,
      totalStockItems,
      pendingOrders,
      approvedOrders,
      lowStockItems
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;