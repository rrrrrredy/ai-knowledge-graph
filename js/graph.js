/* ============================================
   AI Knowledge Graph - Force-directed graph
   D3.js v7
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

const RELATION_LABEL = {
  develops:   '开发',
  competes:   '竞争',
  researches: '研究',
  belongs_to: '隶属',
  cooperates: '合作',
  cites:      '引用',
};

let allNodes = [], allEdges = [], meta = {};
let activeType = 'all';
let selectedNode = null;
let simulation, svg, g, linkSel, nodeSel, zoom;

// ---- Load data ----
async function loadData() {
  const [nodesRes, edgesRes, metaRes] = await Promise.all([
    fetch('data/nodes.json'),
    fetch('data/edges.json'),
    fetch('data/meta.json'),
  ]);
  allNodes = await nodesRes.json();
  allEdges = await edgesRes.json();
  meta = await metaRes.json();

  // Update stats
  document.getElementById('stat-nodes').textContent = allNodes.length;
  document.getElementById('stat-edges').textContent = allEdges.length;
  document.getElementById('stat-docs').textContent = meta.docCount || '–';
  document.getElementById('nav-meta').textContent =
    `更新于 ${meta.updatedAt || '–'}`;

  initGraph();
}

// ---- Init graph ----
function initGraph() {
  const container = document.getElementById('graph-container');
  const W = container.clientWidth;
  const H = container.clientHeight;

  svg = d3.select('#graph-svg')
    .attr('width', W).attr('height', H);

  zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (e) => g.attr('transform', e.transform));

  svg.call(zoom);
  g = svg.append('g');

  buildGraph(allNodes, allEdges);

  // Zoom controls
  document.getElementById('zoom-in').onclick = () =>
    svg.transition().call(zoom.scaleBy, 1.3);
  document.getElementById('zoom-out').onclick = () =>
    svg.transition().call(zoom.scaleBy, 0.77);
  document.getElementById('zoom-reset').onclick = () =>
    svg.transition().call(zoom.transform, d3.zoomIdentity);

  // Search
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) { clearHighlight(); return; }
    const matched = allNodes.filter(n =>
      n.label.toLowerCase().includes(q) ||
      (n.desc || '').toLowerCase().includes(q)
    );
    if (matched.length > 0) highlightNode(matched[0]);
  });

  // Filter chips
  document.getElementById('type-filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeType = chip.dataset.type;
    filterByType(activeType);
  });

  // Legend clicks
  document.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
      const t = item.dataset.type;
      activeType = activeType === t ? 'all' : t;
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      const chip = document.querySelector(`.chip[data-type="${activeType}"]`);
      if (chip) chip.classList.add('active');
      filterByType(activeType);
    });
  });

  // Resize
  window.addEventListener('resize', () => {
    const W2 = container.clientWidth, H2 = container.clientHeight;
    svg.attr('width', W2).attr('height', H2);
    simulation.force('center', d3.forceCenter(W2 / 2, H2 / 2));
    simulation.alpha(0.1).restart();
  });
}

// ---- Build / rebuild graph ----
function buildGraph(nodes, edges) {
  // Clear previous
  g.selectAll('*').remove();

  const W = +svg.attr('width'), H = +svg.attr('height');

  // Size scale
  const maxCount = d3.max(nodes, d => d.count) || 1;
  const sizeScale = d3.scaleSqrt().domain([1, maxCount]).range([5, 28]);

  // Edges (only those with both endpoints in current node set)
  const nodeIds = new Set(nodes.map(d => d.id));
  const validEdges = edges.filter(e =>
    nodeIds.has(e.source.id || e.source) &&
    nodeIds.has(e.target.id || e.target)
  );

  // Links
  linkSel = g.append('g').attr('class', 'links')
    .selectAll('line')
    .data(validEdges)
    .join('line')
    .attr('class', 'link');

  // Nodes
  const nodeG = g.append('g').attr('class', 'nodes')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'node')
    .call(d3.drag()
      .on('start', dragStart)
      .on('drag', dragged)
      .on('end', dragEnd)
    )
    .on('click', (event, d) => {
      event.stopPropagation();
      selectNode(d, nodes, validEdges);
    })
    .on('mouseover', (event, d) => showTooltip(event, d))
    .on('mousemove', (event) => moveTooltip(event))
    .on('mouseout', hideTooltip);

  nodeG.append('circle')
    .attr('r', d => sizeScale(d.count || 1))
    .attr('fill', d => TYPE_COLOR[d.type] || '#888')
    .attr('fill-opacity', 0.85)
    .attr('stroke', d => TYPE_COLOR[d.type] || '#888')
    .attr('stroke-opacity', 0.5);

  nodeG.append('text')
    .attr('dy', d => sizeScale(d.count || 1) + 12)
    .text(d => d.label.length > 12 ? d.label.slice(0, 11) + '…' : d.label);

  nodeSel = nodeG;

  // Simulation
  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(validEdges)
      .id(d => d.id)
      .distance(d => 80 + (d.weight || 1) * 2)
    )
    .force('charge', d3.forceManyBody()
      .strength(d => -120 - sizeScale(d.count || 1) * 3)
    )
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collide', d3.forceCollide(d => sizeScale(d.count || 1) + 6))
    .on('tick', ticked);

  // Click on background → deselect
  svg.on('click', () => {
    selectedNode = null;
    clearHighlight();
    showEmptySide();
  });
}

function ticked() {
  linkSel
    .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
  nodeSel.attr('transform', d => `translate(${d.x},${d.y})`);
}

// ---- Drag ----
function dragStart(event, d) {
  if (!event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x; d.fy = d.y;
}
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragEnd(event, d) {
  if (!event.active) simulation.alphaTarget(0);
  d.fx = null; d.fy = null;
}

// ---- Highlight / select ----
function selectNode(d, nodes, edges) {
  selectedNode = d;

  // Find connected node ids
  const connectedIds = new Set();
  const connectedEdges = [];
  edges.forEach(e => {
    const sid = e.source.id || e.source;
    const tid = e.target.id || e.target;
    if (sid === d.id || tid === d.id) {
      connectedIds.add(sid === d.id ? tid : sid);
      connectedEdges.push(e);
    }
  });

  // Fade / highlight
  nodeSel
    .classed('faded', n => n.id !== d.id && !connectedIds.has(n.id))
    .classed('highlighted', n => n.id === d.id);

  linkSel
    .classed('faded', e => {
      const sid = e.source.id || e.source;
      const tid = e.target.id || e.target;
      return sid !== d.id && tid !== d.id;
    })
    .classed('highlighted', e => {
      const sid = e.source.id || e.source;
      const tid = e.target.id || e.target;
      return sid === d.id || tid === d.id;
    });

  // Zoom to node
  const W = +svg.attr('width'), H = +svg.attr('height');
  svg.transition().duration(500).call(
    zoom.transform,
    d3.zoomIdentity.translate(W / 2, H / 2).scale(1.5).translate(-d.x, -d.y)
  );

  // Show detail
  showNodeDetail(d, connectedEdges, nodes);
}

function highlightNode(d) {
  // Scroll to node in graph
  const node = allNodes.find(n => n.id === d.id);
  if (node && node.x !== undefined) {
    const W = +svg.attr('width'), H = +svg.attr('height');
    svg.transition().duration(500).call(
      zoom.transform,
      d3.zoomIdentity.translate(W / 2, H / 2).scale(2).translate(-node.x, -node.y)
    );
  }
}

function clearHighlight() {
  if (nodeSel) nodeSel.classed('faded', false).classed('highlighted', false);
  if (linkSel) linkSel.classed('faded', false).classed('highlighted', false);
}

// ---- Filter by type ----
function filterByType(type) {
  selectedNode = null;
  clearHighlight();
  showEmptySide();

  if (type === 'all') {
    buildGraph(allNodes, allEdges);
  } else {
    // Show only nodes of that type + edges between them
    const filtered = allNodes.filter(n => n.type === type);
    const filteredIds = new Set(filtered.map(n => n.id));
    const filteredEdges = allEdges.filter(e =>
      filteredIds.has(e.source.id || e.source) &&
      filteredIds.has(e.target.id || e.target)
    );
    buildGraph(filtered, filteredEdges);
  }
}

// ---- Tooltip ----
const tooltip = document.getElementById('tooltip');
function showTooltip(event, d) {
  tooltip.style.display = 'block';
  tooltip.innerHTML = `<strong>${d.label}</strong><br>
    <span style="color:${TYPE_COLOR[d.type]}">${TYPE_LABEL[d.type] || d.type}</span>
    · 提及 ${d.count} 次`;
  moveTooltip(event);
}
function moveTooltip(event) {
  tooltip.style.left = (event.clientX + 12) + 'px';
  tooltip.style.top  = (event.clientY - 8) + 'px';
}
function hideTooltip() { tooltip.style.display = 'none'; }

// ---- Side panel ----
function showEmptySide() {
  document.getElementById('side-body').innerHTML = `
    <div class="side-empty">
      <div class="side-empty-icon">🔮</div>
      <div>点击节点查看详情</div>
    </div>`;
}

function showNodeDetail(d, connectedEdges, nodes) {
  const nodeMap = {};
  nodes.forEach(n => nodeMap[n.id] = n);

  const inEdges  = connectedEdges.filter(e => (e.target.id || e.target) === d.id);
  const outEdges = connectedEdges.filter(e => (e.source.id || e.source) === d.id);

  const relHtml = (edges, dir) => edges.map(e => {
    const otherId = dir === 'out'
      ? (e.target.id || e.target)
      : (e.source.id || e.source);
    const other = nodeMap[otherId];
    if (!other) return '';
    const rel = RELATION_LABEL[e.relation] || e.relation || '';
    return `<div class="relation-item" onclick="focusNode('${otherId}')">
      <span class="relation-label">${rel}</span>
      <span class="relation-name">${other.label}</span>
    </div>`;
  }).join('');

  const sourcesHtml = (d.sources || []).slice(0, 8).map(s =>
    `<div class="source-item">${s}</div>`
  ).join('');

  document.getElementById('side-body').innerHTML = `
    <div class="node-detail active">
      <div class="node-name">
        ${d.label}
        <span class="badge badge-${d.type}">${TYPE_LABEL[d.type] || d.type}</span>
      </div>
      <div class="node-stat">
        <div class="stat">
          <div class="stat-value">${d.count}</div>
          <div class="stat-label">提及次数</div>
        </div>
        <div class="stat">
          <div class="stat-value">${connectedEdges.length}</div>
          <div class="stat-label">关联节点</div>
        </div>
        <div class="stat">
          <div class="stat-value">${(d.sources || []).length}</div>
          <div class="stat-label">出处文档</div>
        </div>
      </div>
      ${d.desc ? `<div class="node-desc">${d.desc}</div>` : ''}
      ${outEdges.length ? `
        <div class="section-title">→ 指向</div>
        <div class="relation-list">${relHtml(outEdges, 'out')}</div>
      ` : ''}
      ${inEdges.length ? `
        <div class="section-title">← 来自</div>
        <div class="relation-list">${relHtml(inEdges, 'in')}</div>
      ` : ''}
      ${sourcesHtml ? `
        <div class="section-title">出处文档</div>
        <div class="source-list">${sourcesHtml}</div>
      ` : ''}
    </div>`;
}

window.focusNode = function(nodeId) {
  const node = allNodes.find(n => n.id === nodeId);
  if (node) selectNode(node, allNodes, allEdges);
};

// ---- Bootstrap ----
loadData().catch(err => {
  document.getElementById('side-body').innerHTML = `
    <div class="side-empty">
      <div class="side-empty-icon">⚠️</div>
      <div style="color:var(--text2)">数据加载失败<br><small>${err.message}</small></div>
    </div>`;
  console.error(err);
});
