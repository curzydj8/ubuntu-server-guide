#!/usr/bin/env python3
"""内容同步导出：把 docs/ 的文章导出为 App 等消费端可同步的结构化内容包。

协议见仓库根 CONTENT_SYNC_PROTOCOL.md。导出物（默认写到仓库根 content-export/）：
  manifest.json  —— 入口清单：schema_version、生成时间、文章数、catalog 的 sha256
  catalog.json   —— 全部文章元数据（稳定 article_id、标题、部分、验证状态、sha256 等）
  articles/      —— 文章 Markdown 原文，按 docs/ 相对路径镜像

用法：
  python3 scripts/export-content.py [--out DIR]   生成导出包
  python3 scripts/export-content.py --verify [--out DIR]
        校验已有导出包：逐篇比对 sha256、文章数与 docs/ 源扫描一致、article_id 唯一
只用 Python 标准库，无第三方依赖。
"""

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
REPO_ROOT = Path(__file__).resolve().parent.parent
DOCS = REPO_ROOT / "docs"

# 不作为文章导出的路径（相对 docs/）：站点首页与工具页（工具经 A/B/C 分类另行下发，见
# TOOLS_ANDROID_REUSE_PLAN.md）；各部分 index.md 是导览，作为部分元数据而非文章。
EXCLUDE_FILES = {"index.md", "tools/index.md"}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_front_matter(text: str) -> dict:
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    fm = {}
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm


def parse_title(text: str) -> str:
    m = re.search(r"^# (.+)$", text, re.M)
    return m.group(1).strip() if m else ""


def parse_verification() -> dict:
    """从 docs/compatibility.md 的逐章表读出每篇文章的验证状态（路径 -> 三列状态）。"""
    compat = DOCS / "compatibility.md"
    result = {}
    if not compat.exists():
        return result
    row_re = re.compile(
        r"^\|[^|]+\|\s*\[[^\]]*\]\(([^)]+\.md)\)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|",
        re.M,
    )
    for path, s22, s24, s26 in row_re.findall(compat.read_text(encoding="utf-8")):
        result[path] = {
            "ubuntu_22_04": s22.strip(),
            "ubuntu_24_04": s24.strip(),
            "ubuntu_26_04": s26.strip(),
        }
    return result


def section_title(section_dir: Path) -> str:
    idx = section_dir / "index.md"
    if idx.exists():
        return parse_title(idx.read_text(encoding="utf-8"))
    return section_dir.name


def scan_articles(verification: dict) -> tuple[list[dict], list[dict]]:
    articles = []
    sections = {}
    for md in sorted(DOCS.rglob("*.md")):
        rel = md.relative_to(DOCS).as_posix()
        if rel in EXCLUDE_FILES or md.name == "index.md":
            continue
        data = md.read_bytes()
        text = data.decode("utf-8")
        fm = parse_front_matter(text)
        parts = rel.split("/")
        section_id = parts[0] if len(parts) > 1 else "root"
        order = 0
        m = re.match(r"(\d+)-", md.name)
        if m:
            order = int(m.group(1))
        article = {
            "article_id": rel[: -len(".md")],
            "title": parse_title(text),
            "description": fm.get("description", ""),
            "section": section_id,
            "order": order,
            "path": rel,
            "sha256": sha256_bytes(data),
            "bytes": len(data),
        }
        if rel in verification:
            article["verification"] = verification[rel]
        articles.append(article)
        if section_id not in sections:
            if section_id == "root":
                title = "站点页面"
            else:
                title = section_title(DOCS / section_id)
            sections[section_id] = {
                "section": section_id,
                "title": title,
                "order": int(section_id.split("-")[0]) if section_id.split("-")[0].isdigit() else 99,
            }
    articles.sort(key=lambda a: (a["section"], a["order"], a["article_id"]))
    return articles, sorted(sections.values(), key=lambda s: (s["order"], s["section"]))


def export(out_dir: Path) -> dict:
    verification = parse_verification()
    articles, sections = scan_articles(verification)
    articles_dir = out_dir / "articles"
    articles_dir.mkdir(parents=True, exist_ok=True)
    for a in articles:
        dst = articles_dir / a["path"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes((DOCS / a["path"]).read_bytes())
    catalog = {
        "schema_version": SCHEMA_VERSION,
        "sections": sections,
        "articles": articles,
    }
    catalog_bytes = json.dumps(catalog, ensure_ascii=False, indent=2).encode("utf-8")
    (out_dir / "catalog.json").write_bytes(catalog_bytes)
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "article_count": len(articles),
        "section_count": len(sections),
        "catalog_file": "catalog.json",
        "catalog_sha256": sha256_bytes(catalog_bytes),
        "articles_prefix": "articles/",
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return manifest


def verify(out_dir: Path) -> int:
    failures = 0

    def check(ok: bool, label: str) -> None:
        nonlocal failures
        print(("PASS " if ok else "FAIL ") + label)
        if not ok:
            failures += 1

    manifest_path = out_dir / "manifest.json"
    catalog_path = out_dir / "catalog.json"
    check(manifest_path.exists(), "manifest.json 存在")
    check(catalog_path.exists(), "catalog.json 存在")
    if failures:
        return 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    catalog_bytes = catalog_path.read_bytes()
    catalog = json.loads(catalog_bytes)
    check(manifest.get("schema_version") == SCHEMA_VERSION, "manifest schema_version 与脚本一致")
    check(
        manifest.get("catalog_sha256") == sha256_bytes(catalog_bytes),
        "catalog.json 的 sha256 与 manifest 记录一致",
    )
    articles = catalog.get("articles", [])
    check(manifest.get("article_count") == len(articles), "manifest 文章数与 catalog 一致")
    ids = [a["article_id"] for a in articles]
    check(len(ids) == len(set(ids)), "article_id 全唯一")
    bad_hash = []
    for a in articles:
        f = out_dir / "articles" / a["path"]
        if not f.exists() or sha256_bytes(f.read_bytes()) != a["sha256"]:
            bad_hash.append(a["article_id"])
    check(not bad_hash, f"逐篇 sha256 与 catalog 一致（异常 {len(bad_hash)} 篇）")
    # 与源头对账：docs/ 现行扫描集合应与 catalog 完全一致（防漏导出/陈旧导出）
    fresh, _ = scan_articles(parse_verification())
    fresh_ids = {a["article_id"] for a in fresh}
    check(fresh_ids == set(ids), "catalog 与 docs/ 源扫描集合一致（无漏篇、无陈旧篇）")
    fresh_hash = {a["article_id"]: a["sha256"] for a in fresh}
    stale = [i for i in ids if fresh_hash.get(i) != next(a["sha256"] for a in articles if a["article_id"] == i)]
    check(not stale, f"catalog 哈希与 docs/ 源文件当前内容一致（陈旧 {len(stale)} 篇）")
    print(f"== 校验完成：{'全部通过' if failures == 0 else f'{failures} 项失败'} ==")
    return 0 if failures == 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="内容同步导出与校验（见 CONTENT_SYNC_PROTOCOL.md）")
    ap.add_argument("--out", default=str(REPO_ROOT / "content-export"), help="导出目录（默认仓库根 content-export/）")
    ap.add_argument("--verify", action="store_true", help="只校验已有导出包，不重新生成")
    args = ap.parse_args()
    out_dir = Path(args.out)
    if args.verify:
        return verify(out_dir)
    manifest = export(out_dir)
    print(
        f"已导出 {manifest['article_count']} 篇文章、{manifest['section_count']} 个部分 -> {out_dir}"
    )
    return verify(out_dir)


if __name__ == "__main__":
    sys.exit(main())
