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
        
        // Supabase에서 검색 (환경변수 필요)
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
        
        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return res.status(500).json({ error: 'Supabase not configured' });
        }
        
        // 키워드 기반 검색
        let searchQuery = `
            SELECT id, title, content, chapter, timeline, urgency, category, keywords
            FROM knowledge_units
            WHERE 1=1
        `;
        
        const params = [];
        
        if (categoryId) {
            searchQuery += ` AND category = $${params.length + 1}`;
            params.push(categoryId);
        }
        
        if (query) {
            searchQuery += ` AND (
                title ILIKE $${params.length + 1}
                OR content ILIKE $${params.length + 1}
                OR keywords::text ILIKE $${params.length + 1}
            )`;
            params.push(`%${query}%`);
        }
        
        searchQuery += ` ORDER BY 
            CASE WHEN urgency = '즉시대응필요' THEN 0
                 WHEN urgency = '24시간내확인' THEN 1
                 ELSE 2 END,
            id
            LIMIT ${limit}`;
        
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/search_knowledge`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            },
            body: JSON.stringify({ 
                search_query: query || '',
                category_filter: categoryId || null,
                result_limit: limit
            })
        });
        
        if (!response.ok) {
            throw new Error('Supabase search failed');
        }
        
        const results = await response.json();
        
        return res.status(200).json({
            success: true,
            results: results,
            count: results.length
        });
        
    } catch (error) {
        console.error('Search error:', error);
        return res.status(500).json({ 
            error: 'Search failed',
            message: error.message 
        });
    }
}
