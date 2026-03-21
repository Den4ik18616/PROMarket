// client.js – финальная версия с мобильной адаптацией (карточки-превью)
// Добавлен обработчик resize, клик по карточке открывает детали

let map, markersLayer;
let token = localStorage.getItem('token');
let currentPro = null;
let currentOrderId = null;
let favorites = JSON.parse(localStorage.getItem('favs') || '[]');
let currentRating = 0;
let ws = null;
let pros = [];
let userLocation = null;
let currentRatingComplete = 0;
let selectedForCompare = JSON.parse(localStorage.getItem('compare') || '[]');

const cancelReasons = [
    'Передумал',
    'Не устроила цена',
    'Мастер не вышел на связь',
    'Нашёл другого',
    'Другое'
];

if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
        userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        getPros();
    }, err => console.log('Геолокация не доступна', err));
}

particlesJS('particles-js', {
    particles: {
        number: { value: 30, density: { enable: true, value_area: 800 } },
        color: { value: '#8b5cf6' },
        shape: { type: 'circle' },
        opacity: { value: 0.3, random: true },
        size: { value: 3, random: true },
        line_linked: { enable: false },
        move: { enable: true, speed: 1, direction: 'none', random: true }
    },
    interactivity: {
        detect_on: 'canvas',
        events: { onhover: { enable: true, mode: 'repulse' } }
    }
});

function initMap() {
    map = L.map('map').setView([55.75, 37.61], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '',
        maxZoom: 19
    }).addTo(map);
    markersLayer = L.markerClusterGroup({
        disableClusteringAtZoom: 15,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true
    });
    map.addLayer(markersLayer);
}
initMap();

