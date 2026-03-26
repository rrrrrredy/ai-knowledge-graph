/* ============================================
   AI Knowledge Graph - Browse page
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

const CATEGORY_ICONS = {
  '周报':     '📰',
  '论文推荐': '📄',
  '月度观察': '📊',
  '专题研究': '🔬',
};

let allNodes = [], allEdges = [], meta = {};
let activeCategory = null;

async function loadData() {
  const [nodesRes, edgesRes, metaRes] = await Promise.all([
    fetch('data/nodes.json'),
    fetch('data/edges.json'),
    fetch('data/meta.json'),
  ]);
  allNodes = await nodesRes.json();
  allEdges = await edgesRes.json();
  meta = await metaRes.json();

  document.getElementById('nav-meta').textContent =
    `${allNodes.length} 节点 · 更新于 ${meta.updatedAt || '–'}`;

  renderSidebar();
}

function renderSidebar() {
  const categories = meta.categories || {};
  const list = document.getElementById('category-list');

  const items = Object.entries(categories).map(([name, info]) => {
    const icon = CATEGORY_ICONS[name] || '📁';
    return `<div class="category-item" data-cat="${name}" onclick="selectCategory('${name}')">
      <div class="category-name">${icon} ${name}</div>
      <div class="category-count">${info.count || 0}</div>
    </div>`;
  }).join('');

  // Add "全部" at top
  const total = Object.values(categories).reduce((s, v) => s + (v.count || 0), 0);
  list.innerHTML = `
    <div class="category-item active" data-cat="__all__" onclick="selectCategory('__all__')">
      <div class="category-name">📚 全部文档</div>
      <div class="category-count">${total}</div>
    </div>
    ${items}`;

  selectCategory('__all__');
}

function selectCategory(cat) {
  activeCategory = cat;

  // Update active state
  document.querySelectorAll('.category-item').forEach(el => {
    el.classList.toggle('active', el.dataset.cat === cat);
  });

  const categories = meta.categories || {};

  let docs, catName, catDesc;
  if (cat === '__all__') {
    docs = Object.values(categories).flatMap(c => c.docs || []);
    catName = '全部文档';
    catDesc = `共 ${docs.length} 篇文档`;
  } else {
    const info = categories[cat] || {};
    docs = info.docs || [];
    catName = `${CATEGORY_ICONS[cat] || '📁'} ${cat}`;
    catDesc = info.desc || `共 ${docs.length} 篇文档`;
  }

  // Find nodes that appear in these docs
  const docSet = new Set(docs);
  const catNodes = cat === '__all__'
    ? allNodes
    : allNodes.filter(n => (n.sources || []).some(s => docSet.has(s)));

  catNodes.sort((a, b) => (b.count || 0) - (a.count || 0));

  renderMain(catName, catDesc, docs, catNodes);
}

window.selectCategory = selectCategory;

function renderMain(title, desc, docs, nodes) {
  const main = document.getElementById('browse-main');

  // Top nodes by type
  const byType = {};
  nodes.forEach(n => {
    if (!byType[n.type]) byType[n.type] = [];
    byType[n.type].push(n);
  });

  const typeStats = Object.entries(byType)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([type, ns]) =>
      `<div class="mini-stat">
        <div class="mini-stat-val" style="color:${TYPE_COLOR[type]}">${ns.length}</div>
        <div class="mini-stat-lab">${TYPE_LABEL[type] || type}</div>
      </div>`
    ).join('');

  // Top 15 nodes
  const topNodes = nodes.slice(0, 20).map(n =>
    `<div class="top-node-item">
      <div class="top-node-dot" style="background:${TYPE_COLOR[n.type] || '#888'}"></div>
      <div class="top-node-name">
        ${n.label}
        <span class="badge badge-${n.type}" style="margin-left:6px">${TYPE_LABEL[n.type] || n.type}</span>
      </div>
      <div class="top-node-count">${n.count}</div>
    </div>`
  ).join('');

  // Doc list (max 50)
  const docList = docs.slice(0, 50).map(d =>
    `<div class="doc-item">${d}</div>`
  ).join('');

  main.innerHTML = `
    <div class="browse-title">${title}</div>
    <div class="browse-desc">${desc}</div>

    <div class="mini-stats">${typeStats || '<div style="color:var(--text3)">暂无数据</div>'}</div>

    <div class="browse-cols">
      <div>
        <div class="col-title">🏆 高频节点 TOP 20</div>
        <div class="top-node-list">${topNodes || '<div class="empty"><div>暂无节点数据</div></div>'}</div>
      </div>
      <div>
        <div class="col-title">📄 文档列表（${docs.length} 篇）</div>
        <div class="doc-list">${docList || '<div class="empty"><div>暂无文档</div></div>'}
          ${docs.length > 50 ? `<div style="text-align:center;color:var(--text3);padding:8px">…还有 ${docs.length - 50} 篇</div>` : ''}
        </div>
      </div>
    </div>`;
}

loadData().catch(err => {
  document.getElementById('browse-main').innerHTML =
    `<div class="empty"><div class="empty-icon">⚠️</div><div>数据加载失败: ${err.message}</div></div>`;
});
