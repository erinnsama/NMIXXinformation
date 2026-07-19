// ── Event config ──
const EVENTS = {
  kaohsiung: {
    key: 'kaohsiung',
    label: '高雄場',
    status: 'ended',
    statusText: '已結束',
    tourBadge: '1ST WORLD TOUR',
    subtitle: 'EPISODE 1 : ZERO FRONTIER',
    location: 'In Kaohsiung',
    venue: '高雄巨蛋',
    dateBadges: ['7 / 13 (一)', '7 / 12 (日)'],
    dayFilter: [
      { key: 'all',  label: '全部' },
      { key: 'both', label: '🗓️ 雙日' },
      { key: 'day1', label: '📅 7/13（一）' },
      { key: 'day2', label: '📅 7/12（日）' },
    ],
    daySections: [
      { key: 'both', label: '🗓️ 雙日應援區',      sectionId: 'section-both', filter: p => p.day === 'both' || !p.day },
      { key: 'day1', label: '📅 7/13 周一場應援區', sectionId: 'section-day1', filter: p => p.day === 'day1' },
      { key: 'day2', label: '📅 7/12 周日場應援區', sectionId: 'section-day2', filter: p => p.day === 'day2' },
    ],
  },
  taipei: {
    key: 'taipei',
    label: '台北場',
    status: 'active',
    statusText: '🔴 進行中',
    tourBadge: '',
    subtitle: '8 / 15 應援物統整區',
    location: 'In Taipei',
    venue: '台北大巨蛋',
    dateBadges: ['8 / 15 (五)'],
    dayFilter: [
      { key: 'all', label: '全部' },
    ],
    daySections: [
      { key: 'all', label: '📅 8/15 應援區', sectionId: 'section-taipei', filter: () => true },
    ],
  },
};
const DEFAULT_EVENT = 'taipei';

// ── State ──
let _allPosts = [];
let _activeEvent = DEFAULT_EVENT;
let _activeDay = 'all';
let _favoritesOnly = false;

// ── Favorites (localStorage per browser) ──
const FAV_KEY = 'nmixx_favorites';
function getFavorites() {
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); }
  catch { return new Set(); }
}
function setFavorites(set) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
}
function isFavorite(postId) {
  return getFavorites().has(postId);
}
function toggleFavorite(postId) {
  const favs = getFavorites();
  if (favs.has(postId)) favs.delete(postId);
  else favs.add(postId);
  setFavorites(favs);
  return favs.has(postId);
}
function updateFavCount() {
  const total = getFavorites().size;
  const el = document.getElementById('fav-count');
  if (el) el.textContent = total;
}

// ── Data loading ──
async function loadPosts() {
  const grid = document.getElementById('posts-grid');
  try {
    const res = await fetch('/data/posts.json?t=' + Date.now());
    const data = await res.json();
    _allPosts = data.posts || [];
    applyFilter();
  } catch (err) {
    console.error('[loadPosts error]', err);
    grid.innerHTML = `<div class="no-posts">載入失敗：${err.message || err}，請重新整理頁面</div>`;
  }
}

// Event of a post — legacy posts without `event` field are treated as kaohsiung
function postEvent(p) {
  return p.event || 'kaohsiung';
}

