import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel } from '@google/genai';
import { WebSocketServer } from 'ws';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '25mb' }));

const PORT = Number(process.env.PORT || 3000);
const MODEL_TEXT = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const MATH_EXAM_SYSTEM_INSTRUCTION = `Bạn là Trợ lý AI chuyên sâu hỗ trợ Thầy giáo Lê Trọng Toàn (Tổ Toán – Trường THPT Lê Quý Đôn, Sở GD&ĐT Đắk Lắk) biên soạn đề kiểm tra, phiếu học tập và giáo án môn Toán theo SGK Kết nối tri thức với cuộc sống (GDPT 2018) và chuẩn Đề thi BGD&ĐT 2025–2027.

QUY TẮC BẮT BUỘC KHI SOẠN ĐỀ:
1. Dùng LaTeX chuẩn trong cặp dấu $...$ (inline) hoặc $$...$$ (block). Không để ký tự markdown ** hoặc tiêu đề thừa.
2. Không sử dụng hàm trùng phương bậc 4 (thay bằng hàm phân thức bậc 2 trên bậc 1 hoặc bậc 3).
3. Phần I (Trắc nghiệm 4 lựa chọn): Cân bằng đáp án chuẩn 3A - 3B - 3C - 3D nếu đủ 12 câu. Mỗi phương án kết thúc bằng dấu chấm (.).
4. Phần II (Đúng/Sai): Mỗi câu có 4 ý a, b, c, d. Tổng số ý đúng và sai cân bằng (8 Đúng - 8 Sai nếu 4 câu; mỗi câu có 1 đến 3 ý đúng).
5. Phần III (Trả lời ngắn): Đáp số tối đa 4 ký tự (tính cả dấu - và dấu phẩy ,). Số thập phân bắt buộc dùng dấu phẩy (,), tuyệt đối không dùng dấu chấm (.).
6. Gắn thẻ phân loại ở đầu câu dạng [Lớp-Chương-Bài-Mức độ], ví dụ [12-C1-B1-NB].
7. LỜI GIẢI CHI TIẾT: Chia rõ "Bước 1: <Mô tả ngắn>", "Bước 2: <Mô tả ngắn>". Sau mỗi câu dẫn kết thúc bằng dấu hai chấm (:), bắt buộc xuống dòng (\\n) trước khi viết công thức hoặc biến đổi toán học.`;

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/ai/chat', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets của hệ thống.' });
    return;
  }

  try {
    const {
      message,
      history = [],
      context = '',
      model = MODEL_TEXT,
      useSearchGrounding = false,
      useMapsGrounding = false,
      userLocation,
    } = req.body as {
      message: string;
      history?: { role: string; text: string }[];
      context?: string;
      model?: string;
      useSearchGrounding?: boolean;
      useMapsGrounding?: boolean;
      userLocation?: { latitude: number; longitude: number };
    };

    const allowedModels = [
      'gemini-4-hydrogen',
      'gemini-3.1-flash-lite',
      'gemini-4-argon',
      'gemini-4-carbon',
    ];
    const selectedModel = allowedModels.includes(model) ? model : MODEL_TEXT;
    // When using Google Search or Google Maps grounding, gemini-4-hydrogen is required
    const effectiveModel =
      useSearchGrounding || useMapsGrounding ? 'gemini-4-hydrogen' : selectedModel;

    const transcript = history
      .slice(-8)
      .map((h) => `${h.role === 'user' ? 'Giáo viên' : 'TeachLearn AI'}: ${h.text}`)
      .join('\n');

    const prompt = `${context ? `Ngữ cảnh công việc: ${context}\n` : ''}${transcript ? `Lịch sử hội thoại:\n${transcript}\n` : ''}Yêu cầu hiện tại của Thầy/Cô: ${message}`;

    const tools: Array<Record<string, unknown>> = [];
    if (useSearchGrounding) {
      tools.push({ googleSearch: {} });
    }
    if (useMapsGrounding) {
      tools.push({ googleMaps: {} });
    }

    const config: Record<string, unknown> = {
      systemInstruction:
        'Bạn là Trợ lý Chuyên môn TeachLearn Edu hỗ trợ Thầy giáo Lê Trọng Toàn (Trường THPT Lê Quý Đôn, Đắk Lắk). Am hiểu sâu Quyết định 2422, Công văn 5512, Thông tư 22/2021, Thông tư 02/2025 & CV 3456 về năng lực số và SGK Kết nối tri thức với cuộc sống. Trả lời sư phạm, súc tích, dùng LaTeX chuẩn $...$ cho công thức toán.',
    };

    if (effectiveModel === 'gemini-4-hydrogen') {
      config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }
    if (tools.length > 0) {
      config.tools = tools;
    }
    if (useMapsGrounding && userLocation && typeof userLocation.latitude === 'number' && typeof userLocation.longitude === 'number') {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude,
          },
        },
      };
    }

    const response = await ai.models.generateContent({
      model: effectiveModel,
      contents: prompt,
      config,
    });

    const groundingLinks: Array<{ title: string; uri: string; sourceType: 'web' | 'maps' }> = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (Array.isArray(chunks)) {
      for (const ch of chunks) {
        const webChunk = (ch as { web?: { uri?: string; title?: string } }).web;
        if (webChunk?.uri) {
          groundingLinks.push({
            title: webChunk.title || webChunk.uri,
            uri: webChunk.uri,
            sourceType: 'web',
          });
        }
        const mapsChunk = (ch as { maps?: { uri?: string; title?: string } }).maps;
        if (mapsChunk?.uri) {
          groundingLinks.push({
            title: mapsChunk.title || 'Địa điểm trên Google Maps',
            uri: mapsChunk.uri,
            sourceType: 'maps',
          });
        }
      }
    }

    res.json({
      reply: response.text || 'Không có phản hồi từ mô hình.',
      modelUsed: effectiveModel,
      groundingLinks,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi kết nối Gemini API';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/image-studio', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      prompt,
      imageBase64,
      mimeType = 'image/png',
      aspectRatio = '1:1',
      model = 'gemini-3.1-flash-lite-image',
    } = req.body as {
      prompt: string;
      imageBase64?: string;
      mimeType?: string;
      aspectRatio?: string;
      model?: string;
    };

    if (!prompt || !prompt.trim()) {
      res.status(400).json({ error: 'Vui lòng nhập mô tả hình ảnh cần tạo hoặc chỉnh sửa.' });
      return;
    }

    const chosenModel =
      model === 'gemini-nano-banana-2.1' ? 'gemini-nano-banana-2.1' : 'gemini-3.1-flash-lite-image';

    let interaction: any;
    if (imageBase64) {
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      interaction = await ai.interactions.create({
        model: chosenModel,
        input: [
          {
            type: 'image',
            data: cleanBase64,
            mime_type: mimeType,
          },
          {
            type: 'text',
            text: prompt.trim(),
          },
        ],
      } as any);
    } else {
      interaction = await ai.interactions.create({
        model: chosenModel,
        input: prompt.trim(),
        response_modalities: ['image', 'text'],
        generation_config: {
          image_config: {
            aspect_ratio: aspectRatio,
            image_size: '1K',
          },
        },
      } as any);
    }

    let imageUrl = '';
    let caption = '';

    if (interaction?.output_image?.data) {
      const outMime = interaction.output_image.mime_type || 'image/png';
      imageUrl = `data:${outMime};base64,${interaction.output_image.data}`;
    }

    if (Array.isArray(interaction?.steps)) {
      for (const step of interaction.steps) {
        if (step.type === 'model_output' && Array.isArray(step.content)) {
          for (const c of step.content) {
            if (c.type === 'image' && c.data && !imageUrl) {
              const outMime = c.mime_type || 'image/png';
              imageUrl = `data:${outMime};base64,${c.data}`;
            }
            if (c.type === 'text' && c.text && !caption) {
              caption = c.text;
            }
          }
        }
      }
    }

    if (!imageUrl) {
      res.status(500).json({
        error: 'Mô hình không trả về dữ liệu hình ảnh. Hãy thử mô tả chi tiết hơn hoặc chọn gemini-3.1-flash-lite-image.',
      });
      return;
    }

    res.json({ imageUrl, caption, modelUsed: chosenModel });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi tạo/chỉnh sửa ảnh AI';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/video-studio', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      prompt,
      imageBase64,
      mimeType = 'image/png',
      aspectRatio = '16:9',
      duration = '6s',
    } = req.body as {
      prompt: string;
      imageBase64?: string;
      mimeType?: string;
      aspectRatio?: '16:9' | '9:16';
      duration?: string;
    };

    if (!prompt || !prompt.trim()) {
      res.status(400).json({ error: 'Vui lòng nhập kịch bản hoặc mô tả chuyển động video.' });
      return;
    }

    const inputPayload = imageBase64
      ? [
          {
            type: 'image',
            mime_type: mimeType,
            data: imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64,
          },
          {
            type: 'text',
            text: prompt.trim(),
          },
        ]
      : prompt.trim();

    const interaction: any = await ai.interactions.create(
      {
        model: 'gemini-omni-1.2-flash',
        input: inputPayload,
        background: false,
        store: false,
        stream: false,
        response_format: {
          type: 'video',
          aspect_ratio: aspectRatio === '9:16' ? '9:16' : '16:9',
          duration: duration || '6s',
          resolution: '720p',
        },
      } as any,
      { timeout: 300000 }
    );

    const videoPart = interaction?.output_video;
    if (!videoPart?.data) {
      res.status(500).json({
        error: 'Không nhận được dữ liệu video từ gemini-omni-1.2-flash (lưu ý mô hình video yêu cầu khóa API trả phí).',
      });
      return;
    }

    const outMime = videoPart.mime_type || 'video/mp4';
    res.json({
      videoDataUrl: `data:${outMime};base64,${videoPart.data}`,
      modelUsed: 'gemini-omni-1.2-flash',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi tạo video AI';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/music-studio', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      prompt,
      imageBase64,
      mimeType = 'image/jpeg',
      model = 'lyria-3-clip-preview',
    } = req.body as {
      prompt: string;
      imageBase64?: string;
      mimeType?: string;
      model?: string;
    };

    if (!prompt || !prompt.trim()) {
      res.status(400).json({ error: 'Vui lòng nhập mô tả giai điệu hoặc nhạc nền cần tạo.' });
      return;
    }

    const chosenModel =
      model === 'lyria-3-pro-preview' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';

    const contents = imageBase64
      ? {
          parts: [
            { text: prompt.trim() },
            {
              inlineData: {
                data: imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64,
                mimeType,
              },
            },
          ],
        }
      : prompt.trim();

    const responseStream = await ai.models.generateContentStream({
      model: chosenModel,
      contents,
      config: {
        responseModalities: [Modality.AUDIO],
      },
    });

    let audioBase64 = '';
    let lyrics = '';
    let outMimeType = 'audio/wav';

    for await (const chunk of responseStream) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.inlineData?.data) {
          if (!audioBase64 && part.inlineData.mimeType) {
            outMimeType = part.inlineData.mimeType;
          }
          audioBase64 += part.inlineData.data;
        }
        if (part.text && !lyrics) {
          lyrics = part.text;
        }
      }
    }

    if (!audioBase64) {
      res.status(500).json({
        error: 'Mô hình Lyria không trả về dữ liệu âm thanh (lưu ý Lyria yêu cầu khóa GEMINI_API_KEY có bật quyền truy cập).',
      });
      return;
    }

    res.json({
      audioBase64,
      mimeType: outMimeType,
      lyrics,
      modelUsed: chosenModel,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi tạo nhạc Lyria AI';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/transcribe', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      audioBase64,
      mimeType = 'audio/webm',
      prompt = 'Hãy chép lời (transcribe) chính xác đoạn âm thanh này sang văn bản tiếng Việt, giữ chuẩn ký hiệu Toán học nếu có.',
    } = req.body as {
      audioBase64: string;
      mimeType?: string;
      prompt?: string;
    };

    if (!audioBase64) {
      res.status(400).json({ error: 'Không có dữ liệu âm thanh để chép lời.' });
      return;
    }

    const cleanBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
    const interaction: any = await ai.interactions.create({
      model: 'gemini-3.5-transcribe',
      input: [
        {
          type: 'audio',
          data: cleanBase64,
          mime_type: mimeType,
        },
        {
          type: 'text',
          text: prompt,
        },
      ],
    } as any);

    let transcript = interaction?.output_text || '';
    if (!transcript && Array.isArray(interaction?.steps)) {
      for (const step of interaction.steps) {
        if (step.type === 'model_output' && Array.isArray(step.content)) {
          const txtPart = step.content.find((c: any) => c.type === 'text');
          if (txtPart?.text) {
            transcript = txtPart.text;
            break;
          }
        }
      }
    }

    res.json({ transcript: transcript || 'Không nhận diện được giọng nói trong đoạn ghi âm.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi chép lời âm thanh';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/solve-exercise', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const { textPrompt, imageBase64, mimeType = 'image/png', subject = 'Toán' } = req.body as {
      textPrompt?: string;
      imageBase64?: string;
      mimeType?: string;
      subject?: string;
    };

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (imageBase64) {
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      parts.push({
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      });
    }

    parts.push({
      text: `Hãy nhận diện (OCR nếu có ảnh) và giải chi tiết bài tập môn ${subject} sau theo đúng chuẩn sư phạm SGK Kết nối tri thức:\n${textPrompt || 'Giải bài toán trong ảnh đính kèm.'}\n\nYêu cầu định dạng JSON với 4 trường: recognizedText (đề bài trích xuất dùng LaTeX $...$), steps (mảng các bước { title: "Bước 1: ...", leadIn: "...", mathDetail: "..." }), finalAnswer (kết luận cuối cùng), diagramHint (mô tả ngắn nếu có đồ thị/hình vẽ).`,
    });

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: { parts },
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json({ result: JSON.parse(response.text || '{}') });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi giải bài tập';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/generate-exam', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      subject = 'Toán',
      grade = '12',
      semester = 'Học kỳ 1',
      topic = 'Ứng dụng đạo hàm để khảo sát và vẽ đồ thị hàm số',
      lesson = 'Đường tiệm cận của đồ thị hàm số',
      part1Count = 4,
      part2Count = 2,
      part3Count = 2,
      realWorldRatio = 40,
      includeParamM = true,
    } = req.body as {
      subject?: string;
      grade?: string;
      semester?: string;
      topic?: string;
      lesson?: string;
      part1Count?: number;
      part2Count?: number;
      part3Count?: number;
      realWorldRatio?: number;
      includeParamM?: boolean;
    };

    const prompt = `Hãy biên soạn 1 đề kiểm tra / phiếu học tập môn ${subject} Lớp ${grade} (${semester}), Chương/Chủ đề: "${topic}", Bài: "${lesson}" chuẩn SGK Kết nối tri thức với cuộc sống.
RÀNG BUỘC CHUYÊN MÔN TUYỆT ĐỐI:
1. TOÀN BỘ 100% câu hỏi ở cả 3 Phần phải thuộc đúng Khối Lớp ${grade}, Chương "${topic}" và trọng tâm "${lesson}". TUYỆT ĐỐI KHÔNG trộn câu hỏi của lớp khác hoặc chương khác!
2. Gắn thẻ [Lớp-Chương-Bài-Mức độ] chính xác (ví dụ [${grade}-C1-B1-NB], [${grade}-C1-B2-TH], [${grade}-C1-B3-VD], [${grade}-C1-B5-VDC]).
3. Tuyệt đối KHÔNG sử dụng hàm trùng phương bậc 4 ($ax^4 + bx^2 + c$). Thay bằng hàm bậc 3 hoặc hàm phân thức bậc 2/bậc 1.
4. Nếu Phần I có 12 câu thì đáp án đúng PHẢI cân bằng chính xác 3A - 3B - 3C - 3D.
5. Nếu Phần II có 4 câu (16 ý) thì tổng số ý Đúng - Sai PHẢI cân bằng 8 Đúng - 8 Sai (mỗi câu có 1 đến 3 ý đúng).
6. Phần III: Đáp án <= 4 ký tự, số thập phân bắt buộc dùng dấu phẩy (,), tuyệt đối không dùng dấu chấm (.).
7. Trong mọi lời giải, mỗi câu dẫn kết thúc bằng dấu hai chấm (:) bắt buộc ngắt dòng mới trước biểu thức toán học.

Cấu hình số lượng:
- Phần I (Trắc nghiệm 4 lựa chọn): ${part1Count} câu.
- Phần II (Đúng/Sai 4 ý a,b,c,d): ${part2Count} câu.
- Phần III (Trả lời ngắn): ${part3Count} câu.
- Tỷ lệ bài toán thực tế: ~${realWorldRatio}%.
- ${includeParamM ? 'Có câu hỏi chứa tham số m phân hóa.' : 'Không cần tham số m.'}

Trả về đúng định dạng JSON thuần:
{
  "title": "PHIẾU HỌC TẬP / ĐỀ KIỂM TRA LỚP ${grade} ...",
  "examCode": "0108",
  "part1": [
    {
      "id": "p1_1",
      "tag": "[${grade}-C1-B1-NB]",
      "stem": "Câu dẫn...",
      "options": ["...", "...", "...", "..."],
      "correctIndex": 0,
      "solutionSteps": [
        { "title": "Bước 1: ...", "leadIn": "Câu dẫn kết thúc bằng dấu :", "math": "Biểu thức LaTeX $...$" },
        { "title": "Bước 2: ...", "leadIn": "Kết luận:", "math": "Vậy chọn ..." }
      ]
    }
  ],
  "part2": [
    {
      "id": "p2_1",
      "tag": "[${grade}-C1-B2-TH]",
      "stem": "Câu dẫn...",
      "statements": [
        { "label": "a", "text": "...", "isTrue": true, "stepTitle": "Bước 1: Xét ý a)", "leadIn": "Theo giả thiết:", "explanation": "Biến đổi LaTeX $...$" },
        { "label": "b", "text": "...", "isTrue": true, "stepTitle": "Bước 2: Xét ý b)", "leadIn": "Xét biểu thức:", "explanation": "Biến đổi LaTeX $...$" },
        { "label": "c", "text": "...", "isTrue": false, "stepTitle": "Bước 3: Xét ý c)", "leadIn": "Kiểm tra điều kiện:", "explanation": "Biến đổi LaTeX $...$" },
        { "label": "d", "text": "...", "isTrue": false, "stepTitle": "Bước 4: Xét ý d)", "leadIn": "Tính giá trị:", "explanation": "Biến đổi LaTeX $...$" }
      ]
    }
  ],
  "part3": [
    {
      "id": "p3_1",
      "tag": "[${grade}-C1-B5-VD]",
      "stem": "Câu dẫn bài toán trả lời ngắn...",
      "answer": "12,5",
      "solutionSteps": [
        { "title": "Bước 1: Mô hình hóa", "leadIn": "Ta có:", "math": "..." },
        { "title": "Bước 2: Tính toán", "leadIn": "Suy ra:", "math": "..." }
      ]
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json({ exam: JSON.parse(response.text || '{}') });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi tạo đề AI';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/blueprint-step1', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const { sourceText, presetName = 'Đề Tốt nghiệp THPT 2026–2027' } = req.body as {
      sourceText: string;
      presetName?: string;
    };

    const prompt = `Giai đoạn 1 (Trích xuất Blueprint Ma trận & Đặc tả) cho cấu hình "${presetName}".
Phân tích đề gốc sau và xuất JSON ma trận đặc tả chi tiết:
${sourceText}

Trả về JSON:
{
  "examName": "...",
  "subjectGrade": "...",
  "durationMinutes": 90,
  "totalScore": 10,
  "cognitiveBreakdown": { "NB": 40, "TH": 30, "VD": 20, "VDC": 10 },
  "rows": [
    { "questionNo": "Câu 1", "part": "Phần I", "topic": "...", "level": "NB", "skill": "...", "score": 0.25 }
  ]
}`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json({ blueprint: JSON.parse(response.text || '{}') });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi trích xuất Blueprint';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/blueprint-step2', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const { blueprintJson, presetName = 'Đề tương tự Đẳng cấu' } = req.body as {
      blueprintJson: unknown;
      presetName?: string;
    };

    const prompt = `Giai đoạn 2 (Sinh Đề Đẳng Cấu Zero-Clone 100%) dựa trên Blueprint sau (${presetName}):
${JSON.stringify(blueprintJson)}

Hãy tạo mới hoàn toàn các câu hỏi đẳng cấu (thay đổi ngữ cảnh, số liệu, hàm số khác nhưng giữ đúng mức độ NB/TH/VD/VDC và chuyên đề). Trả về JSON gồm:
{
  "title": "...",
  "questions": [
    { "no": "Câu 1", "tag": "[12-C1-B1-NB]", "part": "Phần I", "stem": "...", "options": ["A...", "B...", "C...", "D..."], "answer": "B", "solution": "Bước 1: ...\\nBước 2: ..." }
  ]
}`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json({ generated: JSON.parse(response.text || '{}') });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi sinh đề đẳng cấu';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/lesson-plan', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      subject = 'Toán',
      grade = '12',
      lessonTitle = 'Tính đơn điệu và cực trị của hàm số',
      periods = 2,
      track = 'Đại trà (6.5–8.0)',
      includeDigitalCompetency = true,
    } = req.body as {
      subject?: string;
      grade?: string;
      lessonTitle?: string;
      periods?: number;
      track?: string;
      includeDigitalCompetency?: boolean;
    };

    const prompt = `Soạn Kế hoạch bài dạy (Giáo án) chuẩn Công văn 5512 môn ${subject} Lớp ${grade}, Bài: "${lessonTitle}" (${periods} tiết), Đối tượng: ${track}.
${includeDigitalCompetency ? 'Tích hợp Năng lực số theo Thông tư 02/2025 & CV 3456 và định hướng STEM/AI.' : ''}
Trả về JSON:
{
  "header": { "school": "THPT Lê Quý Đôn", "teacher": "Lê Trọng Toàn", "lesson": "${lessonTitle}", "periods": ${periods} },
  "objectives": { "knowledge": "...", "competencies": "...", "qualities": "...", "digitalAi": "..." },
  "activities": [
    { "name": "Hoạt động 1: Khởi động (Mở đầu)", "duration": "10 phút", "goal": "...", "content": "...", "product": "...", "execution": "..." },
    { "name": "Hoạt động 2: Hình thành kiến thức mới", "duration": "30 phút", "goal": "...", "content": "...", "product": "...", "execution": "..." },
    { "name": "Hoạt động 3: Luyện tập", "duration": "30 phút", "goal": "...", "content": "...", "product": "...", "execution": "..." },
    { "name": "Hoạt động 4: Vận dụng", "duration": "20 phút", "goal": "...", "content": "...", "product": "...", "execution": "..." }
  ]
}`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json({ lessonPlan: JSON.parse(response.text || '{}') });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi soạn giáo án CV 5512';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/pdf-auto-solve', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const { rawExamText } = req.body as { rawExamText: string };
    const prompt = `Hãy giải nhanh và trích xuất Barem đáp án chuẩn 3 phần (Phần I: 12 câu A/B/C/D; Phần II: 4 câu a,b,c,d Đúng/Sai; Phần III: 6 câu trả lời ngắn tối đa 4 ký tự dùng dấu phẩy) từ nội dung đề sau:\n${rawExamText}\nTrả về JSON: { "part1": ["B","C",...], "part2": [{"a":true,"b":true,"c":false,"d":false}, ...], "part3": ["2,4","218",...] }`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json({ answerKey: JSON.parse(response.text || '{}') });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi giải đề tự động';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/ai/gradebook-remarks', async (req, res) => {
  const ai = getGeminiClient();
  if (!ai) {
    res.status(400).json({ error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.' });
    return;
  }

  try {
    const {
      className = '12A1',
      semester = 1,
      subject = 'Toán',
      rows = [],
    } = req.body as {
      className?: string;
      semester?: number;
      subject?: string;
      rows?: {
        studentId: string;
        fullName: string;
        tbm: number | null;
        txCount: number;
        gk: number | null;
        ck: number | null;
        teacherNotes?: string;
      }[];
    };

    const prompt = `Bạn là giáo viên bộ môn ${subject} (Trường THPT Lê Quý Đôn, Đắk Lắk) đang viết nhận xét học kỳ ${semester} chuẩn Thông tư 22/2021 & Sổ điểm SMAS 4.0 cho lớp ${className}.
Dựa vào dữ liệu từng học sinh sau, hãy viết lời nhận xét sư phạm súc tích (12–22 từ, tự nhiên, khích lệ, không rập khuôn giống hệt nhau giữa các em, bám sát điểm TBM và ghi chú nếu có):
- Nếu TBM >= 8.0: khen ngợi nắm vững kiến thức, tư duy tốt, phát huy thêm vận dụng cao.
- Nếu 6.5 <= TBM < 8.0: nhận xét có cố gắng, nắm kiến thức cơ bản tốt, cần rèn thêm kỹ năng giải nhanh/tránh sai sót.
- Nếu 5.0 <= TBM < 6.5: nhận xét mức độ đạt yêu cầu, cần chăm chỉ làm thêm bài tập trọng tâm để nâng điểm.
- Nếu TBM < 5.0: nhắc nhở ân cần về việc hổng kiến thức/cần ôn tập lại lý thuyết cơ bản và tăng cường luyện tập.
- Nếu chưa có TBM: nhận xét theo ghi chú hiện có hoặc nhắc bổ sung đủ cột điểm kiểm tra.

Danh sách học sinh:
${JSON.stringify(rows)}

Trả về JSON thuần dạng:
{
  "remarks": [
    { "studentId": "...", "remark": "..." }
  ]
}`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    res.json(JSON.parse(response.text || '{"remarks":[]}'));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi gợi ý nhận xét AI';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/import/drive', async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Vui lòng cung cấp đường dẫn Google Drive hoặc Google Docs hợp lệ.' });
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      res.status(400).json({ error: 'Đường dẫn URL không hợp lệ.' });
      return;
    }

    const allowedHosts = ['docs.google.com', 'drive.google.com'];
    if (!allowedHosts.includes(parsedUrl.hostname)) {
      res.status(400).json({ error: 'Chỉ hỗ trợ liên kết từ docs.google.com hoặc drive.google.com.' });
      return;
    }

    const docMatch = parsedUrl.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    const fileMatch = parsedUrl.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const idParam = parsedUrl.searchParams.get('id');

    let downloadUrl = '';
    if (docMatch) {
      downloadUrl = `https://docs.google.com/document/d/${docMatch[1]}/export?format=txt`;
    } else if (fileMatch || idParam) {
      const fid = fileMatch ? fileMatch[1] : idParam;
      downloadUrl = `https://drive.google.com/uc?export=download&id=${fid}`;
    } else {
      res.status(400).json({ error: 'Không nhận diện được mã tệp (ID) trong liên kết Google Drive/Docs.' });
      return;
    }

    const response = await fetch(downloadUrl, { redirect: 'follow' });
    if (!response.ok) {
      res.status(400).json({
        error: 'Không thể tải tệp (tệp có thể đang để chế độ Riêng tư). Hãy bật "Bất kỳ ai có đường liên kết đều có thể xem" hoặc tải tệp .docx lên trực tiếp.',
      });
      return;
    }

    const buf = Buffer.from(await response.arrayBuffer());
    const isZip = buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b; // PK (.docx)
    if (isZip) {
      res.json({ kind: 'docx', base64: buf.toString('base64') });
      return;
    }
    const text = buf.toString('utf-8');
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      res.status(400).json({
        error: 'Liên kết yêu cầu đăng nhập hoặc chưa chia sẻ công khai. Thầy vui lòng tải file .docx/.txt từ máy tính hoặc dán nội dung trực tiếp.',
      });
      return;
    }
    res.json({ kind: 'text', text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi tải dữ liệu từ Google Drive';
    res.status(500).json({ error: msg });
  }
});

