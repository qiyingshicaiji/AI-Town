"""知识库管理器 — hello_agents RAGTool 薄适配层

替代自定义 LoreManager，利用框架内置的 RAGTool：
- MarkItDown 多格式文档转换（PDF/Word/图片/音频/代码等 45+ 格式）
- 自动分块（Markdown 标题感知）+ 嵌入 + Qdrant 存储
- 高级检索（MQE/HyDE/cross-encoder 重排序）
"""

import os
import threading
from typing import List, Optional


class KnowledgeManager:
    """RAGTool 适配器

    封装 hello_agents RAGTool，提供项目特定接口：
    - query(): 检索知识库上下文
    - sync_npc_info(): NPC 变更时更新向量
    - reload(): 清空并重新导入
    """

    NPC_DOC_ID = "npc_roster"

    def __init__(self, knowledge_dir: str):
        self._knowledge_dir = os.path.abspath(knowledge_dir)
        self._rag = None
        self._init_rag()          # 只创建 RAGTool 实例
        self._import_if_needed()  # 集合为空才导入文件

    # ==================== 初始化 ====================

    def _init_rag(self):
        """初始化 RAGTool 实例（不导入文件，避免阻塞启动）"""
        try:
            from hello_agents.tools import RAGTool

            self._rag = RAGTool(
                knowledge_base_path=self._knowledge_dir,
                collection_name="ai_town_knowledge",
                rag_namespace="ai_town",
            )
            print(f"📚 知识库 RAGTool 已初始化 (目录: {self._knowledge_dir})")
        except Exception as e:
            print(f"⚠️ 知识库 RAGTool 初始化失败: {e}")
            self._rag = None

    def _collection_has_data(self) -> bool:
        """检查 Qdrant 集合是否已有向量数据"""
        if not self._rag:
            return True  # RAG 不可用时，跳过导入
        try:
            stats = self._rag._get_stats()
            for line in stats.split("\n"):
                if "文档分块数" in line and ": 0" in line:
                    return False
            return True
        except Exception:
            return False  # 无法获取统计时尝试导入

    def _import_if_needed(self):
        """只在集合为空时导入知识库文件（后台线程，不阻塞启动）"""
        if self._collection_has_data():
            print("📚 知识库集合已有数据，跳过导入")
            return
        print("📭 知识库集合为空，后台开始首次导入（大知识库可能需要几分钟）...")
        threading.Thread(target=self._ingest_all, daemon=True).start()

    def _ingest_all(self):
        """扫描知识库目录，批量导入所有文件"""
        if not self._rag:
            return
        try:
            files = self._list_files()
            if files:
                result = self._rag.add_documents_batch(files, namespace="ai_town")
                # 精简输出
                lines = result.split("\n")[:3]
                print(f"📥 知识库文件导入: {'; '.join(lines)}")
            else:
                print("📭 知识库目录为空，跳过文件导入")
        except Exception as e:
            print(f"⚠️ 知识库文件导入失败: {e}")

    # 文本文件扩展名（避免导入图片、字体等二进制文件污染向量库）
    _TEXT_EXTENSIONS = {'.md', '.txt', '.rst', '.html', '.htm', '.csv', '.json', '.xml', '.yaml', '.yml', '.py', '.js', '.ts', '.css', '.log'}

    def _list_files(self) -> List[str]:
        """递归列出知识库目录中文本文件（跳过二进制文件）"""
        if not os.path.isdir(self._knowledge_dir):
            return []
        files = []
        for root, dirs, fnames in os.walk(self._knowledge_dir):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for fname in fnames:
                if fname.startswith("."):
                    continue
                ext = os.path.splitext(fname)[1].lower()
                if ext in self._TEXT_EXTENSIONS:
                    files.append(os.path.join(root, fname))
        return sorted(files)

    # ==================== 查询接口 ====================

    def query(self, text: str, top_k: int = 3) -> Optional[str]:
        """检索知识库上下文

        Args:
            text: 查询文本
            top_k: 返回片段数

        Returns:
            拼接的上下文文本，无结果时返回 None
        """
        if not self._rag or not text:
            return None

        try:
            result = self._rag.get_relevant_context(
                query=text,
                limit=top_k,
                namespace="ai_town",
            )
            if not result or result.startswith("获取上下文失败"):
                return None
            return result
        except Exception as e:
            print(f"⚠️ 知识库查询失败: {e}")
            return None

    # ==================== NPC 同步 ====================

    def sync_npc_info(self, npc_roles: dict):
        """NPC 变更时将最新人物信息写入知识库

        RAGTool 的 add_text 会将文本写入临时 .md 文件后导入。
        使用固定 document_id="npc_roster" 确保每次只保留最新版本。
        """
        if not self._rag:
            return
        try:
            text = self._build_npc_description(npc_roles)
            self._rag.add_text(
                text=text,
                namespace="ai_town",
                document_id=self.NPC_DOC_ID,
            )
            print(f"🔄 NPC 信息已同步到知识库 ({len(npc_roles)} 人)")
        except Exception as e:
            print(f"⚠️ NPC 信息同步失败: {e}")

    @staticmethod
    def _build_npc_description(npc_roles: dict) -> str:
        """构建 NPC 描述文本（Markdown 格式，供 RAGTool 分块嵌入）"""
        lines = ["# 办公室成员\n"]
        for name, role in npc_roles.items():
            title = role.get("title", "")
            personality = role.get("personality", "")
            expertise = role.get("expertise", "")
            speaking = role.get("speaking_style", "")
            quirks = "、".join(role.get("quirks", []))
            hobbies = role.get("hobbies", "")

            lines.append(f"## {name} — {title}")
            lines.append(f"性格: {personality}")
            lines.append(f"专长: {expertise}")
            lines.append(f"说话风格: {speaking}")
            if quirks:
                lines.append(f"习惯: {quirks}")
            if hobbies:
                lines.append(f"爱好: {hobbies}")
            lines.append("")

        return "\n".join(lines)

    # ==================== 管理接口 ====================

    def reload(self, npc_roles: dict = None):
        """清空并重新导入知识库（手动刷新时调用）

        Args:
            npc_roles: 可选，当前 NPC 配置，重载后自动同步到知识库
        """
        if not self._rag:
            return
        try:
            self._rag.clear_all_namespaces()
            self._init_rag()
            if npc_roles:
                self.sync_npc_info(npc_roles)
            print(f"🔄 知识库已重载")
        except Exception as e:
            print(f"⚠️ 知识库重载失败: {e}")
