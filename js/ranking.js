/* ============================================
   AI Knowledge Graph - Ranking page
   ============================================ */

const TYPE_COLOR = {
  company: 'var(--color-company)',
  product: 'var(--color-product)',
  person:  'var(--color-person)',
  tech:    'var(--color-tech)',
  paper:   'var(--color-paper)',
};

const TYPE_LABEL = {
  company: '公司/院校',
  product: '产品',
  person:  '人物',
  tech:    '技术概念',
  paper:   '论文',
};

let allNodes = [];
let activeType = 'product';

async function loadData() {
  const [nodesRes, metaRes] = await Promise.all([
    fetch('data/nodes.json'),
    fetch('data/meta.json'),
  ]);
  allNodes = await nodesRes.json();
  const meta = await metaRes.json();
  document.getElementById('nav-meta').textContent =
    `${allNodes.length} 节点 · 更新于 ${meta.updatedAt || '–'}`;
  renderRanking(activeType);
}

function renderRanking(type) {
  const nodes = allNodes
    .filter(n => n.type === type)
    .sort((a, b) => (b.count || 0) - (a.count || 0));

  const maxCount = nodes[0]?.count || 1;
  const content = document.getElementById('ranking-content');

  if (!nodes.length) {
    content.innerHTML = `<div class="empty">
      <div class="empty-icon">📭</div>
      <div>暂无数据</div>
    </div>`;
    return;
  }

  const items = nodes.map((n, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : 'other';
    const rankNum = rank <= 3 ? ['🥇','🥈','🥉'][rank - 1] : rank;
    const pct = Math.round((n.count / maxCount) * 100);
    const color = TYPE_COLOR[n.type] || '#888';
    const desc = n.desc ? n.desc.slice(0, 60) + (n.desc.length > 60 ? '…' : '') : '';

    return `<div class="rank-item" onclick="window.location='index.html#node=${encodeURIComponent(n.id)}'">
      <div class="rank-num ${rankClass}">${rankNum}</div>
      <div class="rank-info">
        <div class="rank-name">
          ${n.label}
          <span class="badge badge-${n.type}">${TYPE_LABEL[n.type] || n.type}</span>
        </div>
        ${desc ? `<div class="rank-desc">${desc}</div>` : ''}
      </div>
      <div class="rank-bar-wrap">
        <div class="rank-bar-bg">
          <div class="rank-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="rank-count">${n.count} 次提及</div>
      </div>
    </div>`;
  }).join('');

  content.innerHTML = `<div class="ranking-list">${items}</div>`;
}

// Tab switching
document.getElementById('tab-bar').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  activeType = tab.dataset.type;
  renderRanking(activeType);
});

loadData().catch(err => {
  document.getElementById('ranking-content').innerHTML =
    `<div class="empty"><div class="empty-icon">⚠️</div><div>数据加载失败: ${err.message}</div></div>`;
});
