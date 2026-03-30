# AI 知识图谱

基于 263 篇 AI 行业深度报告构建的知识图谱，包含 3,968 个知识节点与 2,013 条关系网络。

## 在线访问

| 页面 | 地址 | 说明 |
|------|------|------|
| 🗺 力导向图 | [rrrrrredy.github.io/ai-knowledge-graph](https://rrrrrredy.github.io/ai-knowledge-graph/) | 交互式节点关系图 |
| 🔍 知识检索 | [simple-react-display.mynocode.host](https://simple-react-display.mynocode.host) | 实体检索 + 时间轴筛选 |
| 💬 AI 问答 | [ai-query-hub-space.mynocode.host](https://ai-query-hub-space.mynocode.host) | 基于知识库的 AI 对话 |

## 功能特性

- **知识节点检索**：支持按名称、描述全文搜索 3,968 个实体
- **时间轴筛选**（v4 新增）：按年份（2024/2025/2026）筛选文档节点，查看 AI 知识演化脉络
- **节点详情侧边栏**：点击搜索结果查看简介、关联节点、相关文档数
- **AI 问答联动**：点击节点可跳转到 AI 问答页预填问题
- **数据看板**：话题分布 TOP8、热门机构 TOP8
- **力导向图**：基于 GitHub Pages 的 D3.js 可视化

## 数据规模

- 📚 **263 篇** 深度文档（2024~2026 年）
- 🔵 **3,968 个** 知识节点
- 🔗 **2,013 条** 关系连接
- 📅 **2024**：97篇 / **2025**：129篇 / **2026**：31篇

## 技术栈

- 力导向图：纯 HTML + D3.js（GitHub Pages 静态托管）
- 知识检索页：React + Vite（NoCode 平台部署）
- AI 问答：React + 智谱 GLM-4-Flash（NoCode 平台部署）
- 数据来源：美团 Friday 知识库（citadel API）
