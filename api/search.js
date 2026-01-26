// Vercel Serverless Function for RAG Search
// POST /api/search

export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { query, categoryId, limit = 5 } = req.body;

    if (!query && !categoryId) {
      return res.status(400).json({ error: 'query or categoryId required' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // 검색어 처리
    const searchTerm = query ? query.trim().toLowerCase() : '';
    
    // 키워드 매핑 (검색어 → 관련 키워드)
    const keywordMap = {
      '열': ['유선염', '열', '감염', '병원', '응급'],
      '아파': ['통증', '아픔', '유선염', '울혈', '열'],
      '가슴': ['유방', '가슴', '울혈', '유선염'],
      '모유량': ['젖양', '모유량', '부족', '늘리기', '분비'],
      '늘리': ['늘리기', '증가', '촉진', '분비'],
      '부족': ['부족', '젖양', '모유량', '늘리기'],
      '자세': ['자세', '래치', '물림', '안기'],
      '물림': ['래치', '물림', '자세', '깊은물림'],
      '밤': ['야간', '밤', '수면', '밤중수유'],
      '야간': ['야간수유', '밤중수유', '수면'],
      '직장': ['복직', '직장', '유축', '회사'],
      '복직': ['복직', '직장', '유축', '펌프'],
      '유축': ['유축', '펌프', '저장', '보관'],
      '이유식': ['이유식', '이유', '고형식', '시작'],
      '젖떼기': ['젖떼기', '단유', '이유'],
      '유두': ['유두', '균열', '상처', '함몰'],
      '함몰': ['함몰유두', '편평유두', '유두'],
      '쌍둥이': ['쌍둥이', '다태아', '특수'],
      '미숙아': ['미숙아', '조산', 'NICU']
    };

    // 검색어에서 관련 키워드 추출
    let expandedKeywords = [searchTerm];
    for (const [key, values] of Object.entries(keywordMap)) {
      if (searchTerm.includes(key)) {
        expandedKeywords = [...expandedKeywords, ...values];
      }
    }
    expandedKeywords = [...new Set(expandedKeywords)]; // 중복 제거

    // Supabase REST API로 직접 검색
    let url = `${SUPABASE_URL}/rest/v1/knowledge_units?select=*`;
    
    // 카테고리 필터
    if (categoryId) {
      url += `&category=eq.${categoryId}`;
    }

    // 검색 실행
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error('Supabase search failed');
    }

    let results = await response.json();

    // 검색어가 있으면 필터링 및 점수 계산
    if (searchTerm) {
      results = results.map(item => {
        let score = 0;
        const title = (item.title || '').toLowerCase();
        const content = (item.content || '').toLowerCase();
        const keywords = Array.isArray(item.keywords) ? item.keywords.join(' ').toLowerCase() : '';

        // 정확한 검색어 매칭
        if (title.includes(searchTerm)) score += 10;
        if (content.includes(searchTerm)) score += 5;
        if (keywords.includes(searchTerm)) score += 8;

        // 확장 키워드 매칭
        for (const kw of expandedKeywords) {
          if (title.includes(kw)) score += 3;
          if (content.includes(kw)) score += 2;
          if (keywords.includes(kw)) score += 4;
        }

        // 긴급도 보너스
        if (item.urgency === '즉시대응필요') score += 5;
        else if (item.urgency === '24시간내확인') score += 3;

        return { ...item, score };
      });

      // 점수가 0보다 큰 것만 필터링
      results = results.filter(item => item.score > 0);

      // 점수순 정렬
      results.sort((a, b) => b.score - a.score);
    }

    // 결과 제한
    results = results.slice(0, limit);

    return res.status(200).json({
      success: true,
      results: results,
      count: results.length,
      query: searchTerm,
      expandedKeywords: expandedKeywords
    });

  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({ 
      error: 'Search failed', 
      message: error.message 
    });
  }
}
