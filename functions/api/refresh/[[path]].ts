const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

interface TagAlias {
  tag: string;
  joinedNum: number;
  tagViewCount: number;
  lastUpdated: string;
  error?: string;
}

// 内存缓存：tag -> { result, timestamp }
const tagCache = new Map<string, { result: TagAlias; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchLofterTag(tag: string, retryCount = 0): Promise<TagAlias> {
  // 检查缓存
  const cached = tagCache.get(tag);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Cache] Hit for tag "${tag}"`);
    return cached.result;
  }

  try {
    const url = `https://www.lofter.com/tag/${encodeURIComponent(tag)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': MOBILE_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      // 如果是 5xx 错误且还有重试次数，等待后重试
      if (res.status >= 500 && retryCount < 2) {
        const backoff = (retryCount + 1) * 1000 + Math.random() * 500;
        console.log(`[Refresh] Retry ${retryCount + 1}/2 for tag "${tag}" after ${Math.round(backoff)}ms (HTTP ${res.status})`);
        await delay(backoff);
        return fetchLofterTag(tag, retryCount + 1);
      }
      return {
        tag,
        joinedNum: 0,
        tagViewCount: 0,
        lastUpdated: new Date().toISOString(),
        error: `HTTP ${res.status}`,
      };
    }

    const html = await res.text();
    
    const match = html.match(/"joinedNum"\s*:\s*(\d+)/);
    const joinedNum = match ? parseInt(match[1], 10) : 0;

    const viewMatch = html.match(/"viewNum"\s*:\s*(\d+)/);
    const tagViewCount = viewMatch ? parseInt(viewMatch[1], 10) : 0;

    const result: TagAlias = {
      tag,
      joinedNum,
      tagViewCount,
      lastUpdated: new Date().toISOString(),
    };

    // 只有成功获取到数据时才缓存
    if (joinedNum > 0) {
      tagCache.set(tag, { result, timestamp: Date.now() });
    }

    return result;
  } catch (error: any) {
    // 网络错误也重试
    if (retryCount < 2) {
      const backoff = (retryCount + 1) * 1500 + Math.random() * 500;
      console.log(`[Refresh] Retry ${retryCount + 1}/2 for tag "${tag}" after ${Math.round(backoff)}ms (network error)`);
      await delay(backoff);
      return fetchLofterTag(tag, retryCount + 1);
    }
    return {
      tag,
      joinedNum: 0,
      tagViewCount: 0,
      lastUpdated: new Date().toISOString(),
      error: error.message || 'Unknown error',
    };
  }
}

export async function onRequestGet(context: any) {
  try {
    const { searchParams } = new URL(context.request.url);
    const tagsParam = searchParams.get('tags');
    
    if (!tagsParam) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing tags parameter' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    const tags = tagsParam.split(',').map(decodeURIComponent);
    
    // 小批量并发请求（每批 3 个），批间间隔 150ms
    const BATCH_SIZE = 3;
    const results: TagAlias[] = [];
    
    for (let i = 0; i < tags.length; i += BATCH_SIZE) {
      const batch = tags.slice(i, i + BATCH_SIZE);
      
      // 并发请求当前批次
      const batchResults = await Promise.all(batch.map(tag => fetchLofterTag(tag)));
      results.push(...batchResults);
      
      // 批间间隔 150ms，最后一批不需要延迟
      if (i + BATCH_SIZE < tags.length) {
        await delay(150);
      }
    }

    return new Response(JSON.stringify({ success: true, data: results }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}
