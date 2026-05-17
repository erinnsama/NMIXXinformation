// ── Posts ──

async function loadPosts() {
  const grid = document.getElementById('posts-grid');
  try {
    const res = await fetch('data/posts.json');
    const data = await res.json();

    const el = document.getElementById('last-update');
    if (data.last_updated) {
      const d = new Date(data.last_updated);
      el.textContent = `最後更新：${d.toLocaleString('zh-TW')}`;
    }

    renderPosts(data.posts || []);
  } catch {
    grid.innerHTML = '<div class="no-posts">尚無資料，請點擊「更新資料」載入最新應援資訊</div>';
  }
}

function renderPosts(posts) {
  const grid = document.getElementById('posts-grid');

  if (!posts.length) {
    grid.innerHTML = '<div class="no-posts">目前沒有應援資訊，點擊「更新資料」載入</div>';
    return;
  }

  const venue   = posts.filter(p => p.venue_type === 'venue'   || (!p.venue_type && p.source === 'threads'));
  const offsite = posts.filter(p => p.venue_type === 'offsite');

  const cardHtml = post => {
    const initial = post.username ? post.username[0].toUpperCase() : '?';
    const isCommunity = post.source === 'community';
    return `
      <div class="post-card">
        <span class="post-tag ${isCommunity ? 'community' : ''}">
          ${isCommunity ? '✍️ 手動更新' : '🔍 Threads'}
        </span>
        <div class="post-header">
          <div class="post-avatar">${initial}</div>
          <div>
            <div class="post-username">@${safe(post.username || '未知')}</div>
            <div class="post-date">${safe(post.date || '')}</div>
          </div>
        </div>
        <div class="post-text">${safe(post.text || '').replace(/\n/g, '<br>')}</div>
        ${post.url ? `<a href="${post.url}" target="_blank" rel="noopener" class="post-link">查看原文 →</a>` : ''}
      </div>`;
  };

  let html = '';

  if (venue.length) {
    html += `<div class="posts-category-label">🎤 演唱會線下應援</div>
             <div class="posts-grid-inner">${venue.map(cardHtml).join('')}</div>`;
  }
  if (offsite.length) {
    html += `<div class="posts-category-label ${venue.length ? 'mt' : ''}">🏪 非演唱會現場應援</div>
             <div class="posts-grid-inner">${offsite.map(cardHtml).join('')}</div>`;
  }

  grid.innerHTML = html;
}

function safe(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

// ── Update trigger ──

async function triggerUpdate() {
  const btn = document.getElementById('update-btn');
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    const res = await fetch('/api/trigger', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('✅ 更新已觸發！\n\n爬蟲約需 2–3 分鐘執行完畢，\n請稍後重新整理頁面查看最新資料。');
    } else {
      alert('❌ 觸發失敗：' + (data.error || '請稍後再試'));
    }
  } catch {
    alert('❌ 連線錯誤，請稍後再試。');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

// ── Map (Leaflet + OpenStreetMap dark tiles) ──

function initMap() {
  const map = L.map('map', { zoomControl: true }).setView([22.679, 120.290], 14);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  const makeIcon = (label, color) => L.divIcon({
    html: `<div style="background:${color};color:#fff;padding:5px 11px;border-radius:7px;font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.5)">${label}</div>`,
    iconAnchor: [70, 14],
    className: '',
  });

  L.marker([22.6828, 120.2768], { icon: makeIcon('🚄 高鐵左營站', '#7c3aed') }).addTo(map);
  L.marker([22.6767, 120.3031], { icon: makeIcon('🎵 高雄巨蛋', '#c026d3') }).addTo(map);

  L.polyline([[22.6828, 120.2768], [22.6767, 120.3031]], {
    color: '#b86ef5',
    weight: 3,
    dashArray: '8 8',
    opacity: .8,
  }).addTo(map);
}

// ── Submission form (Web3Forms) ──

document.addEventListener('DOMContentLoaded', () => {
  loadPosts();
  initMap();

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
      const json = await res.json();
      if (json.success) {
        successMsg.style.display = 'block';
        form.reset();
        setTimeout(loadPosts, 800);
      } else {
        alert('送出失敗：' + (json.error || '請稍後再試'));
      }
    } catch {
      alert('連線錯誤，請稍後再試。');
    } finally {
      btn.textContent = '提交應援資訊';
      btn.disabled = false;
    }
  });
});
