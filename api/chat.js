// Vercel Serverless Function for AI Response
// POST /api/chat

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
        const { query, context, userInfo } = req.body;
        
        if (!query) {
            return res.status(400).json({ error: 'query required' });
        }
        
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
        
        // Claude API 사용 (우선)
        if (ANTHROPIC_API_KEY) {
            const response = await callClaude(query, context, userInfo, ANTHROPIC_API_KEY);
            return res.status(200).json(response);
        }
        
        // OpenAI 대체
        if (OPENAI_API_KEY) {
            const response = await callOpenAI(query, context, userInfo, OPENAI_API_KEY);
            return res.status(200).json(response);
        }
        
        return res.status(500).json({ error: 'No AI API configured' });
        
    } catch (error) {
        console.error('Chat error:', error);
        return res.status(500).json({ 
            error: 'Chat failed',
            message: error.message 
        });
    }
}

async function callClaude(query, context, userInfo, apiKey) {
    const systemPrompt = getSystemPrompt(userInfo);
    const contextText = formatContext(context);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [
                {
                    role: 'user',
                    content: `참고 정보:\n${contextText}\n\n질문: ${query}`
                }
            ]
        })
    });
    
    if (!response.ok) {
        throw new Error('Claude API failed');
    }
    
    const data = await response.json();
    
    return {
        success: true,
        answer: data.content[0].text,
        model: 'claude-3-haiku'
    };
}

async function callOpenAI(query, context, userInfo, apiKey) {
    const systemPrompt = getSystemPrompt(userInfo);
    const contextText = formatContext(context);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: 1024,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `참고 정보:\n${contextText}\n\n질문: ${query}` }
            ]
        })
    });
    
    if (!response.ok) {
        throw new Error('OpenAI API failed');
    }
    
    const data = await response.json();
    
    return {
        success: true,
        answer: data.choices[0].message.content,
        model: 'gpt-4o-mini'
    };
}

function getSystemPrompt(userInfo) {
    return `당신은 '육아 컴패니언 AI'입니다. 모유수유에 대해 따뜻하고 전문적인 조언을 제공합니다.

## 역할
- 모유수유 전문 상담사 (IBCLC 수준의 지식)
- 공감적이고 지지적인 태도
- 과학적 근거 기반 정보 제공

## 응답 스타일
- 따뜻하고 친근한 말투 사용
- 핵심 정보를 먼저 제공
- 불릿 포인트로 가독성 높이기
- 응급 상황은 명확히 경고
- 200-300자 내외로 간결하게

## 주의사항
- 의료 진단을 하지 않음
- 심각한 증상은 전문가 상담 권유
- 불확실한 정보는 제공하지 않음

${userInfo ? `## 사용자 정보\n${JSON.stringify(userInfo)}` : ''}`;
}

function formatContext(context) {
    if (!context || !Array.isArray(context)) return '관련 정보 없음';
    
    return context.map((item, i) => 
        `[${i + 1}] ${item.title}\n${item.content}`
    ).join('\n\n');
}
