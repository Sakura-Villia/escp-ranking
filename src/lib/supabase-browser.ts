import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 浏览器端 Supabase 客户端
// 使用 NEXT_PUBLIC_ 前缀的环境变量，这样浏览器才能访问
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// 创建客户端（即使环境变量未设置也创建，避免构建失败）
export const supabase: SupabaseClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    })
  : createClient('https://placeholder.supabase.co', 'placeholder-key', {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
      },
    });

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not set. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

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
