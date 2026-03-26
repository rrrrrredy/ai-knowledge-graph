#!/usr/bin/env python3
"""
AI Knowledge Graph - 知识库全文提取 & 实体关系抽取脚本

用法:
  python3 scripts/extract.py --token <MCP_TOKEN> --out data/

依赖:
  pip install requests tqdm openai

流程:
  1. 通过 Friday MCP API 获取全部文档列表
  2. 逐篇读取学城全文（KM collabpage）
  3. 用 LLM 提取实体 + 关系
  4. 合并去重，统计频次
  5. 输出 nodes.json / edges.json / meta.json
"""

import argparse
import json
import re
import time
import hashlib
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import requests

# ---- Config ----
DATASET_ID = "317657507192833"
SPACE_ID = "21712"
MCP_BASE = "http://mcphub-server.sankuai.com/mcphub-api/94ad8ae6c9c747"

# Entity normalization rules
ALIASES = {
    "GPT4": "GPT-4",
    "gpt4": "GPT-4",
    "gpt-4": "GPT-4",
    "ChatGPT": "ChatGPT",
    "chatgpt": "ChatGPT",
    "deepseek": "DeepSeek",
    "deep seek": "DeepSeek",
    "claude": "Claude",
    "gemini": "Gemini",
    "llama": "LLaMA",
    "Llama": "LLaMA",
    "qwen": "Qwen",
    "通义千问": "Qwen",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google",
    "meta": "Meta",
    "microsoft": "Microsoft",
    "微软": "Microsoft",
    "字节跳动": "字节跳动",
    "bytedance": "字节跳动",
    "阿里巴巴": "阿里巴巴",
    "alibaba": "阿里巴巴",
    "腾讯": "腾讯",
    "tencent": "腾讯",
    "百度": "百度",
    "baidu": "百度",
    "华为": "华为",
    "huawei": "华为",
}

CATEGORY_PATTERNS = {
    "周报": [r"第[一二三四五\d]+周", r"月第\d+周"],
    "论文推荐": [r"周论文推荐", r"论文推荐"],
    "月度观察": [r"月度观察", r"AI行业月度"],
    "专题研究": [],  # fallback
}


def classify_doc(name: str) -> str:
    for cat, patterns in CATEGORY_PATTERNS.items():
        if cat == "专题研究":
            continue
        for p in patterns:
            if re.search(p, name):
                return cat
    return "专题研究"


def normalize_entity(name: str) -> str:
    return ALIASES.get(name, name).strip()


def make_node_id(label: str) -> str:
    return re.sub(r"[^\w\-]", "_", label.lower())[:64]


# ---- MCP Client ----
class MCPClient:
    def __init__(self, token: str):
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    def call(self, tool: str, params: dict) -> dict:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool, "arguments": params},
        }
        resp = requests.post(MCP_BASE, json=payload, headers=self.headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise RuntimeError(f"MCP error: {data['error']}")
        content = data.get("result", {}).get("content", [])
        if content and content[0].get("type") == "text":
            return json.loads(content[0]["text"])
        return {}

    def list_documents(self) -> list:
        result = self.call("list_document", {
            "spaceId": SPACE_ID,
            "datasetId": DATASET_ID,
            "paging": {"offset": 1, "limit": 200},
        })
        return result.get("data", {}).get("items", [])


# ---- KM full-text fetcher ----
def fetch_km_fulltext(url: str) -> str:
    """Fetch KM collabpage content via web."""
    try:
        from urllib.request import urlopen, Request
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        html = urlopen(req, timeout=15).read().decode("utf-8", errors="ignore")
        # Strip HTML tags
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\s+", " ", text)
        return text[:8000]  # limit context
    except Exception as e:
        return f"[fetch error: {e}]"


# ---- LLM extraction ----
EXTRACT_PROMPT = """你是一个知识图谱提取专家。请从以下AI行业文章中提取实体和关系。

**实体类型**：
- company: 公司或院校（如 OpenAI、清华大学、字节跳动）
- product: 产品（如 GPT-4、Claude、豆包）
- person: 人物（如 Sam Altman、何恺明）
- tech: 技术概念（如 RAG、Transformer、Scaling Law）
- paper: 论文（如 "Attention Is All You Need"）

**关系类型**：
- develops: 公司/人开发了产品/论文
- competes: 产品/公司间竞争
- researches: 机构/人提出了技术/论文
- belongs_to: 人/产品隶属于公司
- cooperates: 合作/集成关系
- cites: 引用关系

**规则**：
1. 只提取文章明确提到的实体，不要推断
2. 同义词统一：GPT4 → GPT-4，深度求索 → DeepSeek
3. 每个实体给一个简短的中文描述（10-20字）
4. 只提取置信度高的关系
5. 输出严格的 JSON 格式

**输出格式**：
```json
{
  "entities": [
    {"label": "Claude", "type": "product", "desc": "Anthropic旗下的AI助手产品"},
    {"label": "Anthropic", "type": "company", "desc": "美国AI安全公司"}
  ],
  "relations": [
    {"source": "Anthropic", "target": "Claude", "relation": "develops"}
  ]
}
```

文章标题：{title}
文章内容：{content}

请提取："""


def extract_entities_llm(title: str, content: str, api_key: str, api_base: str) -> dict:
    """Call LLM to extract entities and relations."""
    try:
        import openai
        client = openai.OpenAI(api_key=api_key, base_url=api_base)
        prompt = EXTRACT_PROMPT.format(
            title=title,
            content=content[:4000]
        )
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=2000,
        )
        text = resp.choices[0].message.content
        # Extract JSON block
        m = re.search(r"```json\s*([\s\S]+?)\s*```", text)
        if m:
            return json.loads(m.group(1))
        return json.loads(text)
    except Exception as e:
        print(f"  LLM error: {e}")
        return {"entities": [], "relations": []}


