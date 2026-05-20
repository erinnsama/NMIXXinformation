// ── Posts ──

async function loadPosts() {
  const grid = document.getElementById('posts-grid');
  try {
    const res = await fetch('data/posts.json');
    const data = await res.json();

    renderPosts(data.posts || []);
  } catch {
    grid.innerHTML = '<div class="no-posts">尚無資料，請點擊「更新資料」載入最新應援資訊</div>';
  }
}

function renderPosts(posts) {
  const grid = document.getElementById('posts-grid');

  if (!posts.length) {
    grid.innerHTML = '<div class="no-posts">目前沒有應援資訊</div>';
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
        ${post.url ? `<a href="${post.url}" target="_blank" rel="noopener" class="post-link">查看原文 →</a>` : ''}
      </div>`;
  };

  const section = (label, items, addMt, id) => {
    if (!items.length) return '';
    return `<div class="posts-category-section${addMt ? ' mt' : ''}" id="${id}">
              <div class="posts-category-label">${label}</div>
              <div class="posts-grid-inner">${items.map(cardHtml).join('')}</div>
            </div>`;
  };

  let first = true;
  let html = '';
  if (both.length) { html += section('雙日應援區', both, false, 'cat-both'); first = false; }
  if (day1.length) { html += section('7/11 周六場應援區', day1, !first, 'cat-day1'); first = false; }
  if (day2.length) { html += section('7/12 周日場應援區', day2, !first, 'cat-day2'); }

  grid.innerHTML = html;
}

function safe(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

// ── Nav dropdown ──

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-drop-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      const dropdown = trigger.closest('.nav-dropdown');
      if (!dropdown.classList.contains('open')) {
        e.preventDefault();
        document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
        dropdown.classList.add('open');
      }
    });
  });

  document.querySelectorAll('.nav-drop-menu a').forEach(a => {
    a.addEventListener('click', () => {
      document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-dropdown')) {
      document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('open'));
    }
  });
});

// ── Submission form ──

document.addEventListener('DOMContentLoaded', () => {
  loadPosts();

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