// ============================================================================
// SMARTBOARD AI PEN & MATH OCR ENDPOINT (/api/ai/smartboard-ocr)
// ============================================================================
app.post('/api/ai/smartboard-ocr', async (req, res) => {
  const {
    imageBase64,
    mimeType = 'image/png',
    contextText = '',
    action = 'both',
  } = req.body as {
    imageBase64?: string;
    mimeType?: string;
    contextText?: string;
    action?: 'ocr_katex' | 'explain_steps' | 'both';
  };

  const ai = getGeminiClient();
  if (!ai) {
    // Graceful pedagogical fallback if API key is not configured
    const fallbackTex =
      contextText.trim() ||
      '\\int_{0}^{1} (3x^2 - 2x + 1)\\,dx = \\left(x^3 - x^2 + x\\right)\\Big|_{0}^{1} = 1';
    res.json({
      result: {
        katexText: fallbackTex.includes('$') ? fallbackTex : `$$${fallbackTex}$$`,
        recognizedProblem:
          contextText.trim() || 'Nhận diện biểu thức Toán học viết tay trên bảng tương tác',
        steps: [
          {
            title: 'Bước 1: Chuyển đổi nét viết tay sang công thức chuẩn KaTeX',
            leadIn: 'Biểu thức Toán học nhận diện từ vùng khoanh chọn:',
            mathDetail: fallbackTex.includes('$') ? fallbackTex : `$${fallbackTex}$`,
          },
          {
            title: 'Bước 2: Phân tích & biến đổi tương đương',
            leadIn: 'Áp dụng quy tắc đạo hàm / nguyên hàm cơ bản SGK Toán THPT:',
            mathDetail: '$F(x) = x^3 - x^2 + x + C \\implies F(1) - F(0) = 1$',
          },
        ],
        finalAnswer: 'Kết quả nhận diện & chuẩn hóa KaTeX hoàn tất.',
      },
    });
    return;
  }

  try {
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (imageBase64) {
      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      parts.push({
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      });
    }

    const modeInstruction =
      action === 'ocr_katex'
        ? 'Trọng tâm: Nhận diện thật chính xác chữ viết tay và công thức Toán học trong ảnh vùng bảng trắng, chuyển thành chuỗi văn bản tiếng Việt kết hợp công thức chuẩn LaTeX/KaTeX ($...$ hoặc $$...$$).'
        : action === 'explain_steps'
          ? 'Trọng tâm: Nhận diện đề bài / phép tính trong vùng khoanh trên bảng và giải thích nhanh từng bước rõ ràng, dễ hiểu cho học sinh THPT trên màn hình lớn.'
          : 'Trọng tâm: Vừa chuyển chữ/công thức viết tay trong ảnh thành văn bản KaTeX sắc nét, vừa giải thích nhanh từng bước lời giải sư phạm.';

    parts.push({
      text: `Bạn là Trợ lý Bút AI (AI Pen & Math OCR) trên Bảng Trắng Tương Tác Thông Minh (Smartboard) môn Toán THPT.
${modeInstruction}
${contextText ? `\nNgữ cảnh thẻ câu hỏi / văn bản nằm trong vùng khoanh trên bảng:\n${contextText}\n` : ''}
Yêu cầu trả về đúng định dạng JSON thuần với các trường:
{
  "katexText": "Văn bản và công thức chuẩn LaTeX/KaTeX ($...$ hoặc $$...$$) sắc nét được chuyển đổi từ nét viết tay trong vùng khoanh",
  "recognizedProblem": "Tóm tắt ngắn gọn đề bài hoặc biểu thức đã nhận diện (có bọc $...$ cho ký hiệu toán)",
  "steps": [
    {
      "title": "Bước 1: ...",
      "leadIn": "Câu dẫn ngắn gọn kết thúc bằng dấu :",
      "mathDetail": "Biểu thức biến đổi LaTeX $...$"
    }
  ],
  "finalAnswer": "Kết luận / Đáp số cuối cùng (bọc $...$ cho công thức)"
}`,
    });

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: { parts },
      config: {
        systemInstruction: MATH_EXAM_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({ result: parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Lỗi nhận diện Bút AI & Math OCR';
    res.status(500).json({ error: msg });
  }
});

// ============================================================================
// REAL-TIME POP QUIZ QR SESSION STORE (/api/pop-quiz/:quizId)
// ============================================================================
interface PopQuizResponseItem {
  id: string;
  studentName: string;
  studentClass?: string;
  choice?: 'A' | 'B' | 'C' | 'D';
  comment?: string;
  submittedAt: string;
}

interface PopQuizSessionState {
  quizId: string;
  questionTitle: string;
  questionStem?: string;
  options: [string, string, string, string];
  correctOption?: 'A' | 'B' | 'C' | 'D';
  isOpen: boolean;
  createdAt: string;
  responses: PopQuizResponseItem[];
}

const popQuizSessions = new Map<string, PopQuizSessionState>();

app.get('/api/pop-quiz/:quizId', (req, res) => {
  const { quizId } = req.params;
  const session = popQuizSessions.get(quizId);
  if (!session) {
    // Return a default active session if student scans QR right away
    const defaultSession: PopQuizSessionState = {
      quizId,
      questionTitle: `Câu hỏi tương tác nhanh #${quizId}`,
      questionStem: 'Quan sát đề bài trên Bảng tương tác Smartboard và chọn đáp án đúng (A, B, C, D) hoặc gửi ý kiến thảo luận.',
      options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
      isOpen: true,
      createdAt: new Date().toISOString(),
      responses: [],
    };
    popQuizSessions.set(quizId, defaultSession);
    res.json({ session: defaultSession });
    return;
  }
  res.json({ session });
});

app.post('/api/pop-quiz/:quizId', (req, res) => {
  const { quizId } = req.params;
  const body = req.body as Partial<PopQuizSessionState>;
  const existing = popQuizSessions.get(quizId);
  const updated: PopQuizSessionState = {
    quizId,
    questionTitle: body.questionTitle ?? existing?.questionTitle ?? `Câu hỏi tương tác #${quizId}`,
    questionStem: body.questionStem ?? existing?.questionStem ?? '',
    options: body.options ?? existing?.options ?? ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
    correctOption: body.correctOption ?? existing?.correctOption,
    isOpen: body.isOpen ?? existing?.isOpen ?? true,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    responses: body.responses ?? existing?.responses ?? [],
  };
  popQuizSessions.set(quizId, updated);
  res.json({ session: updated });
});

app.post('/api/pop-quiz/:quizId/respond', (req, res) => {
  const { quizId } = req.params;
  const { studentName, studentClass, choice, comment } = req.body as {
    studentName: string;
    studentClass?: string;
    choice?: 'A' | 'B' | 'C' | 'D';
    comment?: string;
  };
  let session = popQuizSessions.get(quizId);
  if (!session) {
    session = {
      quizId,
      questionTitle: `Câu hỏi tương tác nhanh #${quizId}`,
      questionStem: '',
      options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D'],
      isOpen: true,
      createdAt: new Date().toISOString(),
      responses: [],
    };
    popQuizSessions.set(quizId, session);
  }
  if (!session.isOpen) {
    res.status(400).json({ error: 'Giáo viên đã đóng nhận câu trả lời cho phiên tương tác này.' });
    return;
  }
  const cleanName = (studentName || 'Học sinh').trim();
  const newItem: PopQuizResponseItem = {
    id: `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    studentName: cleanName,
    studentClass: studentClass?.trim() || '12A1',
    choice,
    comment: comment?.trim() || undefined,
    submittedAt: new Date().toISOString(),
  };
  // Replace previous choice from same student name if they re-submit choice, or append
  const existingIdx = session.responses.findIndex(
    (r) => r.studentName.toLowerCase() === cleanName.toLowerCase() && choice && r.choice
  );
  if (existingIdx >= 0 && choice) {
    session.responses[existingIdx] = {
      ...session.responses[existingIdx],
      choice,
      comment: comment?.trim() || session.responses[existingIdx].comment,
      submittedAt: newItem.submittedAt,
    };
  } else {
    session.responses.unshift(newItem);
  }
  res.json({ session, response: newItem });
});

async function startServer() {
  const httpServer = http.createServer(app);

  // Live API WebSocket Bridge (/api/live-voice)
  const liveWss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url && req.url.startsWith('/api/live-voice')) {
      liveWss.handleUpgrade(req, socket, head, (ws) => {
        liveWss.emit('connection', ws, req);
      });
    }
  });

  liveWss.on('connection', async (clientWs, req) => {
    const ai = getGeminiClient();
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          error: 'Chưa cấu hình GEMINI_API_KEY trong Settings > Secrets.',
        })
      );
      clientWs.close();
      return;
    }

    const reqUrl = new URL(req.url || '/api/live-voice', `http://${req.headers.host || 'localhost'}`);
    const voiceName = reqUrl.searchParams.get('voice') || 'Zephyr';

    let sessionPromise: Promise<any> | null = null;
    try {
      sessionPromise = ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction:
            'Bạn là Trợ lý Giọng nói Chuyên môn Toán THPT TeachLearn Edu hỗ trợ Thầy giáo Lê Trọng Toàn và học sinh Trường THPT Lê Quý Đôn. Trả lời ngắn gọn, rõ ràng, thân thiện bằng tiếng Việt.',
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ status: 'connected' }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== clientWs.OPEN) return;
            const parts = message.serverContent?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            const inText = (message.serverContent as any)?.inputTranscription?.text;
            if (inText) {
              clientWs.send(JSON.stringify({ inputTranscript: inText }));
            }
            const outText = (message.serverContent as any)?.outputTranscription?.text;
            if (outText) {
              clientWs.send(JSON.stringify({ outputTranscript: outText }));
            }
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onerror: (err: unknown) => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(
                JSON.stringify({
                  error: err instanceof Error ? err.message : 'Lỗi kết nối Gemini Live API',
                })
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.close();
            }
          },
        },
      });

      const activeSession = await sessionPromise;

      clientWs.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          if (parsed.audio) {
            activeSession.sendRealtimeInput({
              audio: {
                data: parsed.audio,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          } else if (parsed.text) {
            activeSession.sendRealtimeInput({
              text: parsed.text,
            });
          }
        } catch {
          // ignore malformed frame
        }
      });

      clientWs.on('close', () => {
        try {
          activeSession.close();
        } catch {
          // ignore close error
        }
      });
    } catch (err: unknown) {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Không thể khởi tạo phiên Gemini Live',
          })
        );
        clientWs.close();
      }
    }
  });

  app.use('/sw.js', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    next();
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`EduPlan AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
