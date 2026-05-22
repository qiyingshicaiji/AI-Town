"""NPC好感度管理系统"""

import sys
import os

# 添加HelloAgents到Python路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'HelloAgents'))

from hello_agents import SimpleAgent, HelloAgentsLLM
from typing import Dict, List, Optional, Tuple
import json
import re

class RelationshipManager:
    """NPC好感度管理器
    
    功能:
    - 管理NPC与玩家的好感度 (0-100)
    - 使用LLM分析对话情感
    - 自动更新好感度
    - 提供好感度等级和修饰词
    """
    
    def __init__(self, llm: HelloAgentsLLM):
        """初始化好感度管理器

        Args:
            llm: HelloAgentsLLM实例
        """
        self.llm = llm

        # 存储每个NPC与玩家的好感度
        # 格式: {npc_name: {player_id: affinity_score}}
        self.affinity_scores: Dict[str, Dict[str, float]] = {}

        # ⭐ NPC 间好感度矩阵（对称矩阵）
        # 格式: {"张三": {"李四": 30.0, "王五": 30.0}, "李四": {"王五": 30.0}}
        self.npc_npc_affinity: Dict[str, Dict[str, float]] = {}

        # 从磁盘加载持久化的好感度
        self._load_from_disk()

        # 创建好感度分析Agent
        self.analyzer_agent = SimpleAgent(
            name="AffinityAnalyzer",
            llm=llm,
            system_prompt=self._create_analyzer_prompt()
        )

        print("💖 好感度管理系统已初始化")
    
    def _create_analyzer_prompt(self) -> str:
        """创建情感分析Agent的系统提示词"""
        return """你是一个情感分析专家,负责分析对话中的情感倾向,判断是否应该改变NPC对玩家的好感度。

【任务】
分析玩家与NPC的对话,判断是否应该改变好感度,以及改变的幅度。

【分析维度】
1. **玩家态度**: 友好/中立/不友好
2. **对话内容**: 积极/中立/消极
3. **互动质量**: 深入/一般/敷衍
4. **情感倾向**: 赞美/批评/中性

【好感度变化规则】
- 赞美、感谢、请教: +3 到 +8
- 友好问候、正常交流: +1 到 +3
- 普通闲聊、中性话题: 0
- 批评、质疑、不耐烦: -3 到 -8
- 侮辱、攻击、恶意: -8 到 -15

【输出格式】(严格遵守JSON格式,不要添加任何其他文字)
{
    "should_change": true/false,
    "change_amount": -15到+10之间的整数,
    "reason": "简短说明原因(10字以内)",
    "sentiment": "positive/neutral/negative"
}

【示例1】
玩家: "你好,很高兴认识你!"
NPC: "你好!我也很高兴认识你。"
输出: {"should_change": true, "change_amount": 5, "reason": "友好问候", "sentiment": "positive"}

【示例2】
玩家: "你这个设计太丑了!"
NPC: "抱歉,我会改进的..."
输出: {"should_change": true, "change_amount": -8, "reason": "批评工作", "sentiment": "negative"}

【示例3】
玩家: "今天天气不错"
NPC: "是啊,挺好的。"
输出: {"should_change": false, "change_amount": 0, "reason": "普通闲聊", "sentiment": "neutral"}

【示例4】
玩家: "你的代码写得真棒!"
NPC: "谢谢!我最近在研究新技术。"
输出: {"should_change": true, "change_amount": 8, "reason": "赞美工作", "sentiment": "positive"}

【示例5】
玩家: "能教教我吗?"
NPC: "当然可以!我很乐意分享。"
输出: {"should_change": true, "change_amount": 6, "reason": "请教学习", "sentiment": "positive"}

【重要】
- 只输出JSON,不要添加任何解释或其他文字
- change_amount必须是整数
- reason必须简短(10字以内)
- sentiment必须是positive/neutral/negative之一
"""
    
    def get_affinity(self, npc_name: str, player_id: str = "player") -> float:
        """获取好感度 (0-100)
        
        Args:
            npc_name: NPC名称
            player_id: 玩家ID
            
        Returns:
            好感度值 (0-100)
        """
        if npc_name not in self.affinity_scores:
            self.affinity_scores[npc_name] = {}
        
        if player_id not in self.affinity_scores[npc_name]:
            self.affinity_scores[npc_name][player_id] = 50.0  # 初始好感度50
        
        return self.affinity_scores[npc_name][player_id]
    
    def set_affinity(self, npc_name: str, affinity: float, player_id: str = "player"):
        """设置好感度

        Args:
            npc_name: NPC名称
            affinity: 好感度值 (0-100)
            player_id: 玩家ID
        """
        if npc_name not in self.affinity_scores:
            self.affinity_scores[npc_name] = {}

        # 限制在0-100范围内
        affinity = max(0.0, min(100.0, affinity))
        self.affinity_scores[npc_name][player_id] = affinity
        self._save_to_disk()
    
    def analyze_and_update_affinity(
        self,
        npc_name: str,
        player_message: str,
        npc_response: str,
        player_id: str = "player"
    ) -> Dict:
        """分析对话并更新好感度
        
        Args:
            npc_name: NPC名称
            player_message: 玩家消息
            npc_response: NPC回复
            player_id: 玩家ID
            
        Returns:
            分析结果字典
        """
        # 构建分析提示
        prompt = f"""请分析以下对话:

玩家: {player_message}
{npc_name}: {npc_response}

请判断是否应该改变好感度,并给出变化量。
"""
        
        try:
            # 调用分析Agent
            response = self.analyzer_agent.run(prompt)
            
            # 解析JSON响应
            analysis = self._parse_analysis(response)
            
            if analysis["should_change"]:
                # 更新好感度
                current_affinity = self.get_affinity(npc_name, player_id)
                new_affinity = current_affinity + analysis["change_amount"]
                new_affinity = max(0.0, min(100.0, new_affinity))  # 限制在0-100

                self.set_affinity(npc_name, new_affinity, player_id)

                # 获取好感度等级
                old_level = self.get_affinity_level(current_affinity)
                new_level = self.get_affinity_level(new_affinity)

                # 注意: 打印日志已移到agents.py中,避免重复输出

                return {
                    "changed": True,
                    "old_affinity": current_affinity,
                    "new_affinity": new_affinity,
                    "change_amount": analysis["change_amount"],
                    "reason": analysis["reason"],
                    "sentiment": analysis.get("sentiment", "neutral"),
                    "old_level": old_level,
                    "new_level": new_level
                }
            else:
                return {
                    "changed": False,
                    "affinity": self.get_affinity(npc_name, player_id),
                    "reason": analysis["reason"],
                    "sentiment": analysis.get("sentiment", "neutral")
                }
        
        except Exception as e:
            print(f"❌ 好感度分析失败: {e}")
            import traceback
            traceback.print_exc()
            return {
                "changed": False,
                "affinity": self.get_affinity(npc_name, player_id),
                "reason": "分析失败",
                "sentiment": "neutral"
            }
    
    def _parse_analysis(self, response: str) -> Dict:
        """解析分析结果
        
        Args:
            response: LLM响应
            
        Returns:
            解析后的字典
        """
        try:
            # 尝试直接解析JSON
            analysis = json.loads(response)
            return analysis
        except json.JSONDecodeError:
            # 尝试提取JSON部分
            # 查找第一个 { 和最后一个 }
            start = response.find('{')
            end = response.rfind('}') + 1
            
            if start != -1 and end > start:
                json_str = response[start:end]
                try:
                    analysis = json.loads(json_str)
                    return analysis
                except json.JSONDecodeError:
                    pass
            
            # 尝试使用正则表达式提取
            # 匹配 "should_change": true/false
            should_change_match = re.search(r'"should_change"\s*:\s*(true|false)', response, re.IGNORECASE)
            change_amount_match = re.search(r'"change_amount"\s*:\s*(-?\d+)', response)
            reason_match = re.search(r'"reason"\s*:\s*"([^"]+)"', response)
            sentiment_match = re.search(r'"sentiment"\s*:\s*"([^"]+)"', response)
            
            if should_change_match and change_amount_match:
                return {
                    "should_change": should_change_match.group(1).lower() == "true",
                    "change_amount": int(change_amount_match.group(1)),
                    "reason": reason_match.group(1) if reason_match else "未知",
                    "sentiment": sentiment_match.group(1) if sentiment_match else "neutral"
                }
            
            # 解析失败,返回默认值
            print(f"⚠️  JSON解析失败,使用默认值。原始响应: {response[:100]}...")
            return {
                "should_change": False,
                "change_amount": 0,
                "reason": "解析失败",
                "sentiment": "neutral"
            }
    
    def get_affinity_level(self, affinity: float) -> str:
        """获取好感度等级
        
        Args:
            affinity: 好感度值 (0-100)
            
        Returns:
            好感度等级名称
        """
        if affinity >= 80:
            return "挚友"
        elif affinity >= 60:
            return "亲密"
        elif affinity >= 40:
            return "友好"
        elif affinity >= 20:
            return "熟悉"
        else:
            return "陌生"
    
    def get_affinity_modifier(self, affinity: float) -> str:
        """获取好感度修饰词 (用于调整对话风格) — 强指令式"""
        if affinity >= 80:
            return "【挚友级·好感度80+】你必须表现得非常热情，像见到最好的老朋友。主动关心对方，分享私人话题，语气充满温暖和信任。不要说任何冷淡或疏远的话。"
        elif affinity >= 60:
            return "【亲密级·好感度60-79】你对对方印象很好。表现得友好热情，愿意多聊天，语气轻松亲切，可以主动关心对方、找话题。"
        elif affinity >= 40:
            return "【友好级·好感度40-59】你对对方印象一般。保持礼貌友善，正常交流即可。维持同事间的专业距离，不过分热情也不冷淡。"
        elif affinity >= 20:
            return "【熟悉级·好感度20-39】你不太熟悉对方。表现得礼貌但略显生疏，回答尽量简洁，不要主动扩展话题。偶尔可以看手机或忙别的事。"
        else:
            return "【冷淡级·好感度0-19】你不太喜欢对方。表现得冷淡疏离，回答极其简短（不超过10个字），语气客气但疏远，可以找借口结束对话。"
    
    # ==================== NPC 间好感度 ====================

    def _get_npc_npc_key(self, a: str, b: str) -> tuple:
        """获取 NPC 间好感度的键（字母序排列确保对称）"""
        return (a, b) if a < b else (b, a)

    def get_npc_npc_affinity(self, npc_a: str, npc_b: str) -> float:
        """获取两个 NPC 之间的好感度

        Args:
            npc_a: NPC A 名称
            npc_b: NPC B 名称

        Returns:
            好感度值 (0-100)，初始为 30
        """
        if npc_a == npc_b:
            return 100.0

        # 确保对称访问
        outer, inner = self._get_npc_npc_key(npc_a, npc_b)

        if outer not in self.npc_npc_affinity:
            self.npc_npc_affinity[outer] = {}
        if inner not in self.npc_npc_affinity[outer]:
            self.npc_npc_affinity[outer][inner] = 55.0  # 初始好感度 55（需 >= 触发阈值 50）

        return self.npc_npc_affinity[outer][inner]

    def update_npc_npc_affinity(self, npc_a: str, npc_b: str, delta: float):
        """更新两个 NPC 之间的好感度（对称更新）

        Args:
            npc_a: NPC A 名称
            npc_b: NPC B 名称
            delta: 变化量（正=增加，负=减少）
        """
        if npc_a == npc_b:
            return

        current = self.get_npc_npc_affinity(npc_a, npc_b)
        new_value = max(0.0, min(100.0, current + delta))

        outer, inner = self._get_npc_npc_key(npc_a, npc_b)
        self.npc_npc_affinity[outer][inner] = new_value

        old_level = self.get_affinity_level(current)
        new_level = self.get_affinity_level(new_value)
        if old_level != new_level:
            print(f"  💞 {npc_a}↔{npc_b} 好感度等级变化: {old_level}({current:.0f}) → {new_level}({new_value:.0f}) [Δ{delta:+.1f}]")

        self._save_to_disk()

    def apply_event_affinity(self, event_text: str, npc_names: List[str]):
        """根据事件文本自动调整 NPC 间好感度

        解析事件中的关键词，如 "争吵"、"合作" 等，自动调整对应 NPC 的好感度。

        Args:
            event_text: 事件描述文本
            npc_names: 所有 NPC 名称列表
        """
        event_lower = event_text.lower()

        # 冲突类关键词 → 降低好感度
        conflict_keywords = {
            "争吵": -15, "打架": -20, "斗殴": -20, "冲突": -12,
            "吵架": -15, "争执": -10, "闹翻": -18, "不合": -8,
            "矛盾": -10, "冷战": -8
        }
        # 合作类关键词 → 提升好感度
        coop_keywords = {
            "合作": +8, "帮助": +6, "一起": +5, "共同": +5,
            "团建": +7, "聚餐": +6, "庆祝": +5, "配合": +6,
            "支持": +5, "鼓励": +4
        }

        # 检查事件中涉及的 NPC
        mentioned_npcs = [n for n in npc_names if n in event_text]

        # 对事件中提到的每对 NPC 调整好感度
        for i, a in enumerate(mentioned_npcs):
            for b in mentioned_npcs[i + 1:]:
                delta = 0
                reason = ""

                for kw, val in conflict_keywords.items():
                    if kw in event_text:
                        delta = val
                        reason = f"事件冲突'{kw}'"
                        break

                if delta == 0:
                    for kw, val in coop_keywords.items():
                        if kw in event_text:
                            delta = val
                            reason = f"事件合作'{kw}'"
                            break

                if delta != 0:
                    self.update_npc_npc_affinity(a, b, delta)
                    print(f"  📰 事件驱动好感度: {a}↔{b} {reason} → Δ{delta:+.0f}")

    def on_timeline_event(self, event_text: str, npc_names: List[str]):
        """当时间线事件变更时调用，自动调整NPC间好感度"""
        if event_text:
            self.apply_event_affinity(event_text, npc_names)

    def get_all_affinities(self, player_id: str = "player") -> Dict[str, Dict]:
        """获取所有NPC的好感度信息
        
        Args:
            player_id: 玩家ID
            
        Returns:
            所有NPC的好感度信息
        """
        result = {}
        for npc_name in self.affinity_scores:
            affinity = self.get_affinity(npc_name, player_id)
            result[npc_name] = {
                "affinity": affinity,
                "level": self.get_affinity_level(affinity),
                "modifier": self.get_affinity_modifier(affinity)
            }
        return result

    def _save_to_disk(self):
        """将好感度持久化到 JSON 文件"""
        try:
            import os
            os.makedirs('data', exist_ok=True)
            with open('data/affinity.json', 'w', encoding='utf-8') as f:
                json.dump({
                    "affinity_scores": self.affinity_scores,
                    "npc_npc_affinity": self.npc_npc_affinity,
                }, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"⚠️ 好感度持久化失败: {e}")

    def _load_from_disk(self):
        """从 JSON 文件加载好感度"""
        try:
            with open('data/affinity.json', 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.affinity_scores = data.get("affinity_scores", {})
                self.npc_npc_affinity = data.get("npc_npc_affinity", {})
                print(f"📂 已从磁盘加载好感度数据 ({len(self.affinity_scores)} 个 NPC)")
        except FileNotFoundError:
            pass
        except (json.JSONDecodeError, Exception) as e:
            print(f"⚠️ 好感度加载失败: {e}")
