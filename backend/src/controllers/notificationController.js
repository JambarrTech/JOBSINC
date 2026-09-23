const prisma = require('../config/prisma');
const { parsePagination, buildPaginationResponse } = require('../utils/pagination');

exports.getNotifications = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId: req.user.userId } }),
      prisma.notification.count({ where: { userId: req.user.userId, isRead: false } }),
    ]);

    res.json({ data: notifications, unreadCount, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Erreur getNotifications:', error);
    res.status(500).json({ error: 'Impossible de récupérer les notifications.' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== req.user.userId) {
      return res.status(404).json({ error: 'Notification introuvable.' });
    }

    await prisma.notification.update({ where: { id }, data: { isRead: true } });
    res.json({ message: 'Notification marquée comme lue.' });
  } catch (error) {
    console.error('Erreur markAsRead:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour la notification.' });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: 'Toutes les notifications marquées comme lues.' });
  } catch (error) {
    console.error('Erreur markAllAsRead:', error);
    res.status(500).json({ error: 'Impossible de mettre à jour les notifications.' });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== req.user.userId) {
      return res.status(404).json({ error: 'Notification introuvable.' });
    }

    await prisma.notification.delete({ where: { id } });
    res.json({ message: 'Notification supprimée.' });
  } catch (error) {
    console.error('Erreur deleteNotification:', error);
    res.status(500).json({ error: 'Impossible de supprimer la notification.' });
  }
};
