// Cloudflare Pages Functions - CP 数据 API
// 使用 D1 数据库

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestGet(context: any) {
  try {
    const db = context.env.DB;
    const result = await db.prepare('SELECT * FROM cp_items ORDER BY total_joined_num DESC').all();
    
    return new Response(JSON.stringify({ success: true, data: result.results || [] }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export async function onRequestPost(context: any) {
  try {
    const body = await context.request.json();
    const db = context.env.DB;
    
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    await db.prepare(`
      INSERT INTO cp_items (id, display_name, is_combination, groups, total_joined_num, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.display_name,
      body.is_combination || false,
      JSON.stringify(body.groups),
      body.total_joined_num || 0,
      now,
      now
    ).run();
    
    return new Response(JSON.stringify({ success: true, data: { id } }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export async function onRequestPut(context: any) {
  try {
    const body = await context.request.json();
    const db = context.env.DB;
    const now = new Date().toISOString();
    
    await db.prepare(`
      UPDATE cp_items 
      SET display_name = ?, is_combination = ?, groups = ?, total_joined_num = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      body.display_name,
      body.is_combination || false,
      JSON.stringify(body.groups),
      body.total_joined_num || 0,
      now,
      body.id
    ).run();
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export async function onRequestDelete(context: any) {
  try {
    const url = new URL(context.request.url);
    const id = url.pathname.split('/').pop();
    const db = context.env.DB;
    
    await db.prepare('DELETE FROM cp_items WHERE id = ?').bind(id).run();
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
