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
      // 젖 거부/물림 문제
      '안물': ['젖거부', '거부', '물림거부', '유두혼동', '피부접촉'],
      '거부': ['젖거부', '거부', '물림거부', '유두혼동', '피부접촉'],
      '안먹': ['젖거부', '거부', '수유거부', '먹지않음'],
      '유두혼동': ['유두혼동', '젖병거부', '젖거부', '혼동'],
      
      // 유두 관련 - 상처/통증 우선
      '유두상처': ['유두상처', '균열', '갈라짐', '출혈', '통증', '원인', '치료', '대처'],
      '유두': ['유두', '균열', '상처', '갈라짐', '통증', '원인'],
      '균열': ['균열', '갈라짐', '유두상처', '출혈', '치료'],
      '갈라': ['갈라짐', '균열', '유두상처', '통증'],
      '젖꼭지': ['유두', '젖꼭지', '상처', '균열', '통증'],
      
      // 함몰/편평 유두 (보호기 관련)
      '함몰': ['함몰유두', '편평유두', '유두보호기', '교정'],
      '편평': ['편평유두', '함몰유두', '유두보호기'],
      '보호기': ['유두보호기', '실리콘캡', '함몰', '편평'],
      
      // 긴급 상황
      '열': ['유선염', '열', '감염', '병원', '응급', '고열'],
      '아파': ['통증', '아픔', '유선염', '울혈', '열'],
      '가슴': ['유방', '가슴', '울혈', '유선염', '통증'],
      '유선염': ['유선염', '열', '감염', '항생제', '병원'],
      '응급': ['응급', '병원', '즉시', '위험'],
      
      // 모유량
      '모유량': ['젖양', '모유량', '부족', '늘리기', '분비', '증가'],
      '젖양': ['젖양', '모유량', '부족', '늘리기'],
      '늘리': ['늘리기', '증가', '촉진', '분비', '젖양'],
      '부족': ['부족', '젖양', '모유량', '늘리기'],
      
      // 자세/래치
      '자세': ['자세', '래치', '물림', '안기', '포지션'],
      '물림': ['래치', '물림', '자세', '깊은물림', '딥래치'],
      '래치': ['래치', '딥래치', '깊은물림', '자세'],
      '안기': ['안기', '자세', '포지션', '요람'],
      
      // 야간/수면
      '밤': ['야간', '밤', '수면', '밤중수유', '야간수유'],
      '야간': ['야간수유', '밤중수유', '수면', '밤'],
      '수면': ['수면', '야간', '밤', '잠'],
      '밤중': ['밤중수유', '야간수유', '수면'],
      '깨요': ['야간', '수면', '밤', '깨움', '밤중수유'],
      
      // 직장/복직
      '직장': ['복직', '직장', '유축', '회사', '워킹맘'],
      '복직': ['복직', '직장', '유축', '펌프', '냉동'],
      '회사': ['회사', '직장', '복직', '유축'],
      
      // 유축/보관
      '유축': ['유축', '펌프', '저장', '보관', '냉동'],
      '펌프': ['펌프', '유축기', '유축'],
      '냉동': ['냉동', '보관', '저장', '해동'],
      '보관': ['보관', '저장', '냉동', '냉장'],
      
      // 이유식/젖떼기
      '이유식': ['이유식', '이유', '고형식', '시작', '먹거리'],
      '젖떼기': ['젖떼기', '단유', '이유', '졸업'],
      '단유': ['단유', '젖떼기', '이유'],
      
      // 특수상황
      '쌍둥이': ['쌍둥이', '다태아', '특수', '동시수유'],
      '미숙아': ['미숙아', '조산', 'NICU', '특수'],
      '조산': ['조산', '미숙아', 'NICU']
    };

    // 검색어에서 관련 키워드 추출
    let expandedKeywords = [searchTerm];
    let priorityKeywords = [];
    
    for (const [key, values] of Object.entries(keywordMap)) {
      if (searchTerm.includes(key)) {
        if (priorityKeywords.length === 0) {
          priorityKeywords = values.slice(0, 3);
        }
        expandedKeywords = [...expandedKeywords, ...values];
      }
    }
    expandedKeywords = [...new Set(expandedKeywords)];

    // Supabase REST API로 직접 검색
    let url = `${SUPABASE_URL}/rest/v1/knowledge_units?select=*`;
    
    if (categoryId) {
      url += `&category=eq.${categoryId}`;
    }

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
        if (title.includes(searchTerm)) score += 15;
        if (content.includes(searchTerm)) score += 8;
        if (keywords.includes(searchTerm)) score += 12;

        // 우선순위 키워드 매칭
        for (const kw of priorityKeywords) {
          if (title.includes(kw)) score += 10;
          if (content.includes(kw)) score += 6;
          if (keywords.includes(kw)) score += 8;
        }

        // 확장 키워드 매칭
        for (const kw of expandedKeywords) {
          if (!priorityKeywords.includes(kw)) {
            if (title.includes(kw)) score += 2;
            if (content.includes(kw)) score += 1;
            if (keywords.includes(kw)) score += 2;
          }
        }

        // 긴급도 보너스
        if (item.urgency === '즉시대응필요') score += 3;
        else if (item.urgency === '24시간내확인') score += 2;

        // 특정 검색어에 대한 점수 조정
        if (searchTerm.includes('상처') || searchTerm.includes('균열') || searchTerm.includes('갈라')) {
          if (title.includes('보호기') || title.includes('사용법')) score -= 5;
          if (title.includes('원인') || title.includes('대처') || title.includes('치료')) score += 8;
        }
        
        // 젖 거부 검색 시 수면 관련 결과 점수 감소
        if (searchTerm.includes('안물') || searchTerm.includes('거부')) {
          if (title.includes('수면') || title.includes('잠') || content.includes('수면 환경')) score -= 10;
          if (title.includes('거부') || content.includes('젖거부')) score += 10;
        }

        return { ...item, score };
      });

      results = results.filter(item => item.score > 0);
      results.sort((a, b) => b.score - a.score);
    }

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
