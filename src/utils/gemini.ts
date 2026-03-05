import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is not set");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export interface AnalysisData {
  reference_object: {
    label: string;
    box_2d: [number, number, number, number]; // ymin, xmin, ymax, xmax
  };
  main_object: {
    label: string;
    box_2d: [number, number, number, number];
    dimensions_m: {
      length: number;
      width: number;
      height: number;
    };
    volume_m3: number;
    is_cardboard: boolean;
  };
  reasoning: string;
}

export interface BoxContentsData {
  items: string[];
  summary: string;
}

export async function analyzeBoxContents(
  base64Image: string,
  mimeType: string,
  onLog?: (message: string) => void
): Promise<BoxContentsData> {
  const model = "gemini-3-flash-preview";
  onLog?.("正在分析內容物照片...");

  const prompt = `
    你是一個專業的物體識別助手。請分析這張照片，這是一張紙箱或容器內部的照片。
    請列出你在照片中看到的所有物體清單。
    
    請以 JSON 格式回傳結果：
    - items: 字串陣列，列出所有偵測到的物體名稱（請使用繁體中文）。
    - summary: 一段簡短的總結，描述內容物的整體情況。
  `;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            summary: { type: Type.STRING }
          },
          required: ["items", "summary"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text.trim()) as BoxContentsData;
    }
    throw new Error("無法取得分析結果");
  } catch (error) {
    console.error("Error analyzing box contents:", error);
    throw error;
  }
}

export async function analyzeImage(
  base64Image: string,
  mimeType: string,
  onLog?: (message: string) => void
): Promise<AnalysisData> {
  const model = "gemini-3-flash-preview";
  
  onLog?.("Initializing Gemini model: " + model);

  let prompt = `
    你是一個專業的「AI 搬家估算系統」空間測量助手。請分析這張圖片，圖片中會有一個已知尺寸的參考物（請優先尋找標準 **A4紙 (21公分 x 29.7公分 = 0.21公尺 x 0.297公尺)**，或 **標準信用卡/悠遊卡/身分證 (8.56公分 x 5.4公分 = 0.0856公尺 x 0.054公尺)**，若無則尋找 **台幣十元硬幣 (直徑 2.6公分 = 0.026公尺)**）和一個主要需要搬運的目標物體（如傢俱、家電、紙箱等）。

    請嚴格執行以下測量步驟以降低誤差：
    1. **識別與定位**：
       - 找出參考物 (A4紙、信用卡/悠遊卡 或 十元硬幣)。
       - 找出主要搬運物體 (Main Object)。
       - 標記兩者的 2D 邊界框。

    2. **建立比例尺 (減少誤差的關鍵)**：
       - 根據參考物在圖片中的像素尺寸，計算出「像素-公尺」比例。
       - **注意**：大型傢俱的誤差通常來自於參考物太小。如果你找到的是 A4 紙，請利用其長邊 (29.7cm) 或短邊 (21cm) 建立更精確的比例尺。請注意參考物是否因為透視而變形。

    3. **透視與深度校正**：
       - 評估參考物與目標物體是否在同一深度平面。如果參考物離鏡頭較近，請補償放大效應（這往往是高估尺寸的主因）。
       - 利用物體的垂直與水平邊緣線，結合透視消失點，推算物體在 3D 空間中的真實尺寸。

    4. **材質與體積計算**：
       - 判斷主要物體是否為「紙箱」。
       - 計算物體的基礎體積（長 x 寬 x 高）。
       - 如果是紙箱，將基礎體積乘以 **1.25** 倍作為最終體積（預留裝箱膨脹與堆疊空隙）。
       - 長、寬、高（dimensions_m）必須是**實際物理尺寸**。

    5. **最終輸出**：
       - 輸出主要物體的長、寬、高（單位：公尺，保留 3 位小數）。
       - 輸出最終體積（單位：立方公尺）。
       - 標記是否為紙箱。
       - **重要：如果偵測到的物體是紙箱，請將其名稱 (label) 統一設定為「紙箱」，不要包含額外的描述（如「衛生紙紙箱」或「大型主機電腦紙箱」）。**
    
    請以 JSON 格式回傳結果，包含以下欄位：
    - reference_object: 包含 label (例如 "A4 Paper", "Credit Card", 或 "Taiwan 10 NTD Coin") 和 box_2d ([ymin, xmin, ymax, xmax], 範圍 0-1000)。
    - main_object: 包含 label (物體名稱，請務必使用繁體中文，例如「雙人床墊」、「單門冰箱」、「紙箱」), box_2d ([ymin, xmin, ymax, xmax], 範圍 0-1000), dimensions_m (length, width, height), volume_m3, is_cardboard (boolean)。
    - reasoning: 簡短說明你的估算邏輯，包含你使用了哪種參考物、如何處理透視變形、以及深度差異的校正。**請務必使用繁體中文回答。**
  `;

  try {
    onLog?.("Sending request to Gemini API...");
    const startTime = Date.now();
    
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Image,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reference_object: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                box_2d: {
                  type: Type.ARRAY,
                  items: { type: Type.NUMBER },
                  description: "Bounding box [ymin, xmin, ymax, xmax] normalized to 1000",
                },
              },
              required: ["label", "box_2d"],
            },
            main_object: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                box_2d: {
                  type: Type.ARRAY,
                  items: { type: Type.NUMBER },
                  description: "Bounding box [ymin, xmin, ymax, xmax] normalized to 1000",
                },
                dimensions_m: {
                  type: Type.OBJECT,
                  properties: {
                    length: { type: Type.NUMBER },
                    width: { type: Type.NUMBER },
                    height: { type: Type.NUMBER },
                  },
                  required: ["length", "width", "height"],
                },
                volume_m3: { type: Type.NUMBER },
                is_cardboard: { type: Type.BOOLEAN },
              },
              required: ["label", "box_2d", "dimensions_m", "volume_m3", "is_cardboard"],
            },
            reasoning: { type: Type.STRING },
          },
          required: ["reference_object", "main_object", "reasoning"],
        },
      },
    });

    const duration = Date.now() - startTime;
    onLog?.(`Received response from Gemini API in ${duration}ms`);

    if (response.text) {
      onLog?.("Parsing JSON response...");
      // Clean JSON string (remove markdown code blocks if present)
      let jsonStr = response.text.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/^```json\n/, "").replace(/\n```$/, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```\n/, "").replace(/\n```$/, "");
      }
      
      const data = JSON.parse(jsonStr) as AnalysisData;
      onLog?.("Analysis complete.");
      return data;
    }
    throw new Error("No response text from Gemini");
  } catch (error) {
    onLog?.(`Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error("Error analyzing image:", error);
    throw error;
  }
}
