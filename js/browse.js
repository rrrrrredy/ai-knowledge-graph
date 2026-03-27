/* ============================================
   AI Knowledge Graph - Browse page
   v3: uses docs.json (id-based), summary cards,
   clickable docs open detail panel
   ============================================ */

const TYPE_COLOR_HEX = {
  company: '#f78166',
  product: '#79c0ff',
  person:  '#d2a8ff',
  concept: '#56d364',
  paper:   '#e3b341',
};

const TYPE_LABEL = {
  company: '公司/院校',
  product: '产品',
  person:  '人物',
  concept: '技术概念',
  paper:   '论文',
};

const CATEGORY_ICONS = {
  '周报':       '📰',
  '论文推荐':   '📄',
  '月度观察':   '📊',
  '专题研究':   '🔬',
  'Agent方法论':'🤖',
  '学习资源':   '📚',
};

let allNodes = [], allEdges = [], allDocs = [], meta = {};
let activeCategory = null;

// doc id → {entities, relations, types}
const docStatsCache = {};

async function loadData() {
  const [nodesRes, edgesRes, metaRes, docsRes] = await Promise.all([
    fetch('data/nodes.json'),
    fetch('data/edges.json'),
    fetch('data/meta.json'),
    fetch('data/docs.json'),
  ]);
  allNodes = await nodesRes.json();
  allEdges = await edgesRes.json();
  meta     = await metaRes.json();
  allDocs  = await docsRes.json();

  document.getElementById('nav-meta').textContent =
    `${allNodes.length} 节点 · 更新于 ${meta.updatedAt || '–'}`;

  buildDocStats();
  renderSidebar();
}

// Pre-compute per-doc entity count and relation count (by doc id)
function buildDocStats() {
  allNodes.forEach(n => {
    (n.sources || []).forEach(docId => {
      if (!docStatsCache[docId]) docStatsCache[docId] = { entities: 0, relations: 0, types: new Set() };
      docStatsCache[docId].entities++;
      docStatsCache[docId].types.add(n.type);
    });
  });
  const nodeDocMap = {};
  allNodes.forEach(n => { nodeDocMap[n.id] = new Set(n.sources || []); });
  allEdges.forEach(e => {
    const sid = e.source.id || e.source;
    const tid = e.target.id || e.target;
    const sDocs = nodeDocMap[sid] || new Set();
    const tDocs = nodeDocMap[tid] || new Set();
    sDocs.forEach(doc => {
      if (tDocs.has(doc)) {
        if (!docStatsCache[doc]) docStatsCache[doc] = { entities: 0, relations: 0, types: new Set() };
        docStatsCache[doc].relations++;
      }
    });
  });
}

function renderSidebar() {
  const categories = meta.categories || {};
  const list = document.getElementById('category-list');
  const total = allDocs.length;

  const items = Object.entries(categories).map(([name, info]) => {
    const icon = CATEGORY_ICONS[name] || '📁';
    return `<div class="category-item" data-cat="${name}" onclick="selectCategory('${name}')">
      <div class="category-name">${icon} ${name}</div>
      <div class="category-count">${info.count || 0}</div>
    </div>`;
  }).join('');

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
  document.querySelectorAll('.category-item').forEach(el => {
    el.classList.toggle('active', el.dataset.cat === cat);
  });

  const categories = meta.categories || {};
  let docIds, catName;

  if (cat === '__all__') {
    docIds = allDocs.map(d => d.id);
    catName = '全部文档';
  } else {
    const info = categories[cat] || {};
    docIds = info.docs || [];
    catName = `${CATEGORY_ICONS[cat] || '📁'} ${cat}`;
  }

  const docSet = new Set(docIds);
  const catDocs = allDocs.filter(d => docSet.has(d.id));
  const catNodes = cat === '__all__'
    ? allNodes
    : allNodes.filter(n => (n.sources || []).some(s => docSet.has(s)));

  catNodes.sort((a, b) => (b.count || 0) - (a.count || 0));
  renderMain(catName, catDocs, catNodes);
}

window.selectCategory = selectCategory;

