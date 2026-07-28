'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CPItem,
  TagAlias,
  TagGroup,
  ApiResponse,
  LegacyCPItem,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Heart,
  Eye,
  X,
  Trophy,
  Sparkles,
  Pencil,
  Save,
  Search,
} from 'lucide-react';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatNumber(num: number): string {
  return num.toLocaleString('zh-CN');
}

function getRankStyle(rank: number): string {
  if (rank === 1)
    return 'bg-gradient-to-r from-amber-200 to-yellow-300 text-amber-900';
  if (rank === 2)
    return 'bg-gradient-to-r from-slate-200 to-gray-300 text-slate-800';
  if (rank === 3)
    return 'bg-gradient-to-r from-orange-200 to-amber-200 text-orange-900';
  return 'bg-muted/50 text-muted-foreground';
}

function getRankEmoji(rank: number): string {
  if (rank === 1) return '\u{1F451}';
  if (rank === 2) return '\u{1F948}';
  if (rank === 3) return '\u{1F949}';
  return `${rank}`;
}

function parseTagInput(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/lofter\.com\/tag\/([^/?#]+)/);
  if (urlMatch) {
    return decodeURIComponent(urlMatch[1]);
  }
  return trimmed;
}

function calcGroupTotal(group: TagGroup): number {
  // 取别名中参与量最高的（避免重复计算，因为很多创作者会同时打多个标签）
  return group.aliases.reduce((max, a) => Math.max(max, a.joinedNum), 0);
}

function calcCPTotal(groups: TagGroup[]): number {
  // 取所有分组中参与量最高的标签（避免跨标签重复计算）
  return groups.reduce((max, g) => Math.max(max, calcGroupTotal(g)), 0);
}

// 旧数据迁移
function migrateLegacyData(legacy: LegacyCPItem): CPItem {
  return {
    id: legacy.id,
    displayName: legacy.displayName,
    isCombination: false,
    groups: [
      {
        id: generateId(),
        name: legacy.displayName,
        aliases: legacy.aliases,
      },
    ],
    totalJoinedNum: legacy.totalJoinedNum,
  };
}

// 确保已有数据有 isCombination 字段
function ensureIsCombination(cp: CPItem): CPItem {
  if (typeof cp.isCombination === 'boolean') return cp;
  return { ...cp, isCombination: false };
}

// ─── 编辑弹窗中的分组编辑状态 ───
interface EditGroupState {
  id: string;
  name: string;
  tags: string[]; // tag names being edited
}

// ─── 添加弹窗中的分组编辑状态 ───
interface AddGroupState {
  name: string;
  tags: string[];
}

export function CPRankingClient() {
  const [cps, setCps] = useState<CPItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshingCpId, setRefreshingCpId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [expandedCps, setExpandedCps] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set()
  );
  const [lastRefreshTime, setLastRefreshTime] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedCpId, setHighlightedCpId] = useState<string | null>(null);
  const [addError, setAddError] = useState('');
  const [forceAdd, setForceAdd] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<{ success: number; failed: number; lastTime: string } | null>(null);

  // ── 添加弹窗状态 ──
  const [newCpName, setNewCpName] = useState('');
  const [newIsCombination, setNewIsCombination] = useState(false);
  const [newGroups, setNewGroups] = useState<AddGroupState[]>([
    { name: '', tags: [''] },
  ]);
  const [newTags, setNewTags] = useState<string[]>(['']); // 非组合模式的简单标签列表

  // ── 编辑弹窗状态 ──
  const [editingCpId, setEditingCpId] = useState<string | null>(null);
  const [editCpName, setEditCpName] = useState('');
  const [editIsCombination, setEditIsCombination] = useState(false);
  const [editGroups, setEditGroups] = useState<EditGroupState[]>([]);

  // Load from database on mount
  useEffect(() => {
    loadFromDatabase();
  }, []);

  const migrateFromLocalStorage = useCallback(async () => {
    try {
      const raw = localStorage.getItem('cp-ranking-data');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      let oldCps: CPItem[] = [];
      if (Array.isArray(parsed)) {
        oldCps = parsed;
      } else if (parsed?.cps && Array.isArray(parsed.cps)) {
        oldCps = parsed.cps;
      }
      if (oldCps.length === 0) return;

      // Check if database already has data (avoid duplicate migration)
      const res = await fetch('/api/cp');
      const result = await res.json();
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        // Database already has data, skip migration
        localStorage.removeItem('cp-ranking-data');
        return;
      }

      // Import old data into database
      for (const cp of oldCps) {
        await fetch('/api/cp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: cp.displayName,
            is_combination: cp.isCombination ?? false,
            groups: cp.groups,
            total_joined_num: cp.totalJoinedNum,
          }),
        });
      }
      // Clear old localStorage data after successful migration
      localStorage.removeItem('cp-ranking-data');
    } catch {
      // ignore migration errors
    }
  }, []);

  const loadFromDatabase = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[加载] 开始从数据库加载数据...');
      // First try to migrate from localStorage
      await migrateFromLocalStorage();
      // Then load from database via API
      const res = await fetch('/api/cp');
      const result = await res.json();
      console.log('[加载] API 返回:', result.success, '数据条数:', result.data?.length);
      if (result.success && Array.isArray(result.data)) {
        const migrated = result.data.map((row: Record<string, unknown>) => {
          const rawGroups = JSON.parse((row.groups as string) || '[]');
          const cpItem = {
            id: row.id as string,
            displayName: row.display_name as string,
            isCombination: Boolean(row.is_combination),
            groups: rawGroups.map((g: Record<string, unknown>) => ({
              id: (g.id as string) || generateId(),
              name: (g.name as string) || '',
              aliases: ((g.aliases as Array<Record<string, unknown>>) || []).map((a) => ({
                tag: (a.tag as string) || '',
                joinedNum: Number(a.joinedNum) || 0,
                tagViewCount: Number(a.tagViewCount) || 0,
                lastUpdated: (a.lastUpdated as string) || '',
                error: a.error as string | undefined,
              })),
            })),
            totalJoinedNum: Number(row.total_joined_num) || 0,
          } as CPItem;
          console.log('[加载] CP:', cpItem.displayName, 'totalJoinedNum:', cpItem.totalJoinedNum);
          return cpItem;
        });
        setCps(migrated);
        console.log('[加载] 完成，共加载', migrated.length, '个CP');
      }
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [migrateFromLocalStorage]);

  const saveToDatabase = useCallback(async (cpItem: CPItem, method: 'POST' | 'PUT' = 'POST') => {
    try {
      const payload = {
        id: cpItem.id,
        display_name: cpItem.displayName,
        is_combination: cpItem.isCombination,
        groups: cpItem.groups,
        total_joined_num: cpItem.totalJoinedNum,
      };
      const url = method === 'POST' ? '/api/cp' : `/api/cp/${cpItem.id}`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.success) {
        if (method === 'POST') {
          // Update the temp ID with the real ID from database
          setCps(prev => prev.map(cp => cp.id === cpItem.id ? { ...cp, id: result.data.id } : cp));
        } else {
          setCps(prev => prev.map(cp => cp.id === cpItem.id ? cpItem : cp));
        }
        return { success: true, data: result.data };
      } else {
        console.error('Save failed:', result.error);
        return { success: false, error: result.error };
      }
    } catch (err) {
      console.error('Save error:', err);
      return { success: false, error: String(err) };
    }
  }, []);

  const deleteFromDatabase = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/cp/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (result.success) {
        setCps(prev => prev.filter(cp => cp.id !== id));
        return { success: true };
      } else {
        console.error('Delete failed:', result.error);
        return { success: false, error: result.error };
      }
    } catch (err) {
      console.error('Delete error:', err);
      return { success: false, error: String(err) };
    }
  }, []);

  // 批量获取tag数据（带10秒超时）
  const refreshTags = useCallback(
    async (tags: string[]): Promise<TagAlias[]> => {
      if (tags.length === 0) return [];
      const query = tags.map(encodeURIComponent).join(',');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      try {
        const res = await fetch(`/api/refresh?tags=${query}`, {
          signal: controller.signal
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: ApiResponse = await res.json();
        if (!json.success) throw new Error(json.error || 'API error');
        return json.data;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('请求超时（10秒）');
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    []
  );

  // 刷新单个CP的所有tag
  const refreshOneCP = useCallback(
    async (cp: CPItem): Promise<CPItem> => {
      const allTags = cp.groups.flatMap((g) => g.aliases.map((a) => a.tag));
      const uniqueTags = [...new Set(allTags)];
      
      if (uniqueTags.length === 0) return cp;
      
      const results = await refreshTags(uniqueTags);
      
      // 调试日志 - 显示每个tag的joinedNum
      const resultSummary = results.map(r => `${r.tag}:${r.joinedNum}${r.error ? '(错误:'+r.error+')' : ''}`).join(', ');
      console.log('[API 返回]', cp.displayName, '→', resultSummary);
      
      // 构建 tag -> result 的映射
      const tagMap = new Map<string, TagAlias>();
      results.forEach((r) => {
        if (r && r.tag) {
          tagMap.set(r.tag, r);
        }
      });

      const updatedGroups = cp.groups.map((g) => ({
        ...g,
        aliases: g.aliases.map((a) => {
          const fresh = tagMap.get(a.tag);
          // 只有当 fresh 存在、没有错误、且 joinedNum > 0 时才使用新数据
          // 避免 LOFTER 临时返回 0 覆盖数据库里的正确数据
          if (fresh && !fresh.error && fresh.joinedNum > 0) {
            return fresh;
          }
          // 完全保留旧数据（包括 lastUpdated），不更新时间戳
          // 这样下次刷新时会重新尝试获取这个标签
          return a;
        }),
      }));

      // 检查是否有任何标签获取到了新数据
      const hasNewData = updatedGroups.some((g) =>
        g.aliases.some((a, idx) => {
          const oldAlias = cp.groups.find((og) => og.id === g.id)?.aliases[idx];
          return oldAlias && a.joinedNum !== oldAlias.joinedNum;
        })
      );

      // 只有获取到新数据时才返回更新后的 CP，否则返回原始 CP（不保存）
      if (!hasNewData) {
        console.log('[刷新] 未获取到新数据，跳过保存:', cp.displayName);
        return cp;
      }

      return {
        ...cp,
        groups: updatedGroups,
        totalJoinedNum: calcCPTotal(updatedGroups),
      };
    },
    [refreshTags]
  );

  // 刷新全部（带60秒全局超时）
  const handleRefreshAll = useCallback(async () => {
    if (cps.length === 0) return;
    setLoading(true);
    setRefreshStatus(null);
    
    // 60秒全局超时，强制清除loading状态
    const globalTimeout = setTimeout(() => {
      console.error('[refresh] 全局超时（60秒），强制清除loading状态');
      setLoading(false);
      setRefreshStatus({ success: 0, failed: cps.length, lastTime: new Date().toLocaleTimeString() });
    }, 60000);
    
    try {
      // 串行处理每个 CP，避免并发请求触发 LOFTER 速率限制
      const updated: CPItem[] = [];
      let successCount = 0;
      let failedCount = 0;
      
      for (let i = 0; i < cps.length; i++) {
        try {
          const refreshed = await refreshOneCP(cps[i]);
          updated.push(refreshed);
          
          // 立即保存到数据库
          const saveResult = await saveToDatabase(refreshed, 'PUT');
          if (saveResult.success) {
            successCount++;
          } else {
            failedCount++;
            console.error(`Failed to save CP "${refreshed.displayName}":`, saveResult.error);
          }
        } catch (err) {
          console.error(`Failed to refresh CP "${cps[i].displayName}":`, err);
          updated.push(cps[i]); // 保留旧数据
          failedCount++;
        }
        
        // CP 之间间隔 500ms，进一步降低并发压力
        if (i < cps.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      updated.sort((a, b) => b.totalJoinedNum - a.totalJoinedNum);
      setCps(updated);
      setRefreshStatus({ success: successCount, failed: failedCount, lastTime: new Date().toLocaleTimeString() });
    } catch (err) {
      console.error('Refresh all failed:', err);
      setRefreshStatus({ success: 0, failed: cps.length, lastTime: new Date().toLocaleTimeString() });
    } finally {
      clearTimeout(globalTimeout);
      setLoading(false);
    }
  }, [cps, refreshOneCP, saveToDatabase]);

  // 刷新单个
  const handleRefreshSingle = useCallback(
    async (cpId: string) => {
      const cp = cps.find((c) => c.id === cpId);
      if (!cp) return;
      setRefreshingCpId(cpId);
      try {
        const updated = await refreshOneCP(cp);
        const updatedCps = cps
          .map((c) => (c.id === cpId ? updated : c))
          .sort((a, b) => b.totalJoinedNum - a.totalJoinedNum);
        setCps(updatedCps);
        const result = await saveToDatabase(updated, 'PUT');
        if (result.success) {
          setRefreshStatus({ success: 1, failed: 0, lastTime: new Date().toLocaleTimeString() });
        } else {
          console.error(`Failed to save refreshed CP "${cp.displayName}":`, result.error);
          setRefreshStatus({ success: 0, failed: 1, lastTime: new Date().toLocaleTimeString() });
        }
      } catch (err) {
        console.error('Refresh single failed:', err);
        setRefreshStatus({ success: 0, failed: 1, lastTime: new Date().toLocaleTimeString() });
      } finally {
        setRefreshingCpId(null);
      }
    },
    [cps, refreshOneCP, saveToDatabase]
  );

  // ── 添加CP ──
  const handleAddCP = useCallback(async () => {
    const name = newCpName.trim();
    if (!name) return;
    setAddError('');

    // 收集本次要添加的所有tag
    const incomingTags: string[] = [];
    if (newIsCombination) {
      newGroups.forEach((g) => {
        g.tags.forEach((t) => {
          const parsed = parseTagInput(t);
          if (parsed) incomingTags.push(parsed);
        });
      });
    } else {
      newTags.forEach((t) => {
        const parsed = parseTagInput(t);
        if (parsed) incomingTags.push(parsed);
      });
    }

    // 重复检测：检查CP名称
    if (!forceAdd) {
      const nameConflict = cps.find(
        (c) => c.displayName.toLowerCase() === name.toLowerCase()
      );
      if (nameConflict) {
        setAddError(`已存在同名CP「${nameConflict.displayName}」`);
        return;
      }

      // 重复检测：检查标签别名是否与已有CP重复
      const existingTagMap = new Map<string, string>(); // tag -> CP displayName
      cps.forEach((c) => {
        c.groups.forEach((g) => {
          g.aliases.forEach((a) => {
            existingTagMap.set(a.tag.toLowerCase(), c.displayName);
          });
        });
      });

      const duplicateTags = incomingTags.filter((t) =>
        existingTagMap.has(t.toLowerCase())
      );
      if (duplicateTags.length > 0) {
        const dupDetails = duplicateTags
          .map(
            (t) =>
              `「${t}」已在CP「${existingTagMap.get(t.toLowerCase())}」中`
          )
          .join('；');
        setAddError(`标签重复：${dupDetails}。再次点击「添加」可强制添加。`);
        return;
      }
    }
    setForceAdd(false);

    let groups: TagGroup[];

    if (newIsCombination) {
      // 组合模式：使用分组
      const validGroups = newGroups
        .filter((g) => g.name.trim() && g.tags.some((t) => t.trim()))
        .map((g) => ({
          name: g.name.trim(),
          tags: g.tags.map(parseTagInput).filter(Boolean),
        }));
      if (validGroups.length === 0) return;

      setLoading(true);
      try {
        const allTags = validGroups.flatMap((g) => g.tags);
        const results = await refreshTags([...new Set(allTags)]);
        const tagMap = new Map<string, TagAlias>();
        results.forEach((r) => tagMap.set(r.tag, r));

        groups = validGroups.map((g) => ({
          id: generateId(),
          name: g.name,
          aliases: g.tags.map((tag) => {
            const data = tagMap.get(tag);
            return (
              data || {
                tag,
                joinedNum: 0,
                tagViewCount: 0,
                lastUpdated: new Date().toISOString(),
                error: '获取失败',
              }
            );
          }),
        }));
      } catch {
        setLoading(false);
        return;
      }
    } else {
      // 非组合模式：简单标签列表
      const validTags = newTags.map(parseTagInput).filter(Boolean);
      if (validTags.length === 0) return;

      setLoading(true);
      try {
        const results = await refreshTags([...new Set(validTags)]);
        const tagMap = new Map<string, TagAlias>();
        results.forEach((r) => tagMap.set(r.tag, r));

        groups = [
          {
            id: generateId(),
            name: name,
            aliases: validTags.map((tag) => {
              const data = tagMap.get(tag);
              return (
                data || {
                  tag,
                  joinedNum: 0,
                  tagViewCount: 0,
                  lastUpdated: new Date().toISOString(),
                  error: '获取失败',
                }
              );
            }),
          },
        ];
      } catch {
        setLoading(false);
        return;
      }
    }

    const newCp: CPItem = {
      id: generateId(),
      displayName: name,
      isCombination: newIsCombination,
      groups,
      totalJoinedNum: calcCPTotal(groups),
    };

    const updatedCps = [...cps, newCp].sort(
      (a, b) => b.totalJoinedNum - a.totalJoinedNum
    );
    setCps(updatedCps);
    await saveToDatabase(newCp, 'POST');

    setNewCpName('');
    setNewIsCombination(false);
    setNewGroups([{ name: '', tags: [''] }]);
    setNewTags(['']);
    setAddDialogOpen(false);
    setLoading(false);
  }, [newCpName, newIsCombination, newGroups, newTags, cps, refreshTags, saveToDatabase]);

  // ── 打开编辑弹窗 ──
  const openEditDialog = useCallback((cp: CPItem) => {
    setEditingCpId(cp.id);
    setEditCpName(cp.displayName);
    setEditIsCombination(cp.isCombination);
    setEditGroups(
      cp.groups.map((g) => ({
        id: g.id,
        name: g.name,
        tags: g.aliases.map((a) => a.tag),
      }))
    );
    setEditDialogOpen(true);
  }, []);

  // ── 保存编辑 ──
  const handleSaveEdit = useCallback(async () => {
    if (!editingCpId) return;
    const name = editCpName.trim();
    if (!name) return;

    let groups: TagGroup[];

    if (editIsCombination) {
      const validGroups = editGroups
        .filter((g) => g.name.trim() && g.tags.some((t) => t.trim()))
        .map((g) => ({
          id: g.id,
          name: g.name.trim(),
          tags: g.tags.map(parseTagInput).filter(Boolean),
        }));
      if (validGroups.length === 0) return;

      setLoading(true);
      try {
        const allTags = validGroups.flatMap((g) => g.tags);
        const results = await refreshTags([...new Set(allTags)]);
        const tagMap = new Map<string, TagAlias>();
        results.forEach((r) => tagMap.set(r.tag, r));

        groups = validGroups.map((g) => ({
          id: g.id,
          name: g.name,
          aliases: g.tags.map((tag) => {
            const data = tagMap.get(tag);
            return (
              data || {
                tag,
                joinedNum: 0,
                tagViewCount: 0,
                lastUpdated: new Date().toISOString(),
                error: '获取失败',
              }
            );
          }),
        }));
      } catch {
        setLoading(false);
        return;
      }
    } else {
      // 非组合模式：将所有分组的标签合并为一个分组
      const allTags = editGroups
        .flatMap((g) => g.tags)
        .map(parseTagInput)
        .filter(Boolean);
      if (allTags.length === 0) return;

      setLoading(true);
      try {
        const results = await refreshTags([...new Set(allTags)]);
        const tagMap = new Map<string, TagAlias>();
        results.forEach((r) => tagMap.set(r.tag, r));

        groups = [
          {
            id: editGroups[0]?.id || generateId(),
            name: name,
            aliases: allTags.map((tag) => {
              const data = tagMap.get(tag);
              return (
                data || {
                  tag,
                  joinedNum: 0,
                  tagViewCount: 0,
                  lastUpdated: new Date().toISOString(),
                  error: '获取失败',
                }
              );
            }),
          },
        ];
      } catch {
        setLoading(false);
        return;
      }
    }

    const updatedCp: CPItem = {
      id: editingCpId,
      displayName: name,
      isCombination: editIsCombination,
      groups,
      totalJoinedNum: calcCPTotal(groups),
    };

    const updatedCps = cps
      .map((c) => (c.id === editingCpId ? updatedCp : c))
      .sort((a, b) => b.totalJoinedNum - a.totalJoinedNum);
    setCps(updatedCps);
    await saveToDatabase(updatedCp, 'PUT');

    setEditDialogOpen(false);
    setEditingCpId(null);
    setLoading(false);
  }, [editingCpId, editCpName, editIsCombination, editGroups, cps, refreshTags, saveToDatabase]);

  // ── 删除CP ──
  const handleDeleteCP = useCallback(
    async (cpId: string) => {
      const updatedCps = cps.filter((c) => c.id !== cpId);
      setCps(updatedCps);
      await deleteFromDatabase(cpId);
    },
    [cps, deleteFromDatabase]
  );

  // ── 展开/折叠 ──
  const toggleCP = useCallback((cpId: string) => {
    setExpandedCps((prev) => {
      const next = new Set(prev);
      if (next.has(cpId)) next.delete(cpId);
      else next.add(cpId);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8f0ff] via-[#fef0f5] to-[#f0f4ff]">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/70 border-b border-purple-100/50">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
                ES CP热度排行榜
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {loading ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLoading(false);
                    setRefreshStatus({ success: 0, failed: 0, lastTime: new Date().toLocaleTimeString() + ' (已取消)' });
                  }}
                  className="border-red-200 text-red-600 hover:bg-red-50 rounded-full"
                >
                  <X className="w-4 h-4 mr-1" />
                  取消
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshAll}
                  disabled={cps.length === 0}
                  className="border-purple-200 text-purple-600 hover:bg-purple-50 rounded-full"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  刷新
                </Button>
              )}
              {refreshStatus && (
                <span className={`text-xs px-2 py-1 rounded-full ${
                  refreshStatus.failed === 0 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {refreshStatus.failed === 0 
                    ? `✓ 已更新 ${refreshStatus.success} 个CP (${refreshStatus.lastTime})`
                    : `✓ ${refreshStatus.success} 成功, ✗ ${refreshStatus.failed} 失败 (${refreshStatus.lastTime})`
                  }
                </span>
              )}
              <Dialog
                open={addDialogOpen}
                onOpenChange={(open) => {
                  setAddDialogOpen(open);
                  if (!open) {
                    setAddError('');
                    setForceAdd(false);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-full shadow-sm"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    添加CP
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg rounded-2xl border-purple-100 max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-lg font-bold text-foreground">
                      添加新CP
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground text-sm">
                      输入CP名称，添加标签。如果是组合名（如"狮心组"），可勾选后分别添加左右位分组。
                    </DialogDescription>
                  </DialogHeader>
                  <AddCPForm
                    cpName={newCpName}
                    setCpName={setNewCpName}
                    isCombination={newIsCombination}
                    setIsCombination={setNewIsCombination}
                    groups={newGroups}
                    setGroups={setNewGroups}
                    tags={newTags}
                    setTags={setNewTags}
                  />
                  {addError && (
                    <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                      {addError}
                    </div>
                  )}
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setAddDialogOpen(false)}
                      className="rounded-full border-purple-200"
                    >
                      取消
                    </Button>
                    <Button
                      onClick={handleAddCP}
                      disabled={
                        loading ||
                        !newCpName.trim() ||
                        (newIsCombination
                          ? !newGroups.some(
                              (g) => g.name.trim() && g.tags.some((t) => t.trim())
                            )
                          : !newTags.some((t) => t.trim()))
                      }
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-full"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4 mr-1" />
                      )}
                      添加
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          {lastRefreshTime && (
            <p className="text-xs text-muted-foreground mt-1">
              上次刷新：{new Date(lastRefreshTime).toLocaleString('zh-CN')}
            </p>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* 搜索栏 */}
        {cps.length > 0 && (
          <div className="mb-4 relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索CP名称或标签..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setSearchQuery(e.target.value);
                  setHighlightedCpId(null);
                }}
                className="pl-9 rounded-full border-purple-100 bg-white/80 backdrop-blur-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setHighlightedCpId(null);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* 搜索结果提示 */}
            {searchQuery && (
              <div className="mt-2 text-sm text-muted-foreground">
                {(() => {
                  const q = searchQuery.toLowerCase();
                  const matched = cps.filter(
                    (cp) =>
                      cp.displayName.toLowerCase().includes(q) ||
                      cp.groups.some((g) =>
                        g.aliases.some((a) =>
                          a.tag.toLowerCase().includes(q)
                        )
                      )
                  );
                  if (matched.length === 0) {
                    return <span>未找到匹配的CP</span>;
                  }
                  return (
                    <span>
                      找到 {matched.length} 个匹配CP
                      {matched.length <= 3 &&
                        matched.map((cp, i) => {
                          const rank = cps.indexOf(cp) + 1;
                          return (
                            <span key={cp.id}>
                              {i > 0 && '、'}
                              <button
                                onClick={() => {
                                  setHighlightedCpId(cp.id);
                                  const el = document.getElementById(
                                    `cp-row-${cp.id}`
                                  );
                                  el?.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center',
                                  });
                                }}
                                className="text-purple-600 hover:underline mx-0.5"
                              >
                                {cp.displayName}（第{rank}名）
                              </button>
                            </span>
                          );
                        })}
                    </span>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {cps.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
              <Heart className="w-10 h-10 text-purple-300" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">
              还没有添加任何CP
            </h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
              点击上方「添加CP」按钮，开始追踪你喜欢的CP热度吧
            </p>
            <Button
              onClick={() => setAddDialogOpen(true)}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-full"
            >
              <Plus className="w-4 h-4 mr-1" />
              添加第一个CP
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {(() => {
              const q = searchQuery.toLowerCase();
              const filteredCps = q
                ? cps.filter(
                    (cp) =>
                      cp.displayName.toLowerCase().includes(q) ||
                      cp.groups.some((g) =>
                        g.aliases.some((a) =>
                          a.tag.toLowerCase().includes(q)
                        )
                      )
                  )
                : cps;

              return filteredCps.map((cp) => {
                const index = cps.indexOf(cp);
                const rank = index + 1;
                const isExpanded = expandedCps.has(cp.id);
                const isRefreshing = refreshingCpId === cp.id;
                const isHighlighted = highlightedCpId === cp.id;

              return (
                <div
                  key={cp.id}
                  id={`cp-row-${cp.id}`}
                  className={`bg-white/80 backdrop-blur-sm rounded-2xl border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden ${
                    isHighlighted
                      ? 'border-purple-400 ring-2 ring-purple-200 shadow-purple-100'
                      : 'border-purple-100/50'
                  }`}
                >
                  {/* 主行 */}
                  <div className="flex items-center px-4 py-3.5">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${getRankStyle(rank)}`}
                    >
                      {rank <= 3 ? (
                        <span className="text-base">
                          {getRankEmoji(rank)}
                        </span>
                      ) : (
                        rank
                      )}
                    </div>

                    <div className="ml-3 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-foreground truncate">
                          {cp.displayName}
                        </span>
                        {cp.isCombination && cp.groups.length > 1 && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4 rounded-full"
                          >
                            组合
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-sm font-semibold text-[#c9a86c]">
                          {formatNumber(cp.totalJoinedNum)} 参与
                        </span>
                        {cp.groups.reduce((sum, g) => sum + g.aliases.length, 0) >= 2 && (
                          <button
                            onClick={() => toggleCP(cp.id)}
                            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-purple-500 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            {cp.isCombination ? '分组明细' : '别名明细'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-muted-foreground hover:text-purple-500 hover:bg-purple-50"
                        onClick={() => openEditDialog(cp)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-muted-foreground hover:text-purple-500 hover:bg-purple-50"
                        onClick={() => handleRefreshSingle(cp.id)}
                        disabled={isRefreshing}
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-8 h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteCP(cp.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* 展开的明细 */}
                  {isExpanded && (
                    <div className="px-4 pb-3 pt-0">
                      <div className="ml-11 space-y-2 border-t border-purple-50 pt-2">
                        {cp.isCombination ? (
                          /* 组合模式：两级层次结构 */
                          cp.groups
                            .slice()
                            .sort(
                              (a, b) => calcGroupTotal(b) - calcGroupTotal(a)
                            )
                            .map((group) => {
                              const groupTotal = calcGroupTotal(group);
                              const isGroupExpanded = expandedGroups.has(
                                group.id
                              );
                              const hasMultipleAliases =
                                group.aliases.length > 1;

                              return (
                                <div key={group.id}>
                                  {/* 分组标题行 */}
                                  <div className="flex items-center justify-between py-1">
                                    <div className="flex items-center gap-1.5">
                                      {hasMultipleAliases ? (
                                        <button
                                          onClick={() =>
                                            toggleGroup(group.id)
                                          }
                                          className="flex items-center gap-1 text-sm font-medium text-foreground/90 hover:text-purple-600 transition-colors"
                                        >
                                          {isGroupExpanded ? (
                                            <ChevronDown className="w-3.5 h-3.5 text-purple-400" />
                                          ) : (
                                            <ChevronRight className="w-3.5 h-3.5 text-purple-400" />
                                          )}
                                          {group.name}
                                        </button>
                                      ) : (
                                        <span className="text-sm font-medium text-foreground/90 ml-5">
                                          {group.name}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <Heart className="w-3 h-3 text-pink-300" />
                                        {formatNumber(groupTotal)}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        <Eye className="w-3 h-3 text-blue-300" />
                                        {formatNumber(
                                          group.aliases.reduce(
                                            (max, a) => Math.max(max, a.tagViewCount),
                                            0
                                          )
                                        )}
                                      </span>
                                    </div>
                                  </div>

                                  {/* 展开的别名列表 */}
                                  {isGroupExpanded && hasMultipleAliases && (
                                    <div className="ml-5 pl-3 border-l-2 border-purple-100 space-y-1 mt-1 mb-1">
                                      {group.aliases
                                        .slice()
                                        .sort(
                                          (a, b) =>
                                            b.joinedNum - a.joinedNum
                                        )
                                        .map((alias) => (
                                          <div
                                            key={alias.tag}
                                            className="flex items-center justify-between text-xs py-0.5"
                                          >
                                            <span className="text-foreground/70">
                                              {alias.tag}
                                              {alias.error && (
                                                <span className="ml-1 text-amber-500">
                                                  !
                                                </span>
                                              )}
                                            </span>
                                            <div className="flex items-center gap-3 text-muted-foreground">
                                              <span className="flex items-center gap-1">
                                                <Heart className="w-2.5 h-2.5 text-pink-200" />
                                                {formatNumber(
                                                  alias.joinedNum
                                                )}
                                              </span>
                                              <span className="flex items-center gap-1">
                                                <Eye className="w-2.5 h-2.5 text-blue-200" />
                                                {formatNumber(
                                                  alias.tagViewCount
                                                )}
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                        ) : (
                          /* 非组合模式：扁平别名列表 */
                          <div className="space-y-1">
                            {cp.groups
                              .flatMap((g) => g.aliases)
                              .slice()
                              .sort((a, b) => b.joinedNum - a.joinedNum)
                              .map((alias) => (
                                <div
                                  key={alias.tag}
                                  className="flex items-center justify-between text-sm py-1"
                                >
                                  <span className="text-foreground/80">
                                    {alias.tag}
                                    {alias.error && (
                                      <span className="ml-1 text-amber-500 text-xs">
                                        !
                                      </span>
                                    )}
                                  </span>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Heart className="w-3 h-3 text-pink-300" />
                                      {formatNumber(alias.joinedNum)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Eye className="w-3 h-3 text-blue-300" />
                                      {formatNumber(alias.tagViewCount)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                        {cp.groups[0]?.aliases[0]?.lastUpdated && (
                          <p className="text-[10px] text-muted-foreground/60 pt-1">
                            更新于{' '}
                            {new Date(
                              cp.groups[0].aliases[0].lastUpdated
                            ).toLocaleString('zh-CN')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
              });
            })()}

            <div className="text-center py-4">
              <p className="text-xs text-muted-foreground">
                <Trophy className="w-3 h-3 inline mr-1" />
                共 {cps.length} 对CP · 统计口径：取最高标签热度{' '}
                {formatNumber(
                  cps.reduce((sum, cp) => sum + cp.totalJoinedNum, 0)
                )}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* 编辑弹窗 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl border-purple-100 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">
              编辑CP
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              修改CP名称和标签。保存后会自动刷新数据。
            </DialogDescription>
          </DialogHeader>
          <EditCPForm
            cpName={editCpName}
            setCpName={setEditCpName}
            isCombination={editIsCombination}
            setIsCombination={setEditIsCombination}
            groups={editGroups}
            setGroups={setEditGroups}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              className="rounded-full border-purple-200"
            >
              取消
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={
                loading ||
                !editCpName.trim() ||
                (editIsCombination
                  ? !editGroups.some(
                      (g) => g.name.trim() && g.tags.some((t) => t.trim())
                    )
                  : !editGroups.some((g) => g.tags.some((t) => t.trim())))
              }
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white rounded-full"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════
// 添加CP表单
// ═══════════════════════════════════════
function AddCPForm({
  cpName,
  setCpName,
  isCombination,
  setIsCombination,
  groups,
  setGroups,
  tags,
  setTags,
}: {
  cpName: string;
  setCpName: (v: string) => void;
  isCombination: boolean;
  setIsCombination: (v: boolean) => void;
  groups: AddGroupState[];
  setGroups: (g: AddGroupState[]) => void;
  tags: string[];
  setTags: (t: string[]) => void;
}) {
  const addGroup = () => {
    setGroups([...groups, { name: '', tags: [''] }]);
  };

  const removeGroup = (index: number) => {
    const updated = groups.filter((_, i) => i !== index);
    setGroups(updated.length === 0 ? [{ name: '', tags: [''] }] : updated);
  };

  const updateGroupName = (index: number, name: string) => {
    const updated = [...groups];
    updated[index] = { ...updated[index], name };
    setGroups(updated);
  };

  const addTag = (groupIndex: number) => {
    const updated = [...groups];
    updated[groupIndex] = {
      ...updated[groupIndex],
      tags: [...updated[groupIndex].tags, ''],
    };
    setGroups(updated);
  };

  const removeTag = (groupIndex: number, tagIndex: number) => {
    const updated = [...groups];
    const newTags = updated[groupIndex].tags.filter((_, i) => i !== tagIndex);
    updated[groupIndex] = {
      ...updated[groupIndex],
      tags: newTags.length === 0 ? [''] : newTags,
    };
    setGroups(updated);
  };

  const updateTag = (groupIndex: number, tagIndex: number, value: string) => {
    const updated = [...groups];
    const newTags = [...updated[groupIndex].tags];
    newTags[tagIndex] = value;
    updated[groupIndex] = { ...updated[groupIndex], tags: newTags };
    setGroups(updated);
  };

  // 非组合模式的标签操作
  const addSimpleTag = () => {
    setTags([...tags, '']);
  };

  const removeSimpleTag = (index: number) => {
    const updated = tags.filter((_, i) => i !== index);
    setTags(updated.length === 0 ? [''] : updated);
  };

  const updateSimpleTag = (index: number, value: string) => {
    const updated = [...tags];
    updated[index] = value;
    setTags(updated);
  };

  return (
    <div className="space-y-4 py-2">
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">
          CP名称
        </label>
        <Input
          placeholder="如：ひめこは / 狮心组"
          value={cpName}
          onChange={(e) => setCpName(e.target.value)}
          className="border-purple-200 focus:border-purple-400 focus:ring-purple-200 rounded-lg"
        />
      </div>

      <div className="flex items-center gap-2 p-3 rounded-xl border border-purple-100 bg-purple-50/30">
        <input
          type="checkbox"
          id="isCombination"
          checked={isCombination}
          onChange={(e) => setIsCombination(e.target.checked)}
          className="w-4 h-4 rounded border-purple-300 text-purple-500 focus:ring-purple-200"
        />
        <label htmlFor="isCombination" className="text-sm text-foreground cursor-pointer">
          这是组合名（如"狮心组"），需要区分左右位分组
        </label>
      </div>

      {isCombination ? (
        /* 组合模式：分组管理 */
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">
            标签分组
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            添加组合tag、左位、右位等分组，每个分组下可添加多个标签别名
          </p>
          <div className="space-y-3">
            {groups.map((group, gi) => (
              <div
                key={gi}
                className="p-3 rounded-xl border border-purple-100 bg-purple-50/30 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="分组名称（如：组合 / 雷泉 / 泉雷）"
                    value={group.name}
                    onChange={(e) => updateGroupName(gi, e.target.value)}
                    className="border-purple-200 focus:border-purple-400 focus:ring-purple-200 rounded-lg text-sm"
                  />
                  {groups.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeGroup(gi)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {group.tags.map((tag, ti) => (
                    <div key={ti} className="flex gap-2">
                      <Input
                        placeholder="标签名或LOFTER链接"
                        value={tag}
                        onChange={(e) => updateTag(gi, ti, e.target.value)}
                        className="border-purple-200 focus:border-purple-400 focus:ring-purple-200 rounded-lg text-sm"
                      />
                      {group.tags.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeTag(gi, ti)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addTag(gi)}
                  className="text-purple-500 hover:text-purple-600 hover:bg-purple-50 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  添加别名
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={addGroup}
            className="mt-2 text-purple-500 hover:text-purple-600 hover:bg-purple-50"
          >
            <Plus className="w-3 h-3 mr-1" />
            添加分组
          </Button>
        </div>
      ) : (
        /* 非组合模式：简单标签列表 */
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">
            标签别名
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            添加该CP的所有标签名或LOFTER链接，参与量取最高的一项
          </p>
          <div className="space-y-1.5">
            {tags.map((tag, ti) => (
              <div key={ti} className="flex gap-2">
                <Input
                  placeholder="标签名或LOFTER链接"
                  value={tag}
                  onChange={(e) => updateSimpleTag(ti, e.target.value)}
                  className="border-purple-200 focus:border-purple-400 focus:ring-purple-200 rounded-lg text-sm"
                />
                {tags.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeSimpleTag(ti)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={addSimpleTag}
            className="mt-2 text-purple-500 hover:text-purple-600 hover:bg-purple-50 text-xs"
          >
            <Plus className="w-3 h-3 mr-1" />
            添加别名
          </Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// 编辑CP表单
// ═══════════════════════════════════════
function EditCPForm({
  cpName,
  setCpName,
  isCombination,
  setIsCombination,
  groups,
  setGroups,
}: {
  cpName: string;
  setCpName: (v: string) => void;
  isCombination: boolean;
  setIsCombination: (v: boolean) => void;
  groups: EditGroupState[];
  setGroups: (g: EditGroupState[]) => void;
}) {
  const addGroup = () => {
    setGroups([...groups, { id: generateId(), name: '', tags: [''] }]);
  };

  const removeGroup = (index: number) => {
    const updated = groups.filter((_, i) => i !== index);
    setGroups(
      updated.length === 0
        ? [{ id: generateId(), name: '', tags: [''] }]
        : updated
    );
  };

  const updateGroupName = (index: number, name: string) => {
    const updated = [...groups];
    updated[index] = { ...updated[index], name };
    setGroups(updated);
  };

  const addTag = (groupIndex: number) => {
    const updated = [...groups];
    updated[groupIndex] = {
      ...updated[groupIndex],
      tags: [...updated[groupIndex].tags, ''],
    };
    setGroups(updated);
  };

  const removeTag = (groupIndex: number, tagIndex: number) => {
    const updated = [...groups];
    const newTags = updated[groupIndex].tags.filter((_, i) => i !== tagIndex);
    updated[groupIndex] = {
      ...updated[groupIndex],
      tags: newTags.length === 0 ? [''] : newTags,
    };
    setGroups(updated);
  };

  const updateTag = (groupIndex: number, tagIndex: number, value: string) => {
    const updated = [...groups];
    const newTags = [...updated[groupIndex].tags];
    newTags[tagIndex] = value;
    updated[groupIndex] = { ...updated[groupIndex], tags: newTags };
    setGroups(updated);
  };

  return (
    <div className="space-y-4 py-2">
      <div>
        <label className="text-sm font-medium text-foreground mb-1.5 block">
          CP名称
        </label>
        <Input
          placeholder="如：ひめこは / 狮心组"
          value={cpName}
          onChange={(e) => setCpName(e.target.value)}
          className="border-purple-200 focus:border-purple-400 focus:ring-purple-200 rounded-lg"
        />
      </div>

      <div className="flex items-center gap-2 p-3 rounded-xl border border-purple-100 bg-purple-50/30">
        <input
          type="checkbox"
          id="editIsCombination"
          checked={isCombination}
          onChange={(e) => setIsCombination(e.target.checked)}
          className="w-4 h-4 rounded border-purple-300 text-purple-500 focus:ring-purple-200"
        />
        <label htmlFor="editIsCombination" className="text-sm text-foreground cursor-pointer">
          这是组合名（如"狮心组"），需要区分左右位分组
        </label>
      </div>

      {isCombination ? (
        /* 组合模式：分组管理 */
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">
            标签分组
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            修改分组名称和标签后，保存时会自动刷新LOFTER数据
          </p>
          <div className="space-y-3">
            {groups.map((group, gi) => (
              <div
                key={group.id}
                className="p-3 rounded-xl border border-purple-100 bg-purple-50/30 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="分组名称（如：组合 / 雷泉 / 泉雷）"
                    value={group.name}
                    onChange={(e) => updateGroupName(gi, e.target.value)}
                    className="border-purple-200 focus:border-purple-400 focus:ring-purple-200 rounded-lg text-sm"
                  />
                  {groups.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeGroup(gi)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {group.tags.map((tag, ti) => (
                    <div key={ti} className="flex gap-2">
                      <Input
                        placeholder="标签名或LOFTER链接"
                        value={tag}
                        onChange={(e) => updateTag(gi, ti, e.target.value)}
                        className="border-purple-200 focus:border-purple-400 focus:ring-purple-200 rounded-lg text-sm"
                      />
                      {group.tags.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeTag(gi, ti)}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => addTag(gi)}
                  className="text-purple-500 hover:text-purple-600 hover:bg-purple-50 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  添加别名
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={addGroup}
            className="mt-2 text-purple-500 hover:text-purple-600 hover:bg-purple-50"
          >
            <Plus className="w-3 h-3 mr-1" />
            添加分组
          </Button>
        </div>
      ) : (
        /* 非组合模式：简单标签列表（所有分组合并显示） */
        <div>
          <label className="text-sm font-medium text-foreground mb-1.5 block">
            标签别名
          </label>
          <p className="text-xs text-muted-foreground mb-2">
            修改标签后，保存时会自动刷新LOFTER数据
          </p>
          <div className="space-y-1.5">
            {groups.flatMap((g) => g.tags).map((tag, ti) => (
              <div key={ti} className="flex gap-2">
                <Input
                  placeholder="标签名或LOFTER链接"
                  value={tag}
                  onChange={(e) => {
                    // 找到这个tag属于哪个group
                    let accIdx = 0;
                    for (let gi = 0; gi < groups.length; gi++) {
                      if (ti < accIdx + groups[gi].tags.length) {
                        updateTag(gi, ti - accIdx, e.target.value);
                        break;
                      }
                      accIdx += groups[gi].tags.length;
                    }
                  }}
                  className="border-purple-200 focus:border-purple-400 focus:ring-purple-200 rounded-lg text-sm"
                />
                {groups.flatMap((g) => g.tags).length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      // 找到这个tag属于哪个group并删除
                      let accIdx = 0;
                      for (let gi = 0; gi < groups.length; gi++) {
                        if (ti < accIdx + groups[gi].tags.length) {
                          removeTag(gi, ti - accIdx);
                          break;
                        }
                        accIdx += groups[gi].tags.length;
                      }
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // 添加到最后一个分组
              if (groups.length > 0) {
                addTag(groups.length - 1);
              } else {
                setGroups([{ id: generateId(), name: '', tags: [''] }]);
              }
            }}
            className="mt-2 text-purple-500 hover:text-purple-600 hover:bg-purple-50 text-xs"
          >
            <Plus className="w-3 h-3 mr-1" />
            添加别名
          </Button>
        </div>
      )}
    </div>
  );
}
