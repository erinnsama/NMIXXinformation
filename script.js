// ── Posts ──

let _allPosts = [];
let _activeDay = 'all';

async function loadPosts() {
  const grid = document.getElementById('posts-grid');
  try {
    const res = await fetch('/data/posts.json');
    const data = await res.json();
    _allPosts = data.posts || [];
    applyFilter();
  } catch {
    grid.innerHTML = '<div class="no-posts">尚無資料，請點擊「更新資料」載入最新應援資訊</div>';
  }
}

function applyFilter() {
  const input = document.getElementById('post-search');
  const countEl = document.getElementById('post-search-count');
  const q = (input?.value || '').trim().toLowerCase();

  let filtered = _allPosts;
  if (q) {
    filtered = _allPosts.filter(p => {
      const haystack = [
        p.username, p.event_name, p.support_items, p.quantity,
        p.conditions, p.location, p.text, p.event_date, p.distribution_time
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  if (countEl) countEl.textContent = q ? `找到 ${filtered.length} / ${_allPosts.length} 筆` : '';
  renderPosts(filtered, _activeDay);
}

function renderPosts(posts, dayFilter) {
  const grid = document.getElementById('posts-grid');

  if (!posts.length) {
    grid.innerHTML = '<div class="no-posts">目前沒有符合條件的應援資訊</div>';
    return;
  }

  const both = posts.filter(p => p.day === 'both' || !p.day);
  const day1 = posts.filter(p => p.day === 'day1');
  const day2 = posts.filter(p => p.day === 'day2');

  const cardHtml = post => {
    const initial = post.username ? post.username[0].toUpperCase() : '?';
    const isCommunity = post.source === 'community';
    const venueLabel = post.venue_type === 'offsite' ? '🏪 非現場' : '🎤 演唱會現場';
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
    return `
      <div class="post-card">
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

  const section = (label, items, addMt, id) => {
    if (!items.length) return '';
    const idAttr = id ? ` id="${id}"` : '';
    return `<div class="posts-category-label${addMt ? ' mt' : ''}"${idAttr}>${label}</div>
            <div class="posts-grid-inner">${items.map(cardHtml).join('')}</div>`;
  };

  let html = '';
  if (dayFilter === 'both') {
    html = section('🗓️ 雙日應援區', both, false, 'section-both');
  } else if (dayFilter === 'day1') {
    html = section('📅 7/13 周一場應援區', day1, false, 'section-day1');
  } else if (dayFilter === 'day2') {
    html = section('📅 7/12 周日場應援區', day2, false, 'section-day2');
  } else {
    let first = true;
    if (both.length) { html += section('🗓️ 雙日應援區', both, false, 'section-both'); first = false; }
    if (day1.length) { html += section('📅 7/13 周一場應援區', day1, !first, 'section-day1'); first = false; }
    if (day2.length) { html += section('📅 7/12 周日場應援區', day2, !first, 'section-day2'); }
  }

  if (!html) html = '<div class="no-posts">此日期暫無應援資訊</div>';
  grid.innerHTML = html;
}

function safe(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

// ── Submission form ──

document.addEventListener('DOMContentLoaded', () => {
  loadPosts();

  // Search
  document.getElementById('post-search')?.addEventListener('input', applyFilter);

  // Day filter tabs
  document.getElementById('day-filter')?.addEventListener('click', e => {
    const btn = e.target.closest('.day-btn');
    if (!btn) return;
    document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _activeDay = btn.dataset.day;
    applyFilter();
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

  // Nav dropdown items: set filter to all, scroll to section
  document.querySelectorAll('.nav-drop-item').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const targetId = a.dataset.section;
      _activeDay = 'all';
      document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.day-btn[data-day="all"]')?.classList.add('active');
      applyFilter();
      document.querySelectorAll('.nav-dropdown-wrap').forEach(w => w.classList.remove('open'));
      setTimeout(() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    });
  });

  const form = document.getElementById('submit-form');
  const successMsg = document.getElementById('form-success');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('.submit-btn');
    btn.textContent = '送出中⋯';
    btn.disabled = true;

    const raw = new FormData(form);
    const payload = Object.fromEntries([...raw.entries()].filter(([k]) => k !== 'access_key'));
    try {
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let json;
      try { json = await res.json(); } catch { json = {}; }
      if (json.success) {
        successMsg.style.display = 'block';
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
