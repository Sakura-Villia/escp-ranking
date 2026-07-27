import { NextResponse } from 'next/server';

interface TagAlias {
  tag: string;
  joinedNum: number;
  tagViewCount: number;
  lastUpdated: string;
  error?: string;
}

interface ApiResponse {
  success: boolean;
  data?: TagAlias[];
  error?: string;
}

// 使用移动端 UA 绕过 LOFTER 登录限制
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

async function fetchLofterTag(tag: string): Promise<TagAlias> {
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
      return {
        tag,
        joinedNum: 0,
        tagViewCount: 0,
        lastUpdated: new Date().toISOString(),
        error: `HTTP ${res.status}`,
      };
    }

    const html = await res.text();
    
    // 解析参与量
    const match = html.match(/"joinedNum"\s*:\s*(\d+)/);
    const joinedNum = match ? parseInt(match[1], 10) : 0;

    // 解析浏览量
    const viewMatch = html.match(/"viewNum"\s*:\s*(\d+)/);
    const tagViewCount = viewMatch ? parseInt(viewMatch[1], 10) : 0;

    return {
      tag,
      joinedNum,
      tagViewCount,
      lastUpdated: new Date().toISOString(),
    };
  } catch (error: any) {
    return {
      tag,
      joinedNum: 0,
      tagViewCount: 0,
      lastUpdated: new Date().toISOString(),
      error: error.message || 'Unknown error',
    };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tagsParam = searchParams.get('tags');
    
    if (!tagsParam) {
      return NextResponse.json(
        { success: false, error: 'Missing tags parameter' },
        { status: 400 }
      );
    }

    const tags = tagsParam.split(',').map(decodeURIComponent);
    
    const results = await Promise.all(tags.map(fetchLofterTag));

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
