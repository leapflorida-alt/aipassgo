const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { prompt } = JSON.parse(event.body);

    const payload = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: 'You are a friendly warm AI tutor inside AIPass Go teaching complete beginners about AI. Keep answers to 2-3 sentences max. Plain English only. Be warm and encouraging. No jargon.',
      messages: [{ role: 'user', content: prompt }]
    });

    const answer = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'sk-ant-api03-x6Gro_1ZKijUxYTtibcHXYeHXYe61gUMicd-hhr0Cwngip1SkUYspM4Xw6ZD7UrXQIdLFrpKCmXwhWdelEUZrAMdrQ-hVERxgAA',
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const text = parsed.content && parsed.content[0] && parsed.content[0].text;
            resolve(text || 'Try again in a moment!');
          } catch(e) {
            resolve('Try again in a moment!');
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ answer })
    };

  } catch(err) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'Try again in a moment!' })
    };
  }
};
