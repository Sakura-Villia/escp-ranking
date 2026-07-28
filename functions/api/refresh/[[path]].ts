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

async function fetchLofterTag(tag: string, retryCount = 0): Promise<TagAlias> {
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
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
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

    return {
      tag,
      joinedNum,
      tagViewCount,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error: any) {
    // 网络错误也重试
    if (retryCount < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
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
    
    // 串行请求，每个请求间隔 500ms，避免触发 LOFTER 速率限制
    const results: TagAlias[] = [];
    for (const tag of tags) {
      const result = await fetchLofterTag(tag);
      results.push(result);
      // 请求间隔 500ms
      if (tags.indexOf(tag) < tags.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
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