# ---- Main pipeline ----
def run(token: str, out_dir: str, api_key: str = None, api_base: str = None,
        limit: int = None, dry_run: bool = False):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    client = MCPClient(token)

    print("📚 Fetching document list…")
    docs = client.list_documents()
    if limit:
        docs = docs[:limit]
    print(f"   Found {len(docs)} documents")

    # Classify docs
    categories = defaultdict(lambda: {"count": 0, "docs": []})
    for doc in docs:
        cat = classify_doc(doc["name"])
        categories[cat]["count"] += 1
        categories[cat]["docs"].append(doc["name"])

    # Entity/relation accumulators
    node_data = {}   # id -> {label, type, desc, count, sources}
    edge_data = {}   # (src, tgt, rel) -> weight

    for i, doc in enumerate(docs):
        name = doc["name"]
        link = doc.get("link", "")
        cat = classify_doc(name)

        print(f"[{i+1}/{len(docs)}] {name[:50]}…")

        if dry_run:
            continue

        # Fetch full text
        content = fetch_km_fulltext(link) if link else ""
        if not content or "[fetch error" in content:
            print(f"  ⚠ fetch failed, using title only")
            content = name

        # Extract via LLM (or skip if no API key)
        if api_key:
            extracted = extract_entities_llm(name, content, api_key, api_base or "https://api.openai.com/v1")
        else:
            # Fallback: no LLM, just return empty
            print("  ⚠ No LLM API key, skipping extraction")
            extracted = {"entities": [], "relations": []}

        # Accumulate entities
        for ent in extracted.get("entities", []):
            label = normalize_entity(ent.get("label", ""))
            if not label or len(label) < 2:
                continue
            nid = make_node_id(label)
            if nid not in node_data:
                node_data[nid] = {
                    "id": nid,
                    "label": label,
                    "type": ent.get("type", "tech"),
                    "desc": ent.get("desc", ""),
                    "count": 0,
                    "sources": [],
                }
            node_data[nid]["count"] += 1
            if name not in node_data[nid]["sources"]:
                node_data[nid]["sources"].append(name)

        # Accumulate relations
        for rel in extracted.get("relations", []):
            src_label = normalize_entity(rel.get("source", ""))
            tgt_label = normalize_entity(rel.get("target", ""))
            relation = rel.get("relation", "")
            if not src_label or not tgt_label or not relation:
                continue
            src_id = make_node_id(src_label)
            tgt_id = make_node_id(tgt_label)
            key = (src_id, tgt_id, relation)
            edge_data[key] = edge_data.get(key, 0) + 1

        time.sleep(0.3)  # rate limit

    # Build output
    nodes = sorted(node_data.values(), key=lambda n: -n["count"])
    edges = [
        {"source": k[0], "target": k[1], "relation": k[2], "weight": v}
        for k, v in edge_data.items()
        if k[0] in node_data and k[1] in node_data
    ]

    meta = {
        "docCount": len(docs),
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "updatedAt": datetime.now().strftime("%Y-%m-%d"),
        "categories": {
            k: {"count": v["count"], "desc": _cat_desc(k), "docs": v["docs"]}
            for k, v in categories.items()
        },
    }

    # Write
    (out / "nodes.json").write_text(json.dumps(nodes, ensure_ascii=False, indent=2))
    (out / "edges.json").write_text(json.dumps(edges, ensure_ascii=False, indent=2))
    (out / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2))

    print(f"\n✅ Done!")
    print(f"   Nodes: {len(nodes)}")
    print(f"   Edges: {len(edges)}")
    print(f"   Output: {out}/")


def _cat_desc(cat: str) -> str:
    return {
        "周报": "AI行业周报，海内外动态追踪",
        "论文推荐": "每周精选学术论文推荐",
        "月度观察": "AI行业月度深度分析报告",
        "专题研究": "公司全景解析、技术专题等深度内容",
    }.get(cat, cat)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract knowledge graph from Friday KB")
    parser.add_argument("--token", required=True, help="Friday MCP JWT token")
    parser.add_argument("--api-key", default=None, help="OpenAI-compatible API key for LLM extraction")
    parser.add_argument("--api-base", default=None, help="API base URL (default: OpenAI)")
    parser.add_argument("--out", default="data", help="Output directory")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of docs (for testing)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch doc list only, no extraction")
    args = parser.parse_args()

    run(
        token=args.token,
        out_dir=args.out,
        api_key=args.api_key,
        api_base=args.api_base,
        limit=args.limit,
        dry_run=args.dry_run,
    )
