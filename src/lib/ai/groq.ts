import Groq from 'groq-sdk';
import { EquityResearchData } from '@/types';
import { SYSTEM_PROMPT, generateUserPrompt } from './prompt';
import { AIExtractionSchema, AIExtractionResult } from './schema';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || ''
});

/**
 * Sanitizes the response content by removing markdown code blocks if the model wrapped them.
 */
function sanitizeJsonString(raw: string): string {
  let cleaned = raw.trim();
  // Strip ```json ... ``` blocks
  if (cleaned.startsWith('```')) {
    const endBlockIndex = cleaned.lastIndexOf('```');
    const startLineIndex = cleaned.indexOf('\n');
    if (startLineIndex !== -1 && endBlockIndex !== -1 && endBlockIndex > startLineIndex) {
      cleaned = cleaned.substring(startLineIndex + 1, endBlockIndex).trim();
    } else {
      // Just replace all occurrences of triple backticks
      cleaned = cleaned.replace(/```(json)?/g, '').trim();
    }
  }
  return cleaned;
}

/**
 * Maps the AI raw schema outputs to the full-featured EquityResearchData interface expected by the client.
 */
function mapToEquityResearchData(aiResult: AIExtractionResult): EquityResearchData {
  const currentPrice = aiResult.currentPrice || 0;
  const targetPrice = aiResult.targetPrice || 0;
  
  // Calculate upside potential
  let upsidePotential = 0;
  if (currentPrice > 0 && targetPrice > 0) {
    upsidePotential = parseFloat((((targetPrice - currentPrice) / currentPrice) * 100).toFixed(2));
  }

  // Format financial statement arrays
  const incomeStatement = [
    ...(aiResult.revenue || []).map(r => ({ label: 'Revenue', value: r.value, period: r.period, unit: r.unit })),
    ...(aiResult.ebitda || []).map(e => ({ label: 'EBITDA', value: e.value, period: e.period, unit: e.unit })),
    ...(aiResult.pat || []).map(p => ({ label: 'PAT', value: p.value, period: p.period, unit: p.unit }))
  ];

  return {
    company: {
      name: aiResult.companyName || 'Unknown Company',
      ticker: (aiResult.companyName || 'UNKN').substring(0, 4).toUpperCase(),
      sector: 'General Corporate',
      industry: 'Unclassified Industry',
      reportDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    },
    recommendation: {
      rating: aiResult.recommendation,
      currentPrice,
      targetPrice,
      upsidePotential,
      rationale: aiResult.highlights.slice(0, 3)
    },
    executiveSummary: aiResult.investmentThesis || 'No investment thesis provided.',
    keyFinancials: {
      incomeStatement,
      balanceSheet: [],
      cashFlow: []
    },
    valuationAnalysis: aiResult.outlook || 'No valuation outlook provided.',
    investmentRisks: aiResult.risks,
    swotAnalysis: {
      strengths: aiResult.highlights.slice(0, 4),
      weaknesses: aiResult.risks.slice(0, 4),
      opportunities: aiResult.futureGrowth ? [aiResult.futureGrowth] : [],
      threats: []
    },
    narrativeSummary: aiResult.narrativeSummary,
    industryOverview: aiResult.industryOverview,
    businessOverview: aiResult.businessOverview,
    futureGrowth: aiResult.futureGrowth
  };
}

export class GroqAIService {
  /**
   * Calls Groq Llama 3.3 70B to extract key metrics and returns a validated structure.
   */
  public async extractFinancialData(companyName: string, rawText: string): Promise<EquityResearchData> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured in the environment variables.');
    }

    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: generateUserPrompt(companyName, rawText) }
    ];

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' }
        }, {
          timeout: 25000 // 25s timeout limit for API response
        });

        const rawContent = response.choices[0]?.message?.content || '';
        const cleanedJsonString = sanitizeJsonString(rawContent);

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(cleanedJsonString);
        } catch (jsonError: unknown) {
          const errMsg = jsonError instanceof Error ? jsonError.message : 'Unknown parsing error';
          console.warn(`Attempt ${attempt + 1}: JSON parsing failed. Error: ${errMsg}`);
          
          // Add error correction loop payload
          messages.push({ role: 'assistant', content: rawContent });
          messages.push({
            role: 'user',
            content: `The response you provided was not valid JSON. Please fix it and return ONLY the valid JSON structure. Error: ${errMsg}`
          });
          
          attempt++;
          continue;
        }

        // Validate structure with Zod
        const validationResult = AIExtractionSchema.safeParse(parsedJson);
        if (validationResult.success) {
          return mapToEquityResearchData(validationResult.data);
        } else {
          const errorsFormatted = JSON.stringify(validationResult.error.format());
          console.warn(`Attempt ${attempt + 1}: Zod validation failed. Error details: ${errorsFormatted}`);

          messages.push({ role: 'assistant', content: rawContent });
          messages.push({
            role: 'user',
            content: `The JSON structure returned failed validation checks. Please correct the schema errors and return the corrected JSON. Errors: ${errorsFormatted}`
          });

          attempt++;
        }
      } catch (apiError: unknown) {
        console.error('Groq SDK client error:', apiError);
        const errMsg = apiError instanceof Error ? apiError.message : String(apiError);
        throw new Error(`Failed to call Groq AI: ${errMsg}`);
      }
    }

    throw new Error('Failed to extract valid financial data after multiple retry attempts.');
  }
}

export const groqAIService = new GroqAIService();
export { AIExtractionSchema };