function renderMain(title, docs, nodes) {
  const main = document.getElementById('browse-main');

  const byType = {};
  nodes.forEach(n => { byType[n.type] = (byType[n.type] || 0) + 1; });
  const typeStats = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, cnt]) =>
      `<div class="mini-stat">
        <div class="mini-stat-val" style="color:${TYPE_COLOR_HEX[type]||'#888'}">${cnt}</div>
        <div class="mini-stat-lab">${TYPE_LABEL[type] || type}</div>
      </div>`
    ).join('');

  const docCards = docs.map(doc => {
    const stats = docStatsCache[doc.id] || { entities: 0, relations: 0, types: new Set() };
    const typeChips = [...(stats.types || [])].map(t =>
      `<span class="doc-type-chip" style="background:${TYPE_COLOR_HEX[t]||'#888'}22;color:${TYPE_COLOR_HEX[t]||'#888'};border-color:${TYPE_COLOR_HEX[t]||'#888'}44">${TYPE_LABEL[t] || t}</span>`
    ).join('');
    const summary = doc.summary || '';
    const dateStr = doc.date ? `<span class="doc-date">${doc.date}</span>` : '';

    return `<div class="doc-card" onclick="openDocDetail('${doc.id}')">
      <div class="doc-card-title">${doc.title || doc.id}</div>
      ${summary ? `<div class="doc-card-summary">${summary}</div>` : ''}
      <div class="doc-card-meta">
        ${dateStr}
        <span class="doc-meta-stat">🧩 ${stats.entities} 个实体</span>
        <span class="doc-meta-stat">🔗 ${stats.relations} 条关系</span>
      </div>
      ${typeChips ? `<div class="doc-type-chips">${typeChips}</div>` : ''}
    </div>`;
  }).join('');

  main.innerHTML = `
    <div class="browse-header">
      <div class="browse-title">${title}</div>
      <div class="browse-desc">共 ${docs.length} 篇文档 · ${nodes.length} 个实体节点</div>
    </div>
    <div class="mini-stats">${typeStats || '<div style="color:var(--text3)">暂无数据</div>'}</div>
    <div class="doc-grid">${docCards || '<div class="empty"><div>暂无文档</div></div>'}</div>`;
}

// Doc detail drawer (by doc id)
window.openDocDetail = function(docId) {
  const doc = allDocs.find(d => d.id === docId) || {};
  const docNodes = allNodes
    .filter(n => (n.sources || []).includes(docId))
    .sort((a, b) => (b.count || 0) - (a.count || 0));
  const stats = docStatsCache[docId] || { entities: 0, relations: 0 };

  const entitiesHtml = docNodes.slice(0, 20).map(n =>
    `<div class="detail-entity" onclick="window.location='index.html#node=${encodeURIComponent(n.id)}'">
      <span class="detail-dot" style="background:${TYPE_COLOR_HEX[n.type]||'#888'}"></span>
      <span class="detail-name">${n.label}</span>
      <span class="detail-type" style="color:${TYPE_COLOR_HEX[n.type]||'#888'}">${TYPE_LABEL[n.type]||n.type}</span>
      <span class="detail-count">${n.count}次</span>
    </div>`
  ).join('');

  let drawer = document.getElementById('doc-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'doc-drawer';
    document.body.appendChild(drawer);
  }



  drawer.innerHTML = `
    <div class="drawer-overlay" onclick="closeDocDrawer()"></div>
    <div class="drawer-panel">
      <div class="drawer-header">
        <div class="drawer-title">${doc.title || docId}</div>
        <button class="drawer-close" onclick="closeDocDrawer()">✕</button>
      </div>
      ${doc.summary ? `<div class="drawer-summary">${doc.summary}</div>` : ''}
      <div class="drawer-stats">
        <span>🧩 ${stats.entities} 个实体</span>
        <span>🔗 ${stats.relations} 条关系</span>
        ${doc.date ? `<span>📅 ${doc.date}</span>` : ''}
      </div>
      <div class="drawer-subtitle">提取的实体</div>
      <div class="drawer-entities">${entitiesHtml || '<div style="color:var(--text3)">暂无实体数据</div>'}</div>
      ${docNodes.length > 20 ? `<div class="drawer-more">…还有 ${docNodes.length - 20} 个实体</div>` : ''}
      <div class="drawer-actions">
        <a class="drawer-graph-btn" href="index.html">在图谱中查看 →</a>
      </div>
    </div>`;
  drawer.style.display = 'block';
  requestAnimationFrame(() => drawer.querySelector('.drawer-panel').classList.add('open'));
};

window.closeDocDrawer = function() {
  const drawer = document.getElementById('doc-drawer');
  if (drawer) {
    drawer.querySelector('.drawer-panel').classList.remove('open');
    setTimeout(() => { drawer.style.display = 'none'; }, 280);
  }
};

loadData().catch(err => {
  document.getElementById('browse-main').innerHTML =
    `<div class="empty"><div class="empty-icon">⚠️</div><div>数据加载失败: ${err.message}</div></div>`;
});
