"""时间线管理系统 - 多时间线 + 每日事件管理"""

import os
import json
import shutil
from datetime import datetime
from typing import Dict, List, Optional
from uuid import uuid4


class TimelineManager:
    """时间线管理器

    规则:
    - 多时间线并行，相同初始状态
    - 每天只能编写一个事件
    - 只能覆盖不能删除（无 DELETE 接口）
    - 只能编辑 current_day，历史天不可修改
    - 推进天数不可逆
    """

    MAX_EVENT_LENGTH = 200  # 事件最大字数
    DATA_DIR = os.path.join(os.path.dirname(__file__), "timeline_data")

    def __init__(self):
        os.makedirs(self.DATA_DIR, exist_ok=True)
        self._active_timeline_id: Optional[str] = None
        self._load_active()

    # ==================== Timeline CRUD ====================

    def create_timeline(self, name: str) -> dict:
        """创建新时间线"""
        tid = uuid4().hex[:8]
        timeline = {
            "id": tid,
            "name": name,
            "created_at": datetime.now().isoformat(),
            "current_day": 0,  # Day 0 = 初始状态，advance 后进入 Day 1
            "events": {}
        }
        self._save_timeline(tid, timeline)

        # 首个时间线自动设为活跃
        if self._active_timeline_id is None:
            self._active_timeline_id = tid
            self._save_active()

        return timeline

    def list_timelines(self) -> List[dict]:
        """列出所有时间线"""
        timelines = []
        for fname in os.listdir(self.DATA_DIR):
            if fname.endswith(".json") and not fname.endswith(".bak") and not fname.endswith(".tmp"):
                try:
                    path = os.path.join(self.DATA_DIR, fname)
                    with open(path, "r", encoding="utf-8") as f:
                        t = json.load(f)
                    timelines.append({
                        "id": t["id"],
                        "name": t["name"],
                        "current_day": t["current_day"],
                        "created_at": t["created_at"],
                        "event_count": len(t.get("events", {}))
                    })
                except (json.JSONDecodeError, KeyError):
                    continue
        # 按创建时间排序
        timelines.sort(key=lambda x: x["created_at"])
        return timelines

    def get_timeline(self, timeline_id: str) -> Optional[dict]:
        """获取时间线详情"""
        path = self._path(timeline_id)
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def get_active_timeline(self) -> Optional[dict]:
        """获取活跃时间线"""
        if self._active_timeline_id:
            return self.get_timeline(self._active_timeline_id)
        # Fallback: 返回第一个时间线
        timelines = self.list_timelines()
        if timelines:
            self._active_timeline_id = timelines[0]["id"]
            self._save_active()
            return self.get_timeline(self._active_timeline_id)
        return None

    def set_active_timeline(self, timeline_id: str) -> bool:
        """切换活跃时间线"""
        if not os.path.exists(self._path(timeline_id)):
            return False
        self._active_timeline_id = timeline_id
        self._save_active()
        return True

    # ==================== Event Operations ====================

    def set_today_event(self, timeline_id: str, content: str) -> dict:
        """设置今日事件（只允许 current_day）

        同一天重复写入 = 覆盖（update_count++）
        不允许编辑历史天
        """
        timeline = self.get_timeline(timeline_id)
        if timeline is None:
            raise ValueError(f"时间线 '{timeline_id}' 不存在")

        content = content.strip()[:self.MAX_EVENT_LENGTH]
        if not content:
            raise ValueError("事件内容不能为空")

        day = str(timeline["current_day"])
        if day == "0":
            raise ValueError("请先推进到第 1 天再编写事件（当前为初始状态 Day 0）")

        events = timeline.get("events", {})

        # 检查是否编辑历史天
        if day in events:
            # 同一天覆盖
            old_event = events[day]
            events[day] = {
                "content": content,
                "updated_at": datetime.now().isoformat(),
                "update_count": old_event.get("update_count", 1) + 1,
                "created_at": old_event.get("created_at", old_event.get("updated_at"))
            }
        else:
            # 新事件
            events[day] = {
                "content": content,
                "updated_at": datetime.now().isoformat(),
                "update_count": 1,
                "created_at": datetime.now().isoformat()
            }

        timeline["events"] = events
        self._save_timeline(timeline_id, timeline)
        return events[day]

    def get_today_event(self, timeline_id: str) -> Optional[dict]:
        """获取今日事件"""
        timeline = self.get_timeline(timeline_id)
        if timeline is None:
            return None
        day = str(timeline["current_day"])
        return timeline.get("events", {}).get(day)

    def get_event_context(self, timeline_id: Optional[str] = None) -> str:
        """获取今日事件文本，供 NPC prompt 注入使用"""
        tid = timeline_id or self._active_timeline_id
        if not tid:
            return ""

        event = self.get_today_event(tid)
        if event and event.get("content"):
            return event["content"]
        return ""

    def get_all_events(self, timeline_id: str) -> List[dict]:
        """获取所有事件（只读）"""
        timeline = self.get_timeline(timeline_id)
        if timeline is None:
            return []

        events = timeline.get("events", {})
        result = []
        for day_str, event in events.items():
            result.append({
                "day": int(day_str),
                "content": event["content"],
                "updated_at": event.get("updated_at", ""),
                "update_count": event.get("update_count", 1)
            })
        result.sort(key=lambda x: x["day"])
        return result

    def advance_day(self, timeline_id: str) -> dict:
        """推进到下一天（不可逆）"""
        timeline = self.get_timeline(timeline_id)
        if timeline is None:
            raise ValueError(f"时间线 '{timeline_id}' 不存在")

        old_day = timeline["current_day"]
        timeline["current_day"] = old_day + 1
        self._save_timeline(timeline_id, timeline)

        return {
            "timeline_id": timeline_id,
            "new_day": timeline["current_day"],
            "old_day": old_day,
            "message": f"已从第 {old_day} 天推进到第 {timeline['current_day']} 天"
        }

    # ==================== Internal Helpers ====================

    def _path(self, timeline_id: str) -> str:
        return os.path.join(self.DATA_DIR, f"{timeline_id}.json")

    def _backup_path(self, timeline_id: str) -> str:
        return os.path.join(self.DATA_DIR, f"{timeline_id}.json.bak")

    def _tmp_path(self, timeline_id: str) -> str:
        return os.path.join(self.DATA_DIR, f"{timeline_id}.json.tmp")

    def _save_timeline(self, timeline_id: str, data: dict):
        """原子保存时间线数据（带备份）"""
        path = self._path(timeline_id)
        tmp = self._tmp_path(timeline_id)
        bak = self._backup_path(timeline_id)

        # 先备份现有文件
        if os.path.exists(path):
            try:
                shutil.copy2(path, bak)
            except OSError:
                pass

        # 写入临时文件
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        # 原子替换
        os.replace(tmp, path)

        # 清理临时文件
        if os.path.exists(tmp):
            os.remove(tmp)

    def _load_active(self):
        """加载活跃时间线 ID"""
        active_file = os.path.join(self.DATA_DIR, ".active")
        if os.path.exists(active_file):
            try:
                with open(active_file, "r", encoding="utf-8") as f:
                    self._active_timeline_id = f.read().strip()
                # 验证时间线存在
                if not os.path.exists(self._path(self._active_timeline_id)):
                    self._active_timeline_id = None
            except Exception:
                self._active_timeline_id = None

    def _save_active(self):
        """保存活跃时间线 ID"""
        active_file = os.path.join(self.DATA_DIR, ".active")
        with open(active_file, "w", encoding="utf-8") as f:
            f.write(self._active_timeline_id or "")

    def validate_on_startup(self) -> bool:
        """启动时校验所有时间线 JSON 完整性"""
        ok = True
        for fname in os.listdir(self.DATA_DIR):
            if fname.endswith(".json") and not fname.endswith(".bak") and not fname.endswith(".tmp"):
                path = os.path.join(self.DATA_DIR, fname)
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        json.load(f)
                except (json.JSONDecodeError, IOError):
                    print(f"⚠️  时间线文件损坏: {fname}，尝试从备份恢复...")
                    bak = path + ".bak"
                    if os.path.exists(bak):
                        try:
                            shutil.copy2(bak, path)
                            print(f"✅ 已从备份恢复: {fname}")
                        except OSError:
                            print(f"❌ 恢复失败: {fname}")
                            ok = False
                    else:
                        print(f"❌ 无备份可用: {fname}")
                        ok = False
        return ok


# 全局单例
_timeline_manager = None


def get_timeline_manager() -> TimelineManager:
    """获取时间线管理器单例"""
    global _timeline_manager
    if _timeline_manager is None:
        _timeline_manager = TimelineManager()
        _timeline_manager.validate_on_startup()
    return _timeline_manager