function addMarkersToMap(pros) {
    markersLayer.clearLayers();
    pros.forEach(p => {
        const marker = L.marker([p.location.lat, p.location.lng], {
            icon: L.divIcon({
                className: 'custom-marker',
                html: `<div style="background-color:var(--primary); width:16px; height:16px; border-radius:50%; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
                iconSize: [20, 20],
                popupAnchor: [0, -10]
            })
        }).bindPopup(`<b>${p.name}</b><br>${p.price} ₽/час`);
        markersLayer.addLayer(marker);
    });
}

function animateCardIn(card, delay = 0) {
    gsap.fromTo(card,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, delay: delay, ease: 'power2.out', onComplete: () => card.classList.add('visible') }
    );
}

function animateViewChange(oldView, newView) {
    gsap.to(oldView, { opacity: 0, x: -20, duration: 0.3, onComplete: () => {
        oldView.classList.add('hidden');
        newView.classList.remove('hidden');
        gsap.fromTo(newView, { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.3 });
    }});
}

window.addEventListener('scroll', () => {
    const mapEl = document.getElementById('map');
    if (mapEl) {
        mapEl.style.transform = `translateY(${window.scrollY * 0.2}px)`;
    }
});

function showMascot(message) {
    const mascot = document.createElement('div');
    mascot.className = 'mascot';
    mascot.innerHTML = '🦊<br>' + message;
    document.querySelector('.main').appendChild(mascot);
    setTimeout(() => mascot.remove(), 3000);
}

function debounce(func, wait) {
    let timeout;
    return function () {
        clearTimeout(timeout);
        timeout = setTimeout(func, wait);
    };
}

function showToast(text, type = 'info') {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerText = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function toggleFav(id, el) {
    if (favorites.includes(id)) {
        if (!confirm('Убрать из избранного?')) return;
        favorites = favorites.filter(f => f !== id);
    } else {
        favorites.push(id);
    }
    localStorage.setItem('favs', JSON.stringify(favorites));
    getPros();
    if (token) {
        fetch('/api/favorites/' + id, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        });
    }
    if (el) {
        el.classList.add('animate');
        setTimeout(() => el.classList.remove('animate'), 300);
    }
}

function toggleCompare(id, el) {
    const index = selectedForCompare.indexOf(id);
    if (index === -1) {
        selectedForCompare.push(id);
        if (el) el.classList.add('active');
    } else {
        selectedForCompare.splice(index, 1);
        if (el) el.classList.remove('active');
    }
    localStorage.setItem('compare', JSON.stringify(selectedForCompare));
}

function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function handleAuthAction() {
    if (token) {
        openProfile();
    } else {
        openModal('modal-auth');
    }
}

function openProfile() {
    const name = localStorage.getItem('uname') || '';
    const email = localStorage.getItem('email') || 'не указан';
    const role = localStorage.getItem('role') || 'client';
    const regDate = localStorage.getItem('regDate') || new Date().toLocaleDateString();
    const favsCount = favorites.length;
    const avatarInitial = name.charAt(0).toUpperCase() || 'U';

    const statsHtml = `
        <div class="profile-stats">
            <div class="stat-box">
                <div class="value">${favsCount}</div>
                <div class="label">Избранное</div>
            </div>
            <div class="stat-box" id="profile-orders-stat">
                <div class="value">0</div>
                <div class="label">Заказы</div>
            </div>
            <div class="stat-box">
                <div class="value">${localStorage.getItem('reviewsCount') || '0'}</div>
                <div class="label">Отзывы</div>
            </div>
        </div>
    `;

    const profileHtml = `
        <div class="profile-avatar" id="profile-avatar">${avatarInitial}</div>
        ${statsHtml}
        <div class="profile-detail">
            <i class="fas fa-user"></i>
            <strong>Имя:</strong> <span id="profile-name">${name}</span>
        </div>
        <div class="profile-detail">
            <i class="fas fa-envelope"></i>
            <strong>Email:</strong> <span id="profile-email">${email}</span>
        </div>
        <div class="profile-detail">
            <i class="fas fa-tag"></i>
            <strong>Роль:</strong> <span id="profile-role">${role}</span>
        </div>
        <div class="profile-detail">
            <i class="fas fa-calendar-alt"></i>
            <strong>Регистрация:</strong> <span id="profile-reg">${regDate}</span>
        </div>
        <div class="profile-detail">
            <i class="fas fa-heart"></i>
            <strong>Избранное:</strong> <span id="profile-favs">${favsCount}</span>
        </div>
        <div class="profile-detail">
            <i class="fas fa-shopping-bag"></i>
            <strong>Заказов:</strong> <span id="profile-orders">0</span>
        </div>
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
            <button class="btn btn-danger" onclick="logout()">Выйти</button>
            <button class="btn btn-outline" onclick="closeModal('modal-profile')">Закрыть</button>
        </div>
    `;

    const profileInfo = document.getElementById('profile-info');
    if (profileInfo) {
        profileInfo.innerHTML = profileHtml;
    }

    fetch('/api/my-orders', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(res => res.json())
        .then(orders => {
            const ordersCount = orders.length;
            document.getElementById('profile-orders').innerText = ordersCount;
            const ordersStat = document.getElementById('profile-orders-stat');
            if (ordersStat) ordersStat.querySelector('.value').innerText = ordersCount;
        })
        .catch(() => {
            document.getElementById('profile-orders').innerText = '0';
            const ordersStat = document.getElementById('profile-orders-stat');
            if (ordersStat) ordersStat.querySelector('.value').innerText = '0';
        });

    openModal('modal-profile');
}

function logout() {
    if (confirm('Выйти из аккаунта?')) {
        localStorage.clear();
        location.reload();
    }
}

async function doLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('uname', data.user.name);
        localStorage.setItem('userId', data.user.id);
        localStorage.setItem('role', data.user.role);
        localStorage.setItem('email', data.user.email);
        localStorage.setItem('regDate', new Date().toLocaleDateString());
        location.reload();
    } else {
        showToast('Ошибка входа', 'error');
    }
}

function resetFilters() {
    document.getElementById('f-cat').value = '';
    document.getElementById('f-price').value = '';
    document.getElementById('f-rate').value = '0';
    document.getElementById('f-verified').checked = false;
    document.getElementById('f-favorites').checked = false;
    document.getElementById('f-sort').value = 'default';
    document.getElementById('main-search').value = '';
    getPros();
}

async function getPros() {
    const loader = document.getElementById('pros-loader');
    if (loader) loader.classList.remove('hidden');

    const cat = document.getElementById('f-cat').value;
    const price = document.getElementById('f-price').value;
    const rate = document.getElementById('f-rate').value;
    const search = document.getElementById('main-search').value;
    const verified = document.getElementById('f-verified').checked ? 'true' : '';
    const sortBy = document.getElementById('f-sort').value;

    let url = '/api/pros?cat=' + encodeURIComponent(cat) +
        '&maxPrice=' + encodeURIComponent(price) +
        '&minRating=' + encodeURIComponent(rate) +
        '&search=' + encodeURIComponent(search);
    if (verified) url += '&verified=true';

    const params = new URLSearchParams(window.location.search);
    params.set('cat', cat);
    params.set('maxPrice', price);
    params.set('minRating', rate);
    params.set('search', search);
    params.set('verified', verified);
    params.set('sort', sortBy);
    window.history.replaceState({}, '', '?' + params.toString());

    const res = await fetch(url);
    if (!res.ok) {
        showToast('Ошибка загрузки специалистов', 'error');
        if (loader) loader.classList.add('hidden');
        showMascot('Не удалось загрузить мастеров');
        return;
    }
    pros = await res.json();
    const list = document.getElementById('pros-list');
    markersLayer.clearLayers();

    if (document.getElementById('f-favorites') && document.getElementById('f-favorites').checked) {
        pros = pros.filter(p => favorites.includes(p.id));
    }

    if (sortBy === 'price_asc') pros.sort((a,b) => a.price - b.price);
    else if (sortBy === 'price_desc') pros.sort((a,b) => b.price - a.price);
    else if (sortBy === 'rating_desc') pros.sort((a,b) => b.rating - a.rating);
    else if (sortBy === 'distance_asc' && userLocation) {
        pros.sort((a,b) => {
            const distA = L.latLng(userLocation.lat, userLocation.lng).distanceTo(L.latLng(a.location.lat, a.location.lng));
            const distB = L.latLng(userLocation.lat, userLocation.lng).distanceTo(L.latLng(b.location.lat, b.location.lng));
            return distA - distB;
        });
    }

    list.innerHTML = '';

    const isMobile = document.documentElement.classList.contains('mobile');

    if (pros.length === 0) {
        list.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:50px; color:#94a3b8;"><i class="fas fa-search fa-3x"></i><p>Никого не нашли...</p></div>';
        showMascot('Попробуйте изменить фильтры');
    } else {
        pros.forEach((p, idx) => {
            const isFav = favorites.includes(p.id);
            const verifiedBadge = p.verified ? '<i class="fas fa-check-circle verified-badge" title="Проверенный мастер"></i>' : '';
            const isSelected = selectedForCompare.includes(p.id);
            const avatar = '<div class="avatar">' + p.name.charAt(0) + '</div>';
            const safeName = p.name.replace(/'/g, "\\'");

            let cardHtml;
            if (isMobile) {
                // Мобильная версия: минималистичная карточка-превью
                cardHtml = `
                    <div class="card" data-pro-id="${p.id}">
                        <div class="card-header">
                            ${avatar}
                            <div style="flex:1">
                                <h3>${p.name} ${verifiedBadge}</h3>
                                <div class="rating">⭐ ${p.rating} <span style="color:var(--text-muted)">(${p.ratingCount} отзывов)</span></div>
                            </div>
                            <div style="display:flex; gap:6px;">
                                <input type="checkbox" class="compare-checkbox" data-id="${p.id}" ${isSelected ? 'checked' : ''} onchange="toggleCompare('${p.id}', this)" title="Выбрать для сравнения">
                                <i class="fa${isFav ? 's' : 'r'} fa-heart fav-btn ${isFav ? 'active' : ''}" onclick="toggleFav('${p.id}', this)" title="${isFav ? 'Убрать из избранного' : 'Добавить в избранное'}"></i>
                            </div>
                        </div>
                        <div class="price">${p.price} <span>₽/час</span></div>
                        <button class="btn btn-primary" onclick="event.stopPropagation(); openBooking('${p.id}', '${safeName}', ${p.price})">Заказать услугу</button>
                    </div>
                `;
            } else {
                // Десктопная версия: полная карточка
                let distanceHtml = '';
                if (userLocation) {
                    const from = L.latLng(userLocation.lat, userLocation.lng);
                    const to = L.latLng(p.location.lat, p.location.lng);
                    const distKm = from.distanceTo(to) / 1000;
                    distanceHtml = '<div class="distanceHtml" style="font-size:0.8rem; color:var(--text-muted); margin-top:5px">🚗 ' + distKm.toFixed(1) + ' км</div>';
                }

                cardHtml = `
                    <div class="card">
                        <div class="card-header">
                            ${avatar}
                            <span class="category-tag"><i class="fas ${p.icon}"></i> ${p.category}</span>
                            <div style="display:flex; gap:5px;">
                                <input type="checkbox" class="compare-checkbox" data-id="${p.id}" ${isSelected ? 'checked' : ''} onchange="toggleCompare('${p.id}', this)" title="Выбрать для сравнения">
                                <i class="fa${isFav ? 's' : 'r'} fa-heart fav-btn ${isFav ? 'active' : ''}" onclick="toggleFav('${p.id}', this)" title="${isFav ? 'Убрать из избранного' : 'Добавить в избранное'}"></i>
                                <i class="fas fa-share-alt" onclick="sharePro('${p.id}', '${safeName}')" style="cursor:pointer; color:var(--text-muted);" title="Поделиться"></i>
                                <i class="fas fa-compass compass-icon" onclick="centerMap(${p.location.lat}, ${p.location.lng})" title="Показать на карте"></i>
                            </div>
                        </div>
                        <h3 style="margin:0 0 5px 0; cursor: pointer;" onclick="showMasterProfile('${p.id}')">${p.name} ${verifiedBadge}</h3>
                        <div class="rating">⭐ ${p.rating} <span style="color:var(--text-muted)">(${p.ratingCount} отзывов)</span></div>
                        <p style="font-size:0.85rem; color:var(--text-muted); margin:15px 0">${p.desc}</p>
                        ${distanceHtml}
                        <div class="price">${p.price} <span>₽/час</span></div>
                        <button class="btn btn-primary" onclick="openBooking('${p.id}', '${safeName}', ${p.price})">Заказать услугу</button>
                        <button class="btn btn-outline" style="margin-top:10px" onclick="showToast('Чат с мастером в разработке', 'info')" title="Пока в разработке">Чат с мастером</button>
                        <button class="btn btn-outline btn-sm" style="margin-top:5px;" onclick="openComplaintModal('pro', '${p.id}')"><i class="fas fa-flag"></i> Пожаловаться</button>
                    </div>
                `;
            }

            const cardDiv = document.createElement('div');
            cardDiv.innerHTML = cardHtml.trim();
            const card = cardDiv.firstChild;
            card.style.animationDelay = idx * 0.05 + 's';

            if (isMobile) {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('.btn, .fav-btn, .compare-checkbox')) return;
                    showMasterProfile(p.id);
                });
            }

            list.appendChild(card);
        });
    }

    addMarkersToMap(pros);
    document.querySelectorAll('.card').forEach((card, i) => animateCardIn(card, i * 0.05));

    if (loader) loader.classList.add('hidden');
    showRecommendations();
}

function showMasterProfile(proId) {
    const master = pros.find(p => p.id === proId);
    if (!master) return;
    localStorage.setItem('lastCategory', master.category);
    const isAdmin = localStorage.getItem('role') === 'admin';
    let html = `
        <div style="text-align: center;">
            <div class="avatar" style="width:80px; height:80px; font-size:2rem; margin:0 auto 15px;">${master.name.charAt(0)}</div>
            <h3>${master.name}</h3>
            <p>${master.category}</p>
        </div>
        <div style="margin-top:20px;">
            <p><i class="fas fa-star" style="color:gold;"></i> Рейтинг: ${master.rating} (${master.ratingCount} отзывов)</p>
            <p><i class="fas fa-check-circle" style="color:var(--success);"></i> Верифицирован: ${master.verified ? 'Да' : 'Нет'}</p>
            <p><i class="fas fa-briefcase"></i> Выполнено заказов: ${master.completedJobs || 0}</p>
            <p>${master.desc}</p>
        </div>
    `;
    fetch('/api/portfolio/' + proId)
        .then(res => res.json())
        .then(portfolio => {
            if (portfolio.length > 0) {
                html += '<h4>Портфолио</h4><div style="display:flex; flex-wrap:wrap; gap:10px;">';
                portfolio.forEach(item => {
                    html += `<div class="portfolio-item">${item.photos.map(p => `<img src="/uploads/${p}" style="width:80px; height:80px; object-fit:cover; border-radius:8px;">`).join('')}<br>${item.title}</div>`;
                });
                html += '</div>';
            }
            document.getElementById('master-profile-content').innerHTML = html;
        });
    if (isAdmin) {
        html += `
            <div style="display:flex; gap:10px; justify-content:center; margin-top:20px;">
                <button class="btn btn-warning" onclick="adminAction('verify', '${master.id}')">Верифицировать</button>
                <button class="btn btn-danger" onclick="adminAction('block', '${master.id}')">Заблокировать</button>
            </div>
        `;
    }
    html += `<button class="btn btn-outline" style="margin-top:10px;" onclick="openComplaintModal('pro', '${master.id}')"><i class="fas fa-flag"></i> Пожаловаться</button>`;
    document.getElementById('master-profile-content').innerHTML = html;
    openModal('modal-master-profile');
}

let currentComplaintTarget = null;
function openComplaintModal(targetType, targetId) {
    if (!token) { openModal('modal-auth'); return; }
    currentComplaintTarget = { targetType, targetId };
    document.getElementById('complaint-reason').value = 'spam';
    document.getElementById('complaint-desc').value = '';
    openModal('modal-complaint');
}

async function submitComplaint() {
    const reason = document.getElementById('complaint-reason').value;
    const description = document.getElementById('complaint-desc').value;
    if (!reason) { showToast('Выберите причину', 'error'); return; }
    const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
            targetType: currentComplaintTarget.targetType,
            targetId: currentComplaintTarget.targetId,
            reason,
            description
        })
    });
    if (res.ok) {
        showToast('Жалоба отправлена', 'success');
        closeModal('modal-complaint');
    } else {
        const err = await res.json();
        showToast(err.msg || 'Ошибка', 'error');
    }
}

function showRecommendations() {
    const lastCategory = localStorage.getItem('lastCategory');
    if (!lastCategory || pros.length === 0) return;
    const recommended = pros.filter(p => p.category === lastCategory && p.id !== currentPro?.id).slice(0, 3);
    if (recommended.length === 0) return;
    let html = '<div class="recommendations" style="margin-top:30px;"><h3>Вам может понравиться</h3><div class="grid">';
    recommended.forEach(p => {
        html += `<div class="card" style="padding:12px; cursor:pointer;" onclick="showMasterProfile('${p.id}')">
            <div class="avatar">${p.name.charAt(0)}</div>
            <h4>${p.name}</h4>
            <p>${p.category}</p>
            <p>⭐ ${p.rating}</p>
        </div>`;
    });
    html += '</div></div>';
    document.getElementById('pros-list').insertAdjacentHTML('beforeend', html);
}

function centerMap(lat, lng) {
    map.setView([lat, lng], 15);
    showToast('Карта центрирована на мастере', 'success');
}

function sharePro(id, name) {
    const url = window.location.origin + '/?pro=' + id;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Ссылка на мастера скопирована', 'success');
    }).catch(() => showToast('Не удалось скопировать', 'error'));
}

function openBooking(id, name, price) {
    if (!token) return openModal('modal-auth');
    currentPro = { id, name, price };
    document.getElementById('book-info').innerText = 'Выбор мастера: ' + name;
    document.getElementById('promo-message').innerText = '';
    document.getElementById('promo-code').value = '';

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    document.getElementById('book-date').value = today;
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    document.getElementById('book-time').value = hours + ':' + minutes;

    openModal('modal-booking');
}

async function applyPromo() {
    const code = document.getElementById('promo-code').value;
    const msgDiv = document.getElementById('promo-message');
    if (!code) {
        msgDiv.innerText = 'Введите промокод';
        return;
    }
    const res = await fetch('/api/apply-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (data.valid) {
        msgDiv.style.color = 'green';
        msgDiv.innerText = 'Промокод применён! Скидка ' + data.discount + '%';
        showToast('Промокод активирован', 'success');
    } else {
        msgDiv.style.color = 'red';
        msgDiv.innerText = data.msg || 'Недействительный промокод';
        showToast(data.msg || 'Недействительный промокод', 'error');
    }
}

async function confirmBooking() {
    const date = document.getElementById('book-date').value;
    const time = document.getElementById('book-time').value;
    const comment = document.getElementById('book-comment').value;
    if (!date || !time) {
        showToast('Укажите время визита', 'error');
        return;
    }

    const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({
            proId: currentPro.id,
            proName: currentPro.name,
            price: currentPro.price,
            date,
            time,
            comment
        })
    });
    if (res.ok) {
        closeModal('modal-booking');
        showToast('Заказ успешно оформлен! 🎉', 'success');
        showView('orders');
    } else {
        const err = await res.json();
        showToast(err.msg || 'Ошибка', 'error');
    }
}

function showView(v) {
    const oldView = document.querySelector('.view:not(.hidden)');
    const newView = document.getElementById(v === 'pros' ? 'view-pros' : 'view-orders');
    if (oldView && oldView.id !== newView.id) {
        animateViewChange(oldView, newView);
    } else {
        document.getElementById('view-pros').classList.toggle('hidden', v !== 'pros');
        document.getElementById('view-orders').classList.toggle('hidden', v !== 'orders');
    }
    document.getElementById('t-pros').classList.toggle('active', v === 'pros');
    document.getElementById('t-orders').classList.toggle('active', v === 'orders');
    window.location.hash = v;
    document.querySelector('.main').scrollTop = 0;
    if (v === 'orders') getOrders();
}

async function getOrders() {
    if (!token) {
        document.getElementById('orders-list').innerHTML = '<p>Войдите для просмотра истории</p>';
        return;
    }

    const loader = document.getElementById('orders-loader');
    if (loader) loader.classList.remove('hidden');

    try {
        const res = await fetch('/api/my-orders', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!res.ok) {
            throw new Error(`Ошибка ${res.status}`);
        }
        const orders = await res.json();
        const list = document.getElementById('orders-list');
        list.innerHTML = '';

        orders.reverse().forEach(o => {
            let actions = '';
            if (o.status === 'В процессе') {
                actions = '<button class="btn btn-outline" style="width:100%; margin-top:10px" onclick="openCompleteModal(\'' + o.id + '\')">Завершить</button>';
            }
            let statusColor = '';
            if (o.status === 'Выполнен') {
                statusColor = 'color: #10b981;';
            } else if (o.status === 'Отменен') {
                statusColor = 'color: #ef4444;';
            } else {
                statusColor = 'color: var(--primary);';
            }
            const cardHtml = '<div class="card visible">' +
                '<div style="font-size:0.7rem; font-weight:800; margin-bottom:10px; text-transform:uppercase; ' + statusColor + '">' + o.status + '</div>' +
                '<h3 style="margin:0">' + o.proName + '</h3>' +
                '<p style="font-size:0.85rem; color:var(--text-muted)">📅 ' + o.date + '</p>' +
                '<div class="price" style="font-size:1.4rem">' + o.price + ' <span>₽</span></div>' +
                actions +
                '</div>';
            list.innerHTML += cardHtml;
        });

        if (orders.length === 0) {
            list.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">У вас пока нет заказов</p>';
            showMascot('Заказов пока нет');
        }
    } catch (error) {
        showToast('Ошибка загрузки заказов: ' + error.message, 'error');
        console.error(error);
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

let lastNotifCount = 0;

async function fetchNotifications() {
    if (!token) return;
    try {
        const res = await fetch('/api/notifications', { headers: { 'Authorization': 'Bearer ' + token } });
        if (!res.ok) throw new Error('Ошибка загрузки');
        const notifs = await res.json();
        const count = notifs.length;
        
        const bellBadge = document.getElementById('notificationCount');
        if (bellBadge) {
            if (count > 0) {
                bellBadge.classList.remove('hidden');
                bellBadge.innerText = count;
            } else {
                bellBadge.classList.add('hidden');
            }
        }

        const hamburgerBadge = document.getElementById('hamburger-notif-count');
        if (hamburgerBadge) {
            if (count > 0) {
                hamburgerBadge.classList.remove('hidden');
                hamburgerBadge.innerText = count;
            } else {
                hamburgerBadge.classList.add('hidden');
            }
        }

        const menuBadge = document.getElementById('menu-notif-count');
        if (menuBadge) {
            if (count > 0) {
                menuBadge.classList.remove('hidden');
                menuBadge.innerText = count;
            } else {
                menuBadge.classList.add('hidden');
            }
        }

        if (count > lastNotifCount) {
            const bell = document.getElementById('notificationBell')?.querySelector('i');
            if (bell) {
                bell.style.animation = 'bell-shake 0.5s';
                setTimeout(() => bell.style.animation = '', 500);
            }
        }
        lastNotifCount = count;
        return notifs;
    } catch (error) {
        console.error('Ошибка уведомлений:', error);
    }
}

async function showNotifications() {
    const notifs = await fetchNotifications();
    const list = document.getElementById('notifications-list');
    let html = '';

    notifs.forEach(n => {
        let icon = '', text = '', details = '';
        switch (n.type) {
            case 'new_order':
                icon = '🔔';
                text = 'Новый заказ';
                details = `Клиент: ${n.data.clientName || 'неизвестно'}`;
                break;
            case 'order_completed':
                icon = '✅';
                text = 'Заказ выполнен';
                details = `Оценка: ${n.data.rating || '—'}`;
                if (n.data.review) details += `<br>Отзыв: "${n.data.review}"`;
                break;
            case 'order_cancelled':
                icon = '❌';
                text = 'Заказ отменён';
                details = `Причина: ${n.data.reason || 'не указана'}`;
                break;
            case 'order_completed_client':
                icon = '✅';
                text = 'Ваш заказ выполнен';
                break;
            case 'order_cancelled_client':
                icon = '❌';
                text = 'Ваш заказ отменён';
                details = `Причина: ${n.data.reason || 'не указана'}`;
                break;
            case 'new_review':
                icon = '⭐';
                text = 'Новый отзыв';
                details = `Оценка: ${n.data.rating || '—'}`;
                break;
            default:
                icon = '📢';
                text = n.type;
        }
        html += '<div style="padding:10px; border-bottom:1px solid #e2e8f0; display:flex; align-items:center; gap:10px;">' +
            '<span style="font-size:1.5rem;">' + icon + '</span>' +
            '<div style="flex:1;">' +
            '<strong>' + text + '</strong>' +
            (details ? '<br><small style="color:#64748b;">' + details + '</small>' : '') +
            '<br><small style="color:#94a3b8;">' + new Date(n.createdAt).toLocaleString() + '</small>' +
            '</div>' +
            '</div>';
    });

    document.getElementById('notifications-list').innerHTML = html || '<p style="text-align:center; color:#94a3b8;">Нет уведомлений</p>';
    openModal('modal-notifications');

    for (let n of notifs) {
        await fetch('/api/notifications/' + n.id + '/read', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        });
    }
    await fetchNotifications();
}

function openChat(proId, proName) {
    if (!token) return openModal('modal-auth');
    document.getElementById('chat-with').innerText = 'Чат с ' + proName;
    document.getElementById('chat-messages').innerHTML = '';
    openModal('modal-chat');

    if (ws) ws.close();
    ws = new WebSocket('ws://' + location.host + '/?token=' + token);
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'delivered') return;
        const messagesDiv = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + (msg.from === 'me' ? 'sent' : 'received');
        messageDiv.innerText = msg.text;
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    };
    window.currentChatPro = proId;
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value;
    if (!text.trim()) return;

    const msg = {
        from: 'me',
        to: window.currentChatPro,
        text: text
    };
    ws.send(JSON.stringify(msg));

    const messagesDiv = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message sent';
    messageDiv.innerText = text;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    input.value = '';
}

function openCompleteModal(orderId) {
    currentOrderId = orderId;
    const modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.id = 'complete-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-box">
            <h2>Завершение заказа</h2>
            <div style="margin:20px 0">
                <label style="display:block; margin:10px 0">
                    <input type="radio" name="completeStatus" value="success" checked> Выполнен
                </label>
                <label style="display:block; margin:10px 0">
                    <input type="radio" name="completeStatus" value="fail"> Не выполнен
                </label>
            </div>
            <div id="success-fields" style="margin:10px 0">
                <label>Оценка (1-5)</label>
                <div style="font-size:2rem; text-align:center; margin:10px 0" id="rating-stars-complete">
                    <i class="far fa-star" onclick="setRatingComplete(1)"></i>
                    <i class="far fa-star" onclick="setRatingComplete(2)"></i>
                    <i class="far fa-star" onclick="setRatingComplete(3)"></i>
                    <i class="far fa-star" onclick="setRatingComplete(4)"></i>
                    <i class="far fa-star" onclick="setRatingComplete(5)"></i>
                </div>
                <textarea id="review-text" rows="3" placeholder="Отзыв (необязательно)"></textarea>
            </div>
            <div id="fail-fields" style="margin:10px 0; display:none">
                <label>Причина отмены</label>
                <select id="cancel-reason">
                    <option value="">Выберите причину</option>
                    ${cancelReasons.map(r => `<option value="${r}">${r}</option>`).join('')}
                </select>
            </div>
            <button class="btn btn-primary" onclick="submitComplete()">Отправить</button>
            <button class="btn btn-outline" onclick="closeCompleteModal()">Отмена</button>
        </div>
    `;
    document.body.appendChild(modal);

    const radios = modal.querySelectorAll('input[name="completeStatus"]');
    radios.forEach(r => r.addEventListener('change', (e) => {
        const isSuccess = e.target.value === 'success';
        document.getElementById('success-fields').style.display = isSuccess ? 'block' : 'none';
        document.getElementById('fail-fields').style.display = isSuccess ? 'none' : 'block';
    }));
    currentRatingComplete = 0;
}

function setRatingComplete(r) {
    currentRatingComplete = r;
    const stars = document.querySelectorAll('#rating-stars-complete i');
    stars.forEach((star, i) => {
        star.className = i < r ? 'fas fa-star' : 'far fa-star';
    });
}

function closeCompleteModal() {
    const modal = document.getElementById('complete-modal');
    if (modal) modal.remove();
}

async function submitComplete() {
    const isSuccess = document.querySelector('input[name="completeStatus"]:checked').value === 'success';
    let body = { success: isSuccess };
    if (isSuccess) {
        if (!currentRatingComplete) {
            showToast('Поставьте оценку', 'error');
            return;
        }
        body.rating = currentRatingComplete;
        body.review = document.getElementById('review-text').value;
    } else {
        const reason = document.getElementById('cancel-reason').value;
        if (!reason) {
            showToast('Выберите причину отмены', 'error');
            return;
        }
        body.cancelReason = reason;
    }
    const res = await fetch('/api/orders/' + currentOrderId + '/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body)
    });
    if (res.ok) {
        showToast('Статус обновлён', 'success');
        closeCompleteModal();
        getOrders();
    } else {
        const err = await res.json();
        showToast(err.msg || 'Ошибка', 'error');
    }
}

function toggleHamburgerMenu() {
    const menu = document.getElementById('hamburger-menu');
    menu.classList.toggle('hidden');
}
document.getElementById('menu-toggle').onclick = toggleHamburgerMenu;

document.addEventListener('click', (e) => {
    const menu = document.getElementById('hamburger-menu');
    const btn = document.getElementById('menu-toggle');
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

function updateMenuAuthText() {
    const authItem = document.querySelector('#menu-auth-text');
    if (authItem) {
        authItem.innerText = token ? 'Профиль' : 'Войти';
    }
}
updateMenuAuthText();

function toggleTheme() {
    const isDark = document.body.hasAttribute('data-theme');
    if (isDark) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        document.getElementById('theme-toggle').innerHTML = '<i class="fas fa-moon"></i>';
        document.getElementById('menu-theme-text').innerText = 'Тёмная тема';
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        document.getElementById('theme-toggle').innerHTML = '<i class="fas fa-sun"></i>';
        document.getElementById('menu-theme-text').innerText = 'Светлая тема';
    }
}
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    document.getElementById('theme-toggle').innerHTML = '<i class="fas fa-sun"></i>';
    document.getElementById('menu-theme-text').innerText = 'Светлая тема';
}

function openCompareFromMenu() {
    compareMasters();
    toggleHamburgerMenu();
}
function clearAllFavorites() {
    if (favorites.length === 0) {
        showToast('Список избранного пуст', 'info');
        return;
    }
    if (confirm('Очистить весь список избранного?')) {
        favorites = [];
        localStorage.setItem('favs', JSON.stringify(favorites));
        getPros();
        showToast('Избранное очищено', 'success');
    }
    toggleHamburgerMenu();
}
function showStatistics() {
    if (pros.length === 0) {
        showToast('Нет данных для статистики', 'error');
        toggleHamburgerMenu();
        return;
    }
    const total = pros.length;
    const avgPrice = (pros.reduce((sum, p) => sum + p.price, 0) / total).toFixed(0);
    const avgRating = (pros.reduce((sum, p) => sum + p.rating, 0) / total).toFixed(2);
    const maxPrice = Math.max(...pros.map(p => p.price));
    const minPrice = Math.min(...pros.map(p => p.price));
    const verifiedCount = pros.filter(p => p.verified).length;
    const modal = document.createElement('div');
    modal.className = 'modal-bg';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-box" style="width:400px;">
            <h2>Статистика по мастерам</h2>
            <div class="stat-item"><span class="stat-label">Всего мастеров:</span> <span class="stat-value">${total}</span></div>
            <div class="stat-item"><span class="stat-label">Средняя цена (₽/час):</span> <span class="stat-value">${avgPrice}</span></div>
            <div class="stat-item"><span class="stat-label">Средний рейтинг:</span> <span class="stat-value">${avgRating}</span></div>
            <div class="stat-item"><span class="stat-label">Мин. цена:</span> <span class="stat-value">${minPrice}</span></div>
            <div class="stat-item"><span class="stat-label">Макс. цена:</span> <span class="stat-value">${maxPrice}</span></div>
            <div class="stat-item"><span class="stat-label">Проверенных:</span> <span class="stat-value">${verifiedCount} (${Math.round(verifiedCount/total*100)}%)</span></div>
            <button class="btn btn-outline" onclick="this.closest('.modal-bg').remove()">Закрыть</button>
        </div>
    `;
    document.body.appendChild(modal);
    toggleHamburgerMenu();
}
function randomMaster() {
    if (pros.length === 0) {
        showToast('Нет доступных мастеров', 'error');
        toggleHamburgerMenu();
        return;
    }
    const random = pros[Math.floor(Math.random() * pros.length)];
    centerMap(random.location.lat, random.location.lng);
    showToast('Случайный мастер: ' + random.name, 'success');
    toggleHamburgerMenu();
}
function showAbout() {
    alert('PROMarket — сервис поиска специалистов. Версия 4.0 с визуальными улучшениями!');
    toggleHamburgerMenu();
}

document.getElementById('compare-btn').onclick = compareMasters;

function compareMasters() {
    const isMobile = document.documentElement.classList.contains('mobile');
    let selectedMasters = [];

    if (isMobile) {
        selectedMasters = pros.filter(p => selectedForCompare.includes(p.id));
    } else {
        const checkboxes = document.querySelectorAll('.compare-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.id);
        selectedMasters = pros.filter(p => selectedIds.includes(p.id));
    }

    if (selectedMasters.length < 2) {
        showToast('Выберите хотя бы двух мастеров для сравнения', 'error');
        return;
    }
    showCompareModal(selectedMasters);
}

function showCompareModal(masters) {
    const fields = [
        { label: 'Имя', key: 'name' },
        { label: 'Категория', key: 'category' },
        { label: 'Цена (₽/час)', key: 'price' },
        { label: 'Рейтинг', key: 'rating' },
        { label: 'Отзывов', key: 'ratingCount' },
        { label: 'Описание', key: 'desc' },
        { label: 'Проверенный', key: 'verified', format: v => v ? 'Да' : 'Нет' }
    ];
    let html = '<table class="compare-table">如果你<th>Параметр</th>';
    masters.forEach(m => html += '<th>' + m.name + '</th>');
    html += '<tr>';
    fields.forEach(f => {
        html += '<tr><td>' + f.label + '</td>';
        masters.forEach(m => {
            let value = m[f.key];
            if (f.format) value = f.format(value);
            html += '<td>' + value + '</td>';
        });
        html += '</tr>';
    });
    html += '</table>';

    const modal = document.getElementById('compare-modal');
    document.getElementById('compare-content').innerHTML = html;
    modal.style.display = 'flex';
}
function closeCompareModal() {
    document.getElementById('compare-modal').style.display = 'none';
}

document.getElementById('theme-toggle').onclick = toggleTheme;

window.addEventListener('scroll', () => {
    const btn = document.getElementById('scrollTop');
    if (btn) btn.style.display = window.scrollY > 300 ? 'block' : 'none';
});
document.getElementById('scrollTop').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

function toggleSidebar() {
    document.querySelector('.sidebar').classList.toggle('open');
}
document.getElementById('filter-toggle').onclick = toggleSidebar;
document.getElementById('sidebar-close').onclick = () => {
    document.querySelector('.sidebar').classList.remove('open');
};

document.addEventListener('click', (e) => {
    const sidebar = document.querySelector('.sidebar');
    const filterBtn = document.getElementById('filter-toggle');
    const hamburgerMenu = document.getElementById('hamburger-menu');
    if (hamburgerMenu && hamburgerMenu.contains(e.target)) {
        return;
    }
    if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !filterBtn.contains(e.target)) {
        sidebar.classList.remove('open');
    }
});

let touchstartX = 0;
let touchendX = 0;
const sidebarEl = document.querySelector('.sidebar');
if (sidebarEl) {
    sidebarEl.addEventListener('touchstart', e => {
        touchstartX = e.changedTouches[0].screenX;
    });
    sidebarEl.addEventListener('touchend', e => {
        touchendX = e.changedTouches[0].screenX;
        if (touchendX < touchstartX - 50) {
            sidebarEl.classList.remove('open');
        }
    });
}

const prosList = document.getElementById('pros-list');
if (prosList) {
    prosList.addEventListener('scroll', () => {
        const scrollPercent = (prosList.scrollTop / (prosList.scrollHeight - prosList.clientHeight)) * 100;
        document.getElementById('scroll-indicator').style.width = scrollPercent + '%';
    });
}

if (token && localStorage.getItem('role') === 'admin') {
    const adminItem = document.getElementById('admin-menu-item');
    if (adminItem) adminItem.classList.remove('hidden');
}

if (token) {
    const nameSpan = document.querySelector('#authBtn span');
    if (nameSpan) nameSpan.innerText = localStorage.getItem('uname') || 'Профиль';
    fetchNotifications();
    setInterval(fetchNotifications, 5000);
}

if (window.location.hash === '#orders') {
    showView('orders');
} else {
    showView('pros');
}

const params = new URLSearchParams(window.location.search);
if (params.has('cat')) document.getElementById('f-cat').value = params.get('cat');
if (params.has('maxPrice')) document.getElementById('f-price').value = params.get('maxPrice');
if (params.has('minRating')) document.getElementById('f-rate').value = params.get('minRating');
if (params.has('search')) document.getElementById('main-search').value = params.get('search');
if (params.has('verified')) document.getElementById('f-verified').checked = params.get('verified') === 'true';
if (params.has('sort')) document.getElementById('f-sort').value = params.get('sort');

// Обработчик изменения размера окна для перерисовки карточек
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        getPros();
    }, 300);
});

getPros();