import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase 连接配置
// 注意：Supabase anon key 是设计为公开使用的，前端直接使用是安全的
const SUPABASE_URL = 'https://icgrxptmrfcczqdfjrn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_KloAvScMIzUe8Yc76ouqQw_N_5mC-Zl';

// 创建浏览器端 Supabase 客户端
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
});

// 数据库表名
export const CP_TABLE = 'cp_items';

// 类型定义
export interface CpItemRow {
  id: string;
  display_name: string;
  is_combination: boolean;
  groups: any[];
  total_joined_num: number;
  created_at?: string;
  updated_at?: string;
}

// 获取所有 CP
export async function getAllCps(): Promise<CpItemRow[]> {
  const { data, error } = await supabase
    .from(CP_TABLE)
    .select('*')
    .order('total_joined_num', { ascending: false });

  if (error) {
    console.error('Error fetching CPs:', error);
    return [];
  }

  return data || [];
}

// 创建 CP
export async function createCp(cp: Omit<CpItemRow, 'id' | 'created_at' | 'updated_at'>): Promise<CpItemRow | null> {
  const { data, error } = await supabase
    .from(CP_TABLE)
    .insert([cp])
    .select()
    .single();

  if (error) {
    console.error('Error creating CP:', error);
    return null;
  }

  return data;
}

// 更新 CP
export async function updateCp(id: string, cp: Partial<Omit<CpItemRow, 'id' | 'created_at' | 'updated_at'>>): Promise<CpItemRow | null> {
  const { data, error } = await supabase
    .from(CP_TABLE)
    .update(cp)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating CP:', error);
    return null;
  }

  return data;
}

// 删除 CP
export async function deleteCp(id: string): Promise<boolean> {
  const { error } = await supabase
    .from(CP_TABLE)
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting CP:', error);
    return false;
  }

  return true;
}
