import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { broadcast, WSEventTypes } from '../services/websocket';
import { createNotification } from '../services/notifications';

const router = Router();
router.use(authenticate);

// Helper to check channel access permissions
async function verifyChannelAccess(user: any, channel: string) {
  const isSuperAdmin = user.roleName === 'SUPER_ADMIN';

  // 1. Company-wide general chat is open to everyone
  if (channel === 'general') {
    return true;
  }

  // 2. Department team channels (e.g. dept_fde, dept_sal, dept_mkt)
  if (channel.startsWith('dept_')) {
    if (isSuperAdmin) return true;

    const deptCode = channel.replace('dept_', '').toLowerCase();
    
    // Check if user belongs to this department
    const userWithDept = await prisma.user.findUnique({
      where: { id: user.id },
      include: { department: true }
    });

    const userDeptCode = userWithDept?.department?.code?.toLowerCase();
    const userDeptId = userWithDept?.departmentId;

    if (userDeptCode === deptCode || userDeptId === deptCode) {
      return true;
    }

    throw new AppError('Access denied: You can only access your assigned team chat', 403);
  }

  // 3. 1-on-1 Direct Messages (e.g. dm_userA_userB)
  if (channel.startsWith('dm_')) {
    const parts = channel.replace('dm_', '').split('_');
    if (parts.length === 2) {
      const [u1, u2] = parts;
      if (user.id === u1 || user.id === u2 || isSuperAdmin) {
        return true;
      }
    }
    throw new AppError('Access denied: You are not a participant in this conversation', 403);
  }

  // Default allowed for legacy / announcements if needed
  if (isSuperAdmin) return true;
  return true;
}

// ─── ENSURE CHAT READS TRACKING TABLE ────────────────────────────────────────
async function initChatReadsTable() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS chat_channel_reads (
        userId TEXT NOT NULL,
        channel TEXT NOT NULL,
        lastReadAt TEXT NOT NULL,
        PRIMARY KEY (userId, channel)
      )
    `);
  } catch (err) {
    console.error('[CHAT] Failed to ensure chat_channel_reads table:', err);
  }
}
initChatReadsTable();

// ─── GET /api/chat/unread-count ──────────────────────────────────────────────
// Returns total unread messages count and per-channel breakdown for current user
router.get('/unread-count', async (req, res, next) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';

    // 1. Get user's recorded read timestamps
    const readRows: any[] = await prisma.$queryRawUnsafe(
      `SELECT channel, lastReadAt FROM chat_channel_reads WHERE userId = ?`,
      user.id
    );
    const readMap = new Map<string, Date>();
    readRows.forEach((r) => {
      readMap.set(r.channel, new Date(r.lastReadAt));
    });

    // 2. Identify all channels the user can see
    const channelsToCheck = new Set<string>();
    channelsToCheck.add('general');

    if (isSuperAdmin) {
      const allDepts = await prisma.department.findMany({ select: { code: true } });
      allDepts.forEach((d) => channelsToCheck.add(`dept_${d.code.toLowerCase()}`));
    } else if (user.departmentCode) {
      channelsToCheck.add(`dept_${user.departmentCode.toLowerCase()}`);
    }

    // 3. Identify all DM channels involving this user
    const userDMs = await (prisma as any).chatMessage.findMany({
      where: {
        OR: [
          { userId: user.id },
          { recipientId: user.id },
          { channel: { contains: user.id } }
        ]
      },
      select: { channel: true },
      distinct: ['channel']
    });
    userDMs.forEach((m: any) => {
      if (m.channel.startsWith('dm_')) {
        channelsToCheck.add(m.channel);
      }
    });

    // 4. Default fallback: 7 days ago
    const fallbackDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const channelUnread: Record<string, number> = {};
    let totalUnread = 0;

    for (const ch of channelsToCheck) {
      const lastRead = readMap.get(ch) || fallbackDate;
      const unread = await (prisma as any).chatMessage.count({
        where: {
          channel: ch,
          userId: { not: user.id },
          createdAt: { gt: lastRead }
        }
      });
      channelUnread[ch] = unread;
      totalUnread += unread;
    }

    res.json({
      totalUnread,
      channelUnread
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/chat/read ─────────────────────────────────────────────────────
// Marks a channel as read up to the current timestamp
router.post('/read', async (req, res, next) => {
  try {
    const user = req.user!;
    const { channel } = req.body;

    if (!channel || typeof channel !== 'string') {
      throw new AppError('Channel identifier is required', 400);
    }

    const nowIso = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `INSERT INTO chat_channel_reads (userId, channel, lastReadAt)
       VALUES (?, ?, ?)
       ON CONFLICT(userId, channel) DO UPDATE SET lastReadAt = excluded.lastReadAt`,
      user.id,
      channel,
      nowIso
    );

    res.json({ success: true, channel, readAt: nowIso });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/chat/channels ──────────────────────────────────────────────────
// Returns accessible channels based on user role and department
router.get('/channels', async (req, res, next) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';

    // Fetch full user with department
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { department: true }
    });

    // Fetch all departments
    const departments = await prisma.department.findMany({
      include: {
        _count: {
          select: { users: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Total user count for General chat
    const totalUsers = await prisma.user.count({ where: { isActive: true } });

    // 1. All-Member Company Channel
    const channels: any[] = [
      {
        id: 'general',
        name: 'general',
        label: 'General Team Chat',
        description: 'Company-wide discussion for all members and roles',
        type: 'COMPANY',
        memberCount: totalUsers,
        color: '#3b82f6',
        isGeneral: true,
      }
    ];

    // 2. Department Channels
    for (const dept of departments) {
      const deptChannelId = `dept_${dept.code.toLowerCase()}`;
      const isUserDept = dbUser?.departmentId === dept.id;

      // Super Admin sees ALL team channels. Regular employees see ONLY their assigned department.
      if (isSuperAdmin || isUserDept) {
        let label = `${dept.name} Team`;
        let description = `Exclusive chat for ${dept.name} members`;

        if (dept.code === 'FDE') {
          label = 'FDE & Engineering';
          description = 'Field Engineers & Tech Ops team chat';
        } else if (dept.code === 'SAL') {
          label = 'Sales Team';
          description = 'Deals, customer relations & leads chat';
        } else if (dept.code === 'MKT') {
          label = 'Marketing Team';
          description = 'Campaigns, brand strategy & growth chat';
        }

        channels.push({
          id: deptChannelId,
          name: dept.code.toLowerCase(),
          label,
          description,
          type: 'DEPARTMENT',
          departmentId: dept.id,
          departmentCode: dept.code,
          memberCount: dept._count.users,
          color: dept.color || '#6366f1',
          isUserDepartment: isUserDept,
        });
      }
    }

    res.json({
      channels,
      userDepartmentId: dbUser?.departmentId,
      userDepartmentCode: dbUser?.department?.code,
      isSuperAdmin,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/chat/users ─────────────────────────────────────────────────────
// Returns list of organization users to start 1-on-1 direct chats
router.get('/users', async (req, res, next) => {
  try {
    const currentUserId = req.user!.id;

    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        title: true,
        role: { select: { name: true } },
        department: { select: { id: true, name: true, code: true, color: true } },
        lastLoginAt: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json(users);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/chat/dms ───────────────────────────────────────────────────────
// Returns existing 1-on-1 direct message conversations
router.get('/dms', async (req, res, next) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';
    const auditMode = req.query.audit === 'true' && isSuperAdmin;

    // Find messages that belong to DMs
    let dmCondition: any;
    if (auditMode) {
      dmCondition = {
        channel: { startsWith: 'dm_' }
      };
    } else {
      dmCondition = {
        channel: { startsWith: 'dm_' },
        OR: [
          { userId: user.id },
          { recipientId: user.id },
          { channel: { contains: user.id } }
        ]
      };
    }

    const messages = await (prisma as any).chatMessage.findMany({
      where: dmCondition,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            title: true,
            role: { select: { name: true } },
            department: { select: { id: true, name: true, code: true, color: true } }
          }
        },
        recipient: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            title: true,
            role: { select: { name: true } },
            department: { select: { id: true, name: true, code: true, color: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    // Group by channel to find the last message and other participant
    const dmsMap = new Map<string, any>();

    for (const msg of messages) {
      if (!dmsMap.has(msg.channel)) {
        const parts = msg.channel.replace('dm_', '').split('_');
        const otherUserId = parts[0] === user.id ? parts[1] : parts[0];

        // Determine other participant
        let otherUser = msg.userId === user.id ? msg.recipient : msg.user;
        if (!otherUser && otherUserId) {
          otherUser = await prisma.user.findUnique({
            where: { id: otherUserId },
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              title: true,
              role: { select: { name: true } },
              department: { select: { id: true, name: true, code: true, color: true } }
            }
          });
        }

        if (otherUser) {
          dmsMap.set(msg.channel, {
            channel: msg.channel,
            otherUser,
            lastMessage: {
              id: msg.id,
              content: msg.content,
              mediaType: msg.mediaType,
              createdAt: msg.createdAt,
              senderId: msg.userId,
            }
          });
        }
      }
    }

    res.json(Array.from(dmsMap.values()));
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/chat/messages ──────────────────────────────────────────────────
router.get('/messages', async (req, res, next) => {
  try {
    const user = req.user!;
    const channel = (req.query.channel as string) || 'general';
    const limit = parseInt((req.query.limit as string) || '150');

    // Verify channel permission
    await verifyChannelAccess(user, channel);

    const messages = await (prisma as any).chatMessage.findMany({
      where: { channel },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            title: true,
            role: { select: { name: true } },
            department: { select: { id: true, name: true, code: true, color: true } }
          }
        },
        recipient: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            title: true,
          }
        }
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/chat/messages ─────────────────────────────────────────────────
router.post('/messages', async (req, res, next) => {
  try {
    const user = req.user!;
    let { 
      content = '', 
      channel = 'general', 
      recipientId, 
      mediaUrl, 
      mediaType, 
      mediaName, 
      mediaSize, 
      mediaDuration 
    } = req.body;

    // Normalize direct messages channel if recipientId is supplied
    if (recipientId) {
      channel = `dm_${[user.id, recipientId].sort().join('_')}`;
    }

    // Verify channel access
    await verifyChannelAccess(user, channel);

    // Validation: must have either text content or media
    if ((!content || !content.trim()) && !mediaUrl) {
      throw new AppError('Message cannot be empty. Please provide text or media.', 400);
    }

    // Create the message in database
    const newMessage = await (prisma as any).chatMessage.create({
      data: {
        userId: user.id,
        recipientId: recipientId || null,
        content: (content || '').trim(),
        channel,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        mediaName: mediaName || null,
        mediaSize: mediaSize ? parseInt(mediaSize) : null,
        mediaDuration: mediaDuration ? parseFloat(mediaDuration) : null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            title: true,
            role: { select: { name: true } },
            department: { select: { id: true, name: true, code: true, color: true } }
          }
        },
        recipient: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            title: true,
          }
        }
      }
    });

    // Targeted real-time broadcast:
    // 1. General chat -> Broadcast to all connected clients
    if (channel === 'general') {
      broadcast({
        type: WSEventTypes.CHAT_MESSAGE_SENT,
        payload: newMessage,
      });
    }
    // 2. Department chat -> Broadcast to that department members + Super Admins
    else if (channel.startsWith('dept_')) {
      const deptCode = channel.replace('dept_', '').toUpperCase();
      const targetDept = await prisma.department.findFirst({ where: { code: deptCode } });

      broadcast({
        type: WSEventTypes.CHAT_MESSAGE_SENT,
        payload: newMessage,
      }, (client) => {
        return Boolean(client.roleName === 'SUPER_ADMIN' || (targetDept && client.departmentId === targetDept.id));
      });
    }
    // 3. 1-on-1 Direct Message -> Broadcast to sender, recipient, and Super Admins
    else if (channel.startsWith('dm_')) {
      const [u1, u2] = channel.replace('dm_', '').split('_');
      broadcast({
        type: WSEventTypes.CHAT_MESSAGE_SENT,
        payload: newMessage,
      }, (client) => {
        return client.roleName === 'SUPER_ADMIN' || client.userId === u1 || client.userId === u2;
      });
    }
    // 4. Default broadcast
    else {
      broadcast({
        type: WSEventTypes.CHAT_MESSAGE_SENT,
        payload: newMessage,
      });
    }

    // ─── Process @ mentions & notifications ──────────────────────────────────
    if (content && typeof content === 'string') {
      try {
        const text = content;
        let channelDisplayName = 'general';
        if (channel.startsWith('dept_')) {
          channelDisplayName = channel.replace('dept_', '').toUpperCase() + ' Team';
        } else if (channel === 'general') {
          channelDisplayName = 'General Team';
        }

        const isEveryoneMentioned = text.includes('@everyone');

        // Fetch active organization users
        const allActiveUsers = await prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true, departmentId: true, role: { select: { name: true } } }
        });

        const mentionedUserIds = new Set<string>();

        if (isEveryoneMentioned) {
          if (channel === 'general') {
            allActiveUsers.forEach((u: any) => {
              if (u.id !== user.id) mentionedUserIds.add(u.id);
            });
          } else if (channel.startsWith('dept_')) {
            const deptCode = channel.replace('dept_', '').toUpperCase();
            const targetDept = await prisma.department.findFirst({ where: { code: deptCode } });
            allActiveUsers.forEach((u: any) => {
              if (u.id !== user.id && (u.role.name === 'SUPER_ADMIN' || (targetDept && u.departmentId === targetDept.id))) {
                mentionedUserIds.add(u.id);
              }
            });
          } else if (channel.startsWith('dm_') && recipientId) {
            mentionedUserIds.add(recipientId);
          }
        }

        // Check individual user mentions: @FirstName or @Full Name
        allActiveUsers.forEach((u: any) => {
          if (u.id === user.id) return;
          const firstName = u.name.split(' ')[0];
          if (text.includes(`@${u.name}`) || (firstName && text.includes(`@${firstName}`))) {
            if (channel === 'general') {
              mentionedUserIds.add(u.id);
            } else if (channel.startsWith('dept_')) {
              if (u.role.name === 'SUPER_ADMIN' || u.departmentId) {
                mentionedUserIds.add(u.id);
              }
            } else if (channel.startsWith('dm_') && recipientId === u.id) {
              mentionedUserIds.add(u.id);
            }
          }
        });

        // Create notifications for all identified recipients
        for (const targetUserId of mentionedUserIds) {
          const isEveryone = isEveryoneMentioned && !text.includes(`@${allActiveUsers.find((u: any) => u.id === targetUserId)?.name}`);
          const mentionTitle = isEveryone 
            ? `@everyone tagged by ${user.name} in #${channelDisplayName}` 
            : `${user.name} mentioned you in #${channelDisplayName}`;

          await createNotification({
            userId: targetUserId,
            type: 'CHAT_MENTION',
            title: mentionTitle,
            message: text.length > 100 ? text.slice(0, 100) + '...' : text,
            actionUrl: '/chat',
            metadata: {
              channel,
              messageId: newMessage.id,
              senderId: user.id,
              senderName: user.name,
              isEveryone
            }
          });
        }
      } catch (notifErr) {
        console.error('[CHAT] Error creating mention notifications:', notifErr);
      }
    }

    res.status(201).json(newMessage);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /api/chat/messages/:id ───────────────────────────────────────────
router.delete('/messages/:id', async (req, res, next) => {
  try {
    const user = req.user!;
    const messageId = req.params.id;

    const existing = await (prisma as any).chatMessage.findUnique({
      where: { id: messageId }
    });

    if (!existing) {
      throw new AppError('Message not found', 404);
    }

    const isAuthor = existing.userId === user.id;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';

    if (!isAuthor && !isSuperAdmin) {
      throw new AppError('You are not authorized to delete this message', 403);
    }

    // Only Super Admin can delete anytime. For message author, must be within 10 minutes of sending
    if (!isSuperAdmin && isAuthor) {
      const messageAgeMs = Date.now() - new Date(existing.createdAt).getTime();
      const tenMinutesMs = 10 * 60 * 1000;
      if (messageAgeMs > tenMinutesMs) {
        throw new AppError('Messages can only be deleted within 10 minutes of sending', 403);
      }
    }

    await (prisma as any).chatMessage.delete({
      where: { id: messageId }
    });

    broadcast({
      type: WSEventTypes.CHAT_MESSAGE_DELETED,
      payload: { id: messageId, channel: existing.channel }
    });

    res.json({ message: 'Message deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
