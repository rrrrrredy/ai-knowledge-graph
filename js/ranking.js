/* ============================================
   AI Knowledge Graph - Ranking page
   v2: type-colored bars, click-to-graph, extra info
   ============================================ */

const TYPE_COLOR_HEX = {
  company: '#f78166',
  product: '#79c0ff',
  person:  '#d2a8ff',
  tech:    '#56d364',
  concept: '#56d364',
  paper:   '#e3b341',
};

const TYPE_LABEL = {
  company: '公司/院校',
  product: '产品',
  person:  '人物',
  tech:    '技术概念',
  concept: '技术概念',
  paper:   '论文',
};

let allNodes = [], allEdges = [];
let activeType = 'product';

async function loadData() {
  const [nodesRes, edgesRes, metaRes] = await Promise.all([
    fetch('data/nodes.json'),
    fetch('data/edges.json'),
    fetch('data/meta.json'),
  ]);
  allNodes = await nodesRes.json();
  allEdges = await edgesRes.json();
  const meta = await metaRes.json();

  document.getElementById('nav-meta').textContent =
    `${allNodes.length} 节点 · 更新于 ${meta.updatedAt || '–'}`;

  // Build edge count index
  buildEdgeIndex();
  renderRanking(activeType);
}

// Pre-compute edge count per node
const edgeCountMap = {};
function buildEdgeIndex() {
  allEdges.forEach(e => {
    const s = e.source.id || e.source;
    const t = e.target.id || e.target;
    edgeCountMap[s] = (edgeCountMap[s] || 0) + 1;
    edgeCountMap[t] = (edgeCountMap[t] || 0) + 1;
  });
}

function renderRanking(type) {
  const nodes = allNodes
    .filter(n => n.type === type)
    .sort((a, b) => (b.count || 0) - (a.count || 0));

  const maxCount = nodes[0]?.count || 1;
  const content = document.getElementById('ranking-content');
  const color = TYPE_COLOR_HEX[type] || '#58a6ff';

  if (!nodes.length) {
    content.innerHTML = `<div class="empty">
      <div class="empty-icon">📭</div>
      <div>暂无数据</div>
    </div>`;
    return;
  }

  const items = nodes.map((n, i) => {
    const rank = i + 1;
    const rankNum = rank <= 3 ? ['🥇','🥈','🥉'][rank - 1] : rank;
    const rankClass = rank <= 3 ? `top${rank}` : 'other';
    const pct = Math.round((n.count / maxCount) * 100);
    const edges = edgeCountMap[n.id] || 0;
    const desc = n.desc ? n.desc.slice(0, 70) + (n.desc.length > 70 ? '…' : '') : '';
    const sources = (n.sources || []).length;

    return `<div class="rank-item" onclick="goToGraph('${encodeURIComponent(n.id)}')">
      <div class="rank-num ${rankClass}">${rankNum}</div>
      <div class="rank-info">
        <div class="rank-name">
          ${n.label}
          <span class="badge badge-${n.type}">${TYPE_LABEL[n.type] || n.type}</span>
        </div>
        ${desc ? `<div class="rank-desc">${desc}</div>` : ''}
        <div class="rank-meta-row">
          ${edges ? `<span class="rank-meta-pill">🔗 ${edges} 关联</span>` : ''}
          ${sources ? `<span class="rank-meta-pill">📄 ${sources} 篇文档</span>` : ''}
        </div>
      </div>
      <div class="rank-bar-wrap">
        <div class="rank-bar-bg">
          <div class="rank-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="rank-count" style="color:${color}">${n.count} <span style="color:var(--text3)">次提及</span></div>
      </div>
    </div>`;
  }).join('');

  content.innerHTML = `<div class="ranking-list">${items}</div>`;
}

function goToGraph(encodedId) {
  window.location = `index.html#node=${encodedId}`;
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