function applyFilter() {
  const input = document.getElementById('post-search');
  const countEl = document.getElementById('post-search-count');
  const q = (input?.value || '').trim().toLowerCase();

  let scoped = _allPosts.filter(p => postEvent(p) === _activeEvent);

  if (_favoritesOnly) {
    const favs = getFavorites();
    scoped = scoped.filter(p => favs.has(p.id));
  }

  let filtered = scoped;
  if (q) {
    filtered = scoped.filter(p => {
      const haystack = [
        p.username, p.event_name, p.support_items, p.quantity,
        p.conditions, p.location, p.text, p.event_date, p.distribution_time
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  if (countEl) countEl.textContent = q ? `找到 ${filtered.length} / ${scoped.length} 筆` : '';
  renderPosts(filtered, _activeDay);
}

function renderPosts(posts, dayFilter) {
  const grid = document.getElementById('posts-grid');
  const cfg = EVENTS[_activeEvent];

  if (!posts.length) {
    grid.innerHTML = '<div class="no-posts">目前沒有符合條件的應援資訊</div>';
    return;
  }

  const cardHtml = post => {
    const initial = post.username ? post.username[0].toUpperCase() : '?';
    const isCommunity = post.source === 'community';
    const venueLabel = post.venue_type === 'offsite'
      ? '🏪 非現場'
      : (post.event === 'taipei' ? '🏟️ 大巨蛋周圍' : '🎤 演唱會現場');
    const eventDate = post.event_date ? `<span class="post-event-date">📅 ${safe(post.event_date)}</span>` : '';
    const location = post.location ? `<div class="post-location">📍 ${safe(post.location)}</div>` : '';
    const urls = Array.isArray(post.urls) && post.urls.length ? post.urls.filter(Boolean) : (post.url ? [post.url] : []);
    const urlsHtml = urls.map((u, i) =>
      `<a href="${safe(u)}" target="_blank" rel="noopener" class="post-link">查看原文${urls.length > 1 ? ' ' + (i + 1) : ''} →</a>`
    ).join('');
    const infoBlock = (post.support_items || post.quantity || post.conditions || post.distribution_time) ? `
        <div class="post-info-block">
          ${post.support_items     ? `<div class="post-info-item"><span class="info-label">🎁 應援物</span>${safe(post.support_items)}</div>` : ''}
          ${post.quantity          ? `<div class="post-info-item"><span class="info-label">📦 數量</span>${safe(post.quantity)}</div>` : ''}
          ${post.conditions        ? `<div class="post-info-item"><span class="info-label">📋 條件</span><span>${safe(post.conditions).replace(/\n/g, '<br>')}</span></div>` : ''}
          ${post.distribution_time ? `<div class="post-info-item"><span class="info-label">⏰ 發放時間</span>${safe(post.distribution_time)}</div>` : ''}
        </div>` : '';
    const fav = isFavorite(post.id);
    return `
      <div class="post-card">
        <button class="post-fav-btn${fav ? ' active' : ''}" data-id="${safe(post.id)}" aria-label="收藏">${fav ? '❤️' : '🤍'}</button>
        <div class="post-card-tags">
          <span class="post-tag ${isCommunity ? 'community' : ''}">${isCommunity ? '✍️ 手動更新' : '🔍 Threads'}</span>
          <span class="post-tag venue-tag">${venueLabel}</span>
          ${eventDate}
        </div>
        <div class="post-header">
          <div class="post-avatar">${initial}</div>
          <div>
            <div class="post-username">@${safe(post.username || '未知')}</div>
            <div class="post-date">${safe(post.date || '')}</div>
          </div>
        </div>
        ${location}
        ${infoBlock}
        <div class="post-text-wrap">
          <div class="post-text">${safe(post.text || '').replace(/\n/g, '<br>')}</div>
        </div>
        ${urlsHtml}
      </div>`;
  };

  const sectionHtml = (label, items, addMt, id) => {
    if (!items.length) return '';
    const idAttr = id ? ` id="${id}"` : '';
    return `<div class="posts-category-label${addMt ? ' mt' : ''}"${idAttr}>${label}<span class="category-count">${items.length} 篇</span></div>
            <div class="posts-grid-inner">${items.map(cardHtml).join('')}</div>`;
  };

  // Group posts by daySections config
  const sections = cfg.daySections.map(sec => ({
    ...sec,
    items: posts.filter(sec.filter),
  }));

  let html = '';
  if (dayFilter && dayFilter !== 'all') {
    const sec = sections.find(s => s.key === dayFilter);
    if (sec) html = sectionHtml(sec.label, sec.items, false, sec.sectionId);
  } else {
    let first = true;
    for (const sec of sections) {
      if (!sec.items.length) continue;
      html += sectionHtml(sec.label, sec.items, !first, sec.sectionId);
      first = false;
    }
  }

  if (!html) html = '<div class="no-posts">此日期暫無應援資訊</div>';
  grid.innerHTML = html;
}

// ── UI update on event switch ──
function switchEvent(eventKey) {
  if (!EVENTS[eventKey]) return;
  _activeEvent = eventKey;
  _activeDay = 'all';

  const cfg = EVENTS[eventKey];

  // Event tabs active state
  document.querySelectorAll('.event-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.event === eventKey);
  });

  // Toggle event-specific content sections (transport, union, notes, etc.)
  document.querySelectorAll('.event-content').forEach(el => {
    el.classList.toggle('active', el.dataset.event === eventKey);
  });

  // Hero: tour badge + subtitle + location + venue + dates
  const heroTourBadge = document.querySelector('.hero-wordmark .tour-badge');
  if (heroTourBadge) heroTourBadge.textContent = cfg.tourBadge;
  const heroSubtitle = document.querySelector('.hero-wordmark h2');
  if (heroSubtitle) {
    heroSubtitle.textContent = cfg.subtitle;
    // Chinese subtitle needs tighter letter-spacing than default (7px is for uppercase English)
    heroSubtitle.classList.toggle('subtitle-cjk', /[㐀-鿿]/.test(cfg.subtitle));
  }
  const heroLocation = document.querySelector('.hero-wordmark .location');
  if (heroLocation) heroLocation.textContent = cfg.location;
  const heroVenue = document.querySelector('.hero-content .venue');
  if (heroVenue) heroVenue.textContent = cfg.venue;
  const datesEl = document.querySelector('.hero-content .dates');
  if (datesEl) datesEl.innerHTML = cfg.dateBadges.map(d => `<span class="date-badge">${d}</span>`).join('');

  // Day filter buttons
  const dayFilterEl = document.getElementById('day-filter');
  if (dayFilterEl) {
    dayFilterEl.innerHTML = cfg.dayFilter.map((d, i) =>
      `<button class="day-btn${i === 0 ? ' active' : ''}" data-day="${d.key}">${d.label}</button>`
    ).join('');
    dayFilterEl.style.display = cfg.dayFilter.length > 1 ? '' : 'none';
  }

  // Nav dropdown items
  const navDrop = document.querySelector('.nav-drop');
  if (navDrop) {
    navDrop.innerHTML = cfg.daySections.map(s =>
      `<a class="nav-drop-item" data-section="${s.sectionId}">${s.label}</a>`
    ).join('');
    bindNavDropItems();
  }

  applyFilter();
}

function bindNavDropItems() {
  document.querySelectorAll('.nav-drop-item').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      _activeDay = 'all';
      document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.day-btn[data-day="all"]')?.classList.add('active');
      applyFilter();
      document.querySelectorAll('.nav-dropdown-wrap').forEach(w => w.classList.remove('open'));
      setTimeout(() => {
        document.getElementById(a.dataset.section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    });
  });
}

function safe(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

// ── DOMContentLoaded ──
document.addEventListener('DOMContentLoaded', () => {
  // Initialize with default event UI
  switchEvent(DEFAULT_EVENT);

  loadPosts();
  updateFavCount();

  // Search
  document.getElementById('post-search')?.addEventListener('input', applyFilter);

  // Favorites filter toggle
  document.getElementById('fav-filter-btn')?.addEventListener('click', () => {
    _favoritesOnly = !_favoritesOnly;
    document.getElementById('fav-filter-btn')?.classList.toggle('active', _favoritesOnly);
    applyFilter();
  });

  // Heart click on any post card (delegated)
  document.getElementById('posts-grid')?.addEventListener('click', e => {
    const btn = e.target.closest('.post-fav-btn');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.id;
    if (!id) return;
    const nowFav = toggleFavorite(id);
    btn.classList.toggle('active', nowFav);
    btn.textContent = nowFav ? '❤️' : '🤍';
    updateFavCount();
    if (_favoritesOnly) applyFilter();
  });

  // Event tabs
  document.getElementById('event-tabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.event-tab');
    if (!btn) return;
    switchEvent(btn.dataset.event);
  });

  // Day filter tabs (delegated because buttons are re-rendered on event switch)
  document.getElementById('day-filter')?.addEventListener('click', e => {
    const btn = e.target.closest('.day-btn');
    if (!btn) return;
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _activeDay = btn.dataset.day;
    applyFilter();
  });

  // Nav data-scroll-to: scroll to matching data-anchor within the currently visible event-content
  document.querySelectorAll('[data-scroll-to]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const key = a.dataset.scrollTo;
      const target = document.querySelector(`.event-content.active [data-anchor="${key}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Nav dropdown: toggle on mobile click, close on outside click
  document.querySelectorAll('.nav-dropdown-wrap').forEach(wrap => {
    wrap.querySelector('.nav-link-main')?.addEventListener('click', e => {
      if (window.innerWidth < 900) {
        e.preventDefault();
        wrap.classList.toggle('open');
      }
    });
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.nav-dropdown-wrap')) {
      document.querySelectorAll('.nav-dropdown-wrap').forEach(w => w.classList.remove('open'));
    }
  });

  // Bind ALL submit forms (kaohsiung + taipei have separate forms)
  document.querySelectorAll('.submit-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('.submit-btn');
      const successMsg = form.querySelector('.form-success');
      btn.textContent = '送出中⋯';
      btn.disabled = true;

      const raw = new FormData(form);
      const payload = Object.fromEntries([...raw.entries()].filter(([k]) => k !== 'access_key'));

      // Taipei form: location radio has "__other__" sentinel — replace with location_other text
      if (payload.location === '__other__') {
        payload.location = (payload.location_other || '').trim();
      }
      delete payload.location_other;

      // Default event: use the event of the .event-content wrapper this form is in, else active
      if (!payload.event) {
        const wrapper = form.closest('.event-content');
        payload.event = wrapper?.dataset.event || _activeEvent;
      }

      try {
        const res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        let json;
        try { json = await res.json(); } catch { json = {}; }
        if (json.success) {
          if (successMsg) successMsg.style.display = 'block';
          form.reset();
        } else {
          alert('送出失敗 (HTTP ' + res.status + ')：' + (json.error || '請稍後再試'));
        }
      } catch (err) {
        alert('連線錯誤：' + err.message);
      } finally {
        btn.textContent = '提交應援資訊';
        btn.disabled = false;
      }
    });
  });
});
