const express = require('express');
const http = require('http');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const DATA_FILE = path.join(__dirname, 'data.json');
const JWT_SECRET = 'promarket_pro_max_2024';
const PORT = 3000;

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// --- База данных ---
let DB = {
    USERS: [],
    ORDERS: [],
    NOTIFICATIONS: [],
    PORTFOLIO: [],
    REVIEWS: [],
    PROMOS: [],
    COMPLAINTS: []          // новая коллекция
};

// --- Генерация тестовых данных (если файл отсутствует) ---
function generateData() {
    const categories = [
        { name: 'Ремонт', icon: 'fa-hammer' },
        { name: 'Уборка', icon: 'fa-broom' },
        { name: 'IT', icon: 'fa-laptop-code' },
        { name: 'Красота', icon: 'fa-magic' },
        { name: 'Переезды', icon: 'fa-truck' }
    ];
    const names = ['Александр', 'Дмитрий', 'Игорь', 'Михаил', 'Сергей', 'Андрей', 'Артем', 'Николай'];
    const surnames = ['Иванов', 'Петров', 'Смирнов', 'Васильев', 'Кузнецов', 'Попов', 'Соколов', 'Лебедев'];

    const descOptions = [
        'Профессиональный подход к делу, стаж работы более 5 лет. Гарантия качества.',
        'Работаю быстро и аккуратно, опыт 10 лет. Использую профессиональное оборудование.',
        'Выполняю заказы любой сложности. Много положительных отзывов.',
        'Стаж 8 лет, индивидуальный подход к каждому клиенту. Есть портфолио.',
        'Работаю с гарантией, использую только качественные материалы.',
        'Молодой специалист, но с большим опытом. Беру недорого.',
        'Профессионал своего дела. Выезд по городу бесплатный.'
    ];

    for (let i = 0; i < 100; i++) {
        const cat = categories[i % categories.length];
        const rawPrice = Math.floor(Math.random() * 4000) + 500;
        const desc = descOptions[Math.floor(Math.random() * descOptions.length)];

        DB.USERS.push({
            id: `pro_${i}`,
            role: 'pro',
            name: `${names[i % names.length]} ${surnames[Math.floor(Math.random() * surnames.length)]}`,
            email: `pro${i}@example.com`,
            phone: `+7${Math.floor(Math.random() * 1000000000)}`,
            category: cat.name,
            icon: cat.icon,
            price: Math.round(rawPrice / 100) * 100,
            rating: +(Math.random() * (5 - 4.2) + 4.2).toFixed(1),
            ratingCount: Math.floor(Math.random() * 50) + 5,
            desc: desc,
            location: {
                lat: 55.75 + (Math.random() - 0.5) * 0.3,
                lng: 37.61 + (Math.random() - 0.5) * 0.3
            },
            verified: Math.random() > 0.3,
            completedJobs: Math.floor(Math.random() * 50) + 5,
            favorites: []
        });
    }

    // Тестовые промокоды
    DB.PROMOS = [
        { id: 'promo1', code: 'WELCOME10', discount: 10, expires: '2025-12-31', active: true },
        { id: 'promo2', code: 'SUMMER20', discount: 20, expires: '2024-09-01', active: true }
    ];
}

if (fs.existsSync(DATA_FILE)) {
    DB = JSON.parse(fs.readFileSync(DATA_FILE));
} else {
    generateData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
}

// --- Автоматическое создание администратора, если его нет ---
const adminExists = DB.USERS.some(u => u.role === 'admin');
if (!adminExists) {
    const admin = {
        id: 'admin_' + Date.now(),
        name: 'Администратор',
        email: 'admin@example.com',
        role: 'admin',
        passwordHash: bcrypt.hashSync('admin', 8),
        favorites: []
    };
    DB.USERS.push(admin);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    console.log('✅ Администратор создан: admin@example.com / admin');
}

// --- Middleware аутентификации ---
const auth = (req, res, next) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ msg: 'Need Auth' });
    }
};

// --- Middleware для администратора ---
const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Forbidden' });
    }
    next();
};

// --- Middleware для мастера ---
const isPro = (req, res, next) => {
    if (req.user.role !== 'pro') {
        return res.status(403).json({ msg: 'Только для мастеров' });
    }
    next();
};

// --- Публичные маршруты ---
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    let user = DB.USERS.find(u => u.email === email);
    if (!user) {
        user = {
            id: 'u' + Date.now(),
            name: email.split('@')[0],
            email,
            role: 'client',
            passwordHash: bcrypt.hashSync(password, 8),
            favorites: []
        };
        DB.USERS.push(user);
        fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    } else {
        if (user.role === 'admin' && password === 'admin') {
            // bypass
        } else if (user.passwordHash && !bcrypt.compareSync(password, user.passwordHash)) {
            return res.status(401).json({ msg: 'Неверный пароль' });
        }
    }
    const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, JWT_SECRET);
    res.json({ token, user: { id: user.id, name: user.name, role: user.role, email: user.email } });
});

app.get('/api/pros', (req, res) => {
    let list = DB.USERS.filter(u => u.role === 'pro');
    const { cat, maxPrice, minRating, search, verified } = req.query;
    if (cat) list = list.filter(u => u.category === cat);
    if (maxPrice > 0) list = list.filter(u => u.price <= +maxPrice);
    if (minRating) list = list.filter(u => u.rating >= +minRating);
    if (search) list = list.filter(u => u.name.toLowerCase().includes(search.toLowerCase()));
    if (verified === 'true') list = list.filter(u => u.verified);
    res.json(list);
});

app.get('/api/portfolio/:proId', (req, res) => {
    const portfolio = DB.PORTFOLIO.filter(p => p.proId === req.params.proId);
    res.json(portfolio);
});

app.get('/api/reviews/:proId', (req, res) => {
    const reviews = DB.REVIEWS.filter(r => r.toUserId === req.params.proId)
        .map(r => ({
            ...r,
            client: DB.USERS.find(u => u.id === r.fromUserId)?.name || 'Аноним'
        }));
    res.json(reviews);
});

// --- Защищённые маршруты ---
app.post('/api/favorites/:proId', auth, (req, res) => {
    const user = DB.USERS.find(u => u.id === req.user.id);
    if (!user.favorites) user.favorites = [];
    const idx = user.favorites.indexOf(req.params.proId);
    if (idx === -1) user.favorites.push(req.params.proId);
    else user.favorites.splice(idx, 1);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json({ favorites: user.favorites });
});

app.post('/api/orders', auth, (req, res) => {
    const order = {
        ...req.body,
        id: 'ord' + Date.now(),
        clientId: req.user.id,
        status: 'В процессе',
        createdAt: new Date().toISOString(),
        paymentStatus: 'pending'
    };
    DB.ORDERS.push(order);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));

    if (!DB.NOTIFICATIONS) DB.NOTIFICATIONS = [];
    DB.NOTIFICATIONS.push({
        id: 'notif' + Date.now(),
        userId: order.proId,
        type: 'new_order',
        data: { orderId: order.id, clientName: req.user.name },
        read: false,
        createdAt: new Date().toISOString()
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json(order);
});

app.post('/api/orders/:id/complete', auth, (req, res) => {
    const { success, rating, review, cancelReason } = req.body;
    const order = DB.ORDERS.find(o => o.id === req.params.id);
    if (!order) return res.status(404).json({ msg: 'Заказ не найден' });

    order.status = success ? 'Выполнен' : 'Отменен';
    if (!success) order.cancelReason = cancelReason;

    const pro = DB.USERS.find(u => u.id === order.proId);
    if (pro && success && rating) {
        const currentTotal = pro.rating * pro.ratingCount;
        pro.ratingCount++;
        pro.rating = +((currentTotal + rating) / pro.ratingCount).toFixed(1);
        pro.completedJobs = (pro.completedJobs || 0) + 1;
    }

    if (!DB.NOTIFICATIONS) DB.NOTIFICATIONS = [];
    const notifId = 'notif' + Date.now();
    DB.NOTIFICATIONS.push({
        id: notifId,
        userId: order.proId,
        type: success ? 'order_completed' : 'order_cancelled',
        data: { orderId: order.id, rating, review, reason: cancelReason },
        read: false,
        createdAt: new Date().toISOString()
    });
    if (order.clientId !== order.proId) {
        DB.NOTIFICATIONS.push({
            id: notifId + '_client',
            userId: order.clientId,
            type: success ? 'order_completed_client' : 'order_cancelled_client',
            data: { orderId: order.id, reason: cancelReason },
            read: false,
            createdAt: new Date().toISOString()
        });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json({ success: true });
});

app.get('/api/my-orders', auth, (req, res) => {
    const orders = DB.ORDERS.filter(o => o.clientId === req.user.id)
        .map(order => ({
            ...order,
            reviewGiven: DB.REVIEWS.some(r => r.orderId === order.id)
        }));
    res.json(orders);
});

// --- Уведомления ---
app.get('/api/notifications', auth, (req, res) => {
    const notifs = (DB.NOTIFICATIONS || []).filter(n => n.userId === req.user.id && !n.read);
    res.json(notifs);
});

app.post('/api/notifications/:id/read', auth, (req, res) => {
    const notif = DB.NOTIFICATIONS.find(n => n.id === req.params.id);
    if (notif && notif.userId === req.user.id) {
        notif.read = true;
        fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
        res.json({ success: true });
    } else {
        res.status(404).json({ msg: 'Not found' });
    }
});

// --- Портфолио (мастер) ---
const upload = multer({ dest: 'uploads/' });
app.post('/api/portfolio', auth, isPro, upload.array('photos', 10), (req, res) => {
    const { title, description } = req.body;
    const photos = req.files ? req.files.map(f => f.filename) : [];
    const newItem = {
        id: 'port_' + Date.now(),
        proId: req.user.id,
        title,
        description,
        photos,
        createdAt: new Date().toISOString()
    };
    DB.PORTFOLIO.push(newItem);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json(newItem);
});

app.delete('/api/portfolio/:id', auth, isPro, (req, res) => {
    const item = DB.PORTFOLIO.find(p => p.id === req.params.id);
    if (!item) return res.status(404).json({ msg: 'Не найдено' });
    if (item.proId !== req.user.id) return res.status(403).json({ msg: 'Нет доступа' });
    DB.PORTFOLIO = DB.PORTFOLIO.filter(p => p.id !== req.params.id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json({ success: true });
});

// --- Отзывы (без фото) ---
app.post('/api/reviews', auth, (req, res) => {
    const { orderId, rating, text } = req.body;
    const order = DB.ORDERS.find(o => o.id === orderId);
    if (!order) return res.status(404).json({ msg: 'Заказ не найден' });
    if (order.clientId !== req.user.id) return res.status(403).json({ msg: 'Это не ваш заказ' });
    if (order.status !== 'Выполнен') return res.status(400).json({ msg: 'Заказ ещё не выполнен' });

    const existing = DB.REVIEWS.find(r => r.orderId === orderId);
    if (existing) return res.status(400).json({ msg: 'Отзыв уже оставлен' });

    const newReview = {
        id: 'rev_' + Date.now(),
        orderId,
        fromUserId: req.user.id,
        toUserId: order.proId,
        rating,
        text,
        reply: null,
        createdAt: new Date().toISOString(),
        moderated: false
    };
    DB.REVIEWS.push(newReview);

    if (!DB.NOTIFICATIONS) DB.NOTIFICATIONS = [];
    DB.NOTIFICATIONS.push({
        id: 'notif' + Date.now() + '_review',
        userId: order.proId,
        type: 'new_review',
        data: { orderId: order.id, rating, text },
        read: false,
        createdAt: new Date().toISOString()
    });

    const pro = DB.USERS.find(u => u.id === order.proId);
    if (pro) {
        pro.ratingCount = (pro.ratingCount || 0) + 1;
        pro.rating = ((pro.rating || 0) * (pro.ratingCount - 1) + rating) / pro.ratingCount;
        pro.rating = +pro.rating.toFixed(1);
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json(newReview);
});

app.post('/api/reviews/:id/reply', auth, (req, res) => {
    const review = DB.REVIEWS.find(r => r.id === req.params.id);
    if (!review) return res.status(404).json({ msg: 'Отзыв не найден' });
    if (review.toUserId !== req.user.id) return res.status(403).json({ msg: 'Это не ваш отзыв' });

    review.reply = req.body.reply;
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json(review);
});

// --- Промокоды (публичные) ---
app.get('/api/promos', (req, res) => {
    const active = DB.PROMOS.filter(p => p.active && new Date(p.expires) > new Date());
    res.json(active);
});

app.post('/api/apply-promo', auth, (req, res) => {
    const { code } = req.body;
    const promo = DB.PROMOS.find(p => p.code === code && p.active && new Date(p.expires) > new Date());
    if (promo) {
        res.json({ valid: true, discount: promo.discount, id: promo.id });
    } else {
        res.json({ valid: false, msg: 'Промокод не найден или истёк' });
    }
});

// --- Жалобы (новый функционал) ---
app.post('/api/complaints', auth, (req, res) => {
    const { targetType, targetId, reason, description } = req.body;
    if (!targetType || !targetId || !reason) {
        return res.status(400).json({ msg: 'Не все поля заполнены' });
    }
    const complaint = {
        id: 'cpl_' + Date.now(),
        fromUserId: req.user.id,
        targetType,
        targetId,
        reason,
        description: description || '',
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    if (!DB.COMPLAINTS) DB.COMPLAINTS = [];
    DB.COMPLAINTS.push(complaint);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json(complaint);
});

app.get('/api/admin/complaints', auth, isAdmin, (req, res) => {
    res.json(DB.COMPLAINTS || []);
});

app.put('/api/admin/complaints/:id', auth, isAdmin, (req, res) => {
    const { status } = req.body; // 'resolved', 'dismissed'
    const complaint = DB.COMPLAINTS.find(c => c.id === req.params.id);
    if (!complaint) return res.status(404).json({ msg: 'Not found' });
    complaint.status = status;
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json(complaint);
});

// --- Админ-панель ---
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API для администратора
app.get('/api/admin/users', auth, isAdmin, (req, res) => {
    const users = DB.USERS.map(({ passwordHash, ...rest }) => rest);
    res.json(users);
});

app.get('/api/admin/orders', auth, isAdmin, (req, res) => {
    res.json(DB.ORDERS);
});

app.delete('/api/admin/users/:id', auth, isAdmin, (req, res) => {
    const index = DB.USERS.findIndex(u => u.id === req.params.id);
    if (index === -1) return res.status(404).json({ msg: 'User not found' });
    DB.USERS.splice(index, 1);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json({ success: true });
});

app.put('/api/admin/users/:id', auth, isAdmin, (req, res) => {
    const user = DB.USERS.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });
    Object.assign(user, req.body);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json({ success: true });
});

// Промокоды (admin)
app.get('/api/admin/promos', auth, isAdmin, (req, res) => {
    res.json(DB.PROMOS || []);
});

app.post('/api/admin/promos', auth, isAdmin, (req, res) => {
    const promo = { id: 'promo_' + Date.now(), ...req.body };
    if (!DB.PROMOS) DB.PROMOS = [];
    DB.PROMOS.push(promo);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json(promo);
});

app.put('/api/admin/promos/:id', auth, isAdmin, (req, res) => {
    const promo = DB.PROMOS.find(p => p.id === req.params.id);
    if (!promo) return res.status(404).json({ msg: 'Promo not found' });
    Object.assign(promo, req.body);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json(promo);
});

app.delete('/api/admin/promos/:id', auth, isAdmin, (req, res) => {
    DB.PROMOS = (DB.PROMOS || []).filter(p => p.id !== req.params.id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json({ success: true });
});

// Отзывы (admin)
app.get('/api/admin/reviews', auth, isAdmin, (req, res) => {
    res.json(DB.REVIEWS || []);
});

app.put('/api/admin/reviews/:id', auth, isAdmin, (req, res) => {
    const review = DB.REVIEWS.find(r => r.id === req.params.id);
    if (!review) return res.status(404).json({ msg: 'Review not found' });
    Object.assign(review, req.body);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json(review);
});

app.delete('/api/admin/reviews/:id', auth, isAdmin, (req, res) => {
    DB.REVIEWS = (DB.REVIEWS || []).filter(r => r.id !== req.params.id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json({ success: true });
});

// Портфолио (admin)
app.get('/api/admin/portfolio', auth, isAdmin, (req, res) => {
    res.json(DB.PORTFOLIO || []);
});

app.delete('/api/admin/portfolio/:id', auth, isAdmin, (req, res) => {
    DB.PORTFOLIO = (DB.PORTFOLIO || []).filter(p => p.id !== req.params.id);
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json({ success: true });
});

// Отправка уведомлений (admin)
app.post('/api/admin/notify', auth, isAdmin, (req, res) => {
    const { role, message } = req.body;
    const users = DB.USERS.filter(u => u.role === role);
    if (!DB.NOTIFICATIONS) DB.NOTIFICATIONS = [];
    users.forEach(u => {
        DB.NOTIFICATIONS.push({
            id: 'notif_' + Date.now() + '_' + u.id,
            userId: u.id,
            type: 'admin',
            data: { text: message },
            read: false,
            createdAt: new Date().toISOString()
        });
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json({ success: true, count: users.length });
});

// --- Личный кабинет мастера ---
app.get('/pro-dashboard', auth, isPro, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pro-dashboard.html'));
});

app.get('/api/pro/stats', auth, isPro, (req, res) => {
    const proId = req.user.id;
    const pro = DB.USERS.find(u => u.id === proId);
    const orders = DB.ORDERS.filter(o => o.proId === proId);
    const completed = orders.filter(o => o.status === 'Выполнен').length;
    const totalEarned = orders.reduce((sum, o) => sum + (o.price || 0), 0);
    res.json({
        name: pro.name,
        rating: pro.rating,
        ratingCount: pro.ratingCount,
        completedJobs: pro.completedJobs || 0,
        totalOrders: orders.length,
        completed,
        totalEarned
    });
});

app.get('/api/pro/orders', auth, isPro, (req, res) => {
    const orders = DB.ORDERS.filter(o => o.proId === req.user.id);
    res.json(orders);
});

app.put('/api/pro/profile', auth, isPro, (req, res) => {
    const pro = DB.USERS.find(u => u.id === req.user.id);
    if (!pro) return res.status(404).json({ msg: 'Not found' });
    const { name, phone, desc, price, category } = req.body;
    if (name) pro.name = name;
    if (phone) pro.phone = phone;
    if (desc) pro.desc = desc;
    if (price) pro.price = price;
    if (category) pro.category = category;
    fs.writeFileSync(DATA_FILE, JSON.stringify(DB));
    res.json({ success: true });
});

// --- Отправка HTML-страницы ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => console.log(`PROMarket Pro запущен на http://localhost:${PORT}`));