/**
 * Fintrack GraphRAG - Reliable End-of-Stream Parsing Hook
 */

import { useCallback, useRef, useState } from 'react';
import { useFintrackStore } from '@/store';
import type { QueryRequest, BackendSemanticChunk, SemanticChunk } from '@/types';

const API_BASE_URL = 'http://localhost:8080';


const CIK_TO_TICKER: Record<string, string> = {
 
  '1467373': 'ACN',   // Accenture 
  '320193': 'AAPL',   // Apple Inc.
  '1318605': 'TSLA',  // Tesla Inc.
  '1018724': 'AMZN',  // Amazon.com Inc.
  '1326801': 'META',  // Meta Platforms Inc.
  '789019': 'MSFT',   // Microsoft Corp.
  '1652044': 'GOOGL', // Alphabet Inc.
  '1288776': 'NFLX',  // Netflix Inc.
  '50863': 'INTC',    // Intel Corp.
  '2488': 'AMD',      // Advanced Micro Devices
  '80424': 'AMD',     // Advanced Micro Devices (alt)
  '732717': 'NVDA',   // NVIDIA Corp.
  
  // Financial/Crypto
  '2176575': 'HOOD',  // Robinhood
  '1559720': 'ABNB',  // Airbnb
  '1760903': 'MARQ',  // Marqeta
  '1310067': 'SNOW',  // Snowflake
  '1373715': 'DDOG',  // Datadog
  '1477720': 'ZM',    // Zoom
  '1764925': 'COIN',  // Coinbase
  '1827932': 'RIVN',  // Rivian
  '1794812': 'LCID',  // Lucid Motors
  '1315094': 'BABA',  // Alibaba
  '1108524': 'CRM',   // Salesforce
  '1375150': 'SHOP',  // Shopify
  '1540184': 'SQ',    // Block (Square)
  '1571996': 'PLTR',  // Palantir
  '1783879': 'RBLX',  // Roblox
  '1682852': 'UBER',  // Uber
  '1543151': 'LYFT',  // Lyft
  '1763585': 'DASH',  // DoorDash
  '1742257': 'TOST',  // Toast
  '1423774': 'NET',   // Cloudflare
  '1568100': 'TWLO',  // Twilio
  '1441816': 'APPN',  // Appian
  '1666134': 'OKTA',  // Okta
  '1473844': 'DOCU',  // DocuSign
  '1366568': 'RNG',   // RingCentral
  '1580808': 'FSLY',  // Fastly
  '1577552': 'PD',    // PagerDuty
  '1725579': 'ASAN',  // Asana
  '1834488': 'MNDY',  // Monday.com
  '1624512': 'ZI',    // ZoomInfo
  '1772008': 'S',     // SentinelOne
  '1804156': 'CFLT',  // Confluent
  '1691428': 'AVDX',  // AvidXchange
  '1720671': 'BILL',  // Bill.com
  '1794515': 'FIGS',  // Figs
  '1279695': 'VEEV',  // Veeva Systems
  '1440819': 'BOX',   // Box Inc.
  '1353283': 'EGHT',  // 8x8 Inc.
  '1050441': 'ADBE',  // Adobe
  '1342936': 'ADSK',  // Autodesk
  '1135185': 'ATVI',  // Activision Blizzard
  '1411695': 'EA',    // Electronic Arts
  '1321834': 'TTWO',  // Take-Two Interactive
  '1593514': 'U',     // Unity Software
  '1766903': 'CPNG',  // Coupang
  '1570132': 'PINS',  // Pinterest
  '1418091': 'TWTR',  // Twitter (legacy)
  '1437107': 'DIS',   // Disney
  '1633917': 'PARA',  // Paramount
  '1166126': 'NKE',   // Nike
  '823768': 'WB',     // Weibo
  '1549599': 'IQ',    // iQIYI
  '1707753': 'PDD',   // Pinduoduo
  '1758453': 'NIO',   // NIO Inc.
  '1811210': 'XPEV',  // XPeng
  '1815228': 'LI',    // Li Auto
};


function cikToTicker(cik: string): string {
  if (!cik) return 'UNKNOWN';
  const cleanCik = cik.replace(/^CIK:/i, '').trim();
  const ticker = CIK_TO_TICKER[cleanCik];
  if (ticker) return ticker;
  

  console.warn(`Unknown CIK: ${cleanCik}, using as identifier`);
  return `CIK:${cleanCik}`;
}

function adaptBackendChunks(backendChunks: BackendSemanticChunk[]): SemanticChunk[] {
  if (!backendChunks || !Array.isArray(backendChunks)) return [];
  
  return backendChunks.map((chunk, index) => ({
    id: `${cikToTicker(chunk.cik)}-${chunk.year || 2025}-${chunk.document_type || '10-K'}-${index + 1}`.toUpperCase(),
    text: chunk.text || '',
    ticker: cikToTicker(chunk.cik),
    similarityScore: typeof chunk.score === 'number' ? chunk.score : 0,
    documentType: chunk.document_type || '10-K',
    year: chunk.year || new Date().getFullYear(),
    section: chunk.section || 'General',
  }));
}

export function useFintrackStream() {
  const { 
    sendMessage, 
    appendToken, 
    finalizeMessage, 
    buildGraphFromChunks,
    addCitation,
    setError,
    setInferenceLoading 
  } = useFintrackStore();
  
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  
  const typeText = useCallback(async (text: string, onWord: (word: string) => void) => {
    if (!text) return;
    const words = text.split(/(\s+)/);
    
    for (const word of words) {
      if (word) {
        onWord(word);
      
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
  }, []);

  const sendQuery = useCallback(async (request: QueryRequest) => {
    
    setIsStreaming(true);
    setInferenceLoading(true);
    
    sendMessage(request.query);
    abortControllerRef.current = new AbortController();

  
    let fullJsonString = '';

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/query`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Stream Reader initialization failed');
      }

      const decoder = new TextDecoder();

      
      while (true) {
        const { value, done } = await reader.read();
        
        if (done) {
          console.log('Stream complete, buffer size:', fullJsonString.length);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        fullJsonString += chunk;
      }

   
      console.log('Parsing complete JSON...');
      
      const data = JSON.parse(fullJsonString);
     
      const adaptedChunks: SemanticChunk[] = adaptBackendChunks(data.semantic_chunks || []);
      console.log('Adapted', adaptedChunks.length, 'chunks:', adaptedChunks.map(c => ({ id: c.id, ticker: c.ticker })));

      if (adaptedChunks.length > 0) {
        console.log('Building graph with ticker:', adaptedChunks[0]?.ticker);
        buildGraphFromChunks(adaptedChunks);
      }

  
      adaptedChunks.forEach((chunk, i) => {
        addCitation({
          number: i + 1,
          chunkId: chunk.id,
          preview: chunk.text.substring(0, 100) + (chunk.text.length > 100 ? '...' : ''),
          chunk: chunk,
        });
      });
      console.log('Added', adaptedChunks.length, 'citations');

    
      setInferenceLoading(false);

    
      if (data.generated_answer) {
        console.log('Starting typing effect...');
        await typeText(data.generated_answer, (word) => {
          appendToken(word);
        });
      }

   
      console.log('Finalizing message with', adaptedChunks.length, 'chunks');
      finalizeMessage(adaptedChunks);
      
      setIsStreaming(false);

    } catch (err) {
      console.error('Stream error:', err);
      
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
      
      setIsStreaming(false);
      setInferenceLoading(false);
    }
  }, [sendMessage, appendToken, buildGraphFromChunks, addCitation, finalizeMessage, setError, setInferenceLoading, typeText]);

  const abortStream = useCallback(() => {
    abortControllerRef.current?.abort();
    setInferenceLoading(false);
    setIsStreaming(false);
  }, [setInferenceLoading]);

  return { 
    isStreaming, 
    sendQuery, 
    abortStream 
  };
}
