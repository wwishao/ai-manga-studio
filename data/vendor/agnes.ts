/**
 * Agnes AI 供应商配置
 * 兼容 OpenAI API 格式
 * @version 1.0
 */
// ============================================================
// 类型定义
// ============================================================
type VideoMode =
  | "singleImage"
  | "startEndRequired"
  | "endFrameOptional"
  | "startFrameOptional"
  | "text"
  | (`videoReference:${number}` | `imageReference:${number}` | `audioReference:${number}`)[];

interface TextModel {
  name: string;
  modelName: string;
  type: "text";
  think: boolean;
}
interface ImageModel {
  name: string;
  modelName: string;
  type: "image";
  mode: ("text" | "singleImage" | "multiReference")[];
  associationSkills?: string;
}
interface VideoModel {
  name: string;
  modelName: string;
  type: "video";
  mode: VideoMode[];
  associationSkills?: string;
  audio: "optional" | false | true;
  durationResolutionMap: { duration: number[]; resolution: string[] }[];
}
interface TTSModel {
  name: string;
  modelName: string;
  type: "tts";
  voices: { title: string; voice: string }[];
}
interface ImageConfig {
  prompt: string;
  imageBase64: string[];
  size: "1K" | "2K" | "4K";
  aspectRatio: `${number}:${number}`;
}
interface VideoConfig {
  duration: number;
  resolution: string;
  aspectRatio: "16:9" | "9:16";
  prompt: string;
  imageBase64?: string[];
  audio?: boolean;
  mode: VideoMode[];
}
interface TTSConfig {
  text: string;
  voice: string;
  speechRate: number;
  pitchRate: number;
  volume: number;
}
interface PollResult {
  completed: boolean;
  data?: string;
  error?: string;
}

// ============================================================
// 全局声明
// ============================================================
declare const axios: any;
declare const logger: (msg: string) => void;
declare const zipImage: (base64: string, size: number) => Promise<string>;

// ============================================================
// 供应商配置
// ============================================================
const BASE_URL = "https://apihub.agnes-ai.com/v1";
const API_KEY = "sk-rIBqS1cwhN8HQ8JhLiVOnKkk3U0qm95FzYYqLJEJWGEBa8ph";

function getBaseUrl(): string {
  return BASE_URL;
}

function getHeaders(): Record<string, string> {
  return {
    "Authorization": "Bearer " + API_KEY,
    "Content-Type": "application/json",
  };
}

const vendor = {
  id: "agnes",
  version: "1.0",
  name: "Agnes AI",
  author: "",
  description: "Agnes AI 智能模型平台 - 兼容 OpenAI API",
  icon: "",
  inputs: [
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      required: true,
      placeholder: "输入 Agnes AI API Key",
    },
    {
      key: "baseURL",
      label: "接口地址",
      type: "url",
      required: true,
      placeholder: "https://apihub.agnes-ai.com/v1",
    },
  ],
  inputValues: {
    apiKey: API_KEY,
    baseURL: BASE_URL,
  },
  models: [
    // ========== 文本模型 ==========
    {
      name: "DeepSeek V4 Pro",
      modelName: "deepseek-v4-pro",
      type: "text",
      think: false,
    } as TextModel,
    {
      name: "DeepSeek V4 Pro (Thinking)",
      modelName: "deepseek-v4-pro",
      type: "text",
      think: true,
    } as TextModel,
    {
      name: "Claude Opus 4.6",
      modelName: "claude-4.6-opus",
      type: "text",
      think: false,
    } as TextModel,
    {
      name: "GPT 4o",
      modelName: "gpt-4o",
      type: "text",
      think: false,
    } as TextModel,
    {
      name: "GPT 4o Mini",
      modelName: "gpt-4o-mini",
      type: "text",
      think: false,
    } as TextModel,
    {
      name: "Gemini 2.5 Pro",
      modelName: "gemini-2.5-pro",
      type: "text",
      think: true,
    } as TextModel,
    {
      name: "Gemini 2.5 Flash",
      modelName: "gemini-2.5-flash",
      type: "text",
      think: true,
    } as TextModel,
    // ========== 图像模型 ==========
    {
      name: "Agnes Image 2.0 Flash",
      modelName: "agnes-image-2.0-flash",
      type: "image",
      mode: ["text", "singleImage", "multiReference"],
    } as ImageModel,
    {
      name: "Agnes Image 2.1 Flash",
      modelName: "agnes-image-2.1-flash",
      type: "image",
      mode: ["text", "singleImage", "multiReference"],
    } as ImageModel,
    // ========== 视频模型 ==========
    {
      name: "Agnes Video 1.0",
      modelName: "agnes-video-1.0",
      type: "video",
      mode: ["singleImage"],
      audio: "optional",
      durationResolutionMap: [
        { duration: [5, 10, 15], resolution: ["1080x1920", "1920x1080"] },
      ],
    } as VideoModel,
    // ========== TTS 模型 ==========
    {
      name: "Agnes TTS",
      modelName: "agnes-tts-1",
      type: "tts",
      voices: [
        { title: "中文女声", voice: "zh-CN-XiaoxiaoNeural" },
        { title: "中文男声", voice: "zh-CN-YunxiNeural" },
      ],
    } as TTSModel,
  ],
};

// ============================================================
// 模型示例配置
// ============================================================
const sampleModel = async (model: TextModel | ImageModel | VideoModel | TTSModel) => {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();

  if (model.type === "text") {
    try {
      const resp = await axios.post(
        baseUrl + "/chat/completions",
        {
          model: model.modelName,
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 5,
        },
        { headers, timeout: 10000 }
      );
      return { success: true, data: resp.data };
    } catch (e: any) {
      return { success: false, error: e.message || "请求失败" };
    }
  }
  return { success: true };
};

// ============================================================
// 文本请求 - 兼容 OpenAI Chat Completions API
// ============================================================
const textRequest = async (
  messages: { role: string; content: string; name?: string }[],
  model: TextModel,
  stream: boolean,
  onStream?: (text: string) => void,
  signal?: AbortSignal
): Promise<string> => {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();

  // 构建请求体
  const body: any = {
    model: model.modelName,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
    })),
    stream: stream,
  };

  // 开启思考模式
  if (model.think) {
    body.thinking = { type: "enabled" };
  }

  // 流式请求
  if (stream) {
    const resp = await axios.post(baseUrl + "/chat/completions", body, {
      headers,
      responseType: "stream",
      timeout: 120000,
      signal,
    });

    let fullText = "";
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    return new Promise((resolve, reject) => {
      resp.data.on("data", (chunk: Buffer) => {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            resolve(fullText);
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              if (onStream) onStream(delta);
            }
          } catch {
            // 解析失败跳过
          }
        }
      });

      resp.data.on("end", () => {
        resolve(fullText);
      });

      resp.data.on("error", (err: Error) => {
        reject(err);
      });
    });
  }

  // 非流式请求
  const resp = await axios.post(baseUrl + "/chat/completions", body, {
    headers,
    timeout: 120000,
    signal,
  });

  return resp.data?.choices?.[0]?.message?.content || "";
};

// ============================================================
// 图像请求
// ============================================================
const imageRequest = async (config: ImageConfig, model: ImageModel): Promise<string> => {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();

  const body: any = {
    model: model.modelName,
    prompt: config.prompt || "",
    n: 1,
    size: "1024x1024",
    response_format: "b64_json",
  };

  // 处理比例
  if (config.aspectRatio) {
    const ratioMap: Record<string, string> = {
      "1:1": "1024x1024",
      "4:3": "1152x864",
      "3:4": "864x1152",
      "16:9": "1280x720",
      "9:16": "720x1280",
      "3:2": "1248x832",
      "2:3": "832x1248",
      "21:9": "1512x648",
    };
    body.size = ratioMap[config.aspectRatio] || "1024x1024";
  }

  // 参考图
  if (config.imageBase64 && config.imageBase64.length > 0) {
    body.image = config.imageBase64.length === 1 ? config.imageBase64[0] : config.imageBase64;
  }

  const resp = await axios.post(baseUrl + "/images/generations", body, {
    headers,
    timeout: 120000,
  });

  const imageData = resp.data?.data?.[0];
  if (!imageData) {
    // 尝试其他响应格式
    if (resp.data?.url) return resp.data.url;
    if (resp.data?.data?.[0]?.url) return resp.data.data[0].url;
    if (resp.data?.data?.[0]?.b64_json) return "data:image/png;base64," + resp.data.data[0].b64_json;
    throw new Error("图像生成失败：无返回数据");
  }

  if (imageData.url) return imageData.url;
  if (imageData.b64_json) return "data:image/png;base64," + imageData.b64_json;

  throw new Error("图像生成失败：未知响应格式");
};

// ============================================================
// 视频请求 - Agnes Video API
// ============================================================
const videoRequest = async (config: VideoConfig, model: VideoModel): Promise<string> => {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();

  const body: any = {
    model: model.modelName,
    prompt: config.prompt,
    duration: config.duration || 5,
    resolution: config.resolution || "1080x1920",
  };

  // 参考图片
  if (config.imageBase64 && config.imageBase64.length > 0) {
    body.image = config.imageBase64[0];
  }

  const resp = await axios.post(baseUrl + "/video/generations", body, {
    headers,
    timeout: 300000,
  });

  // 返回 task_id 用于轮询
  if (resp.data?.task_id) return resp.data.task_id;
  if (resp.data?.id) return resp.data.id;
  if (resp.data?.data?.id) return resp.data.data.id;
  
  throw new Error("视频生成失败：无任务ID");
};

// ============================================================
// 视频任务轮询
// ============================================================
const pollVideoTask = async (taskId: string, model: VideoModel): Promise<PollResult> => {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();

  try {
    const resp = await axios.get(baseUrl + "/video/status", {
      params: { task_id: taskId },
      headers,
      timeout: 30000,
    });

    const status = resp.data?.status || resp.data?.state || "";
    
    if (status === "succeeded" || status === "completed" || status === "success") {
      const videoUrl = resp.data?.video_url || resp.data?.output?.video_url || resp.data?.data?.url || "";
      return { completed: true, data: videoUrl };
    }

    if (status === "failed" || status === "error") {
      return { completed: true, error: resp.data?.error || "视频生成失败" };
    }

    return { completed: false };
  } catch (e: any) {
    return { completed: false, error: e.message };
  }
};

// ============================================================
// TTS 请求
// ============================================================
const ttsRequest = async (config: TTSConfig, model: TTSModel): Promise<string> => {
  const baseUrl = getBaseUrl();
  const headers = getHeaders();

  const body = {
    model: model.modelName,
    input: config.text,
    voice: config.voice || "zh-CN-XiaoxiaoNeural",
    speed: config.speechRate || 1.0,
  };

  const resp = await axios.post(baseUrl + "/audio/speech", body, {
    headers,
    responseType: "arraybuffer",
    timeout: 60000,
  });

  return Buffer.from(resp.data).toString("base64");
};

exports.vendor = vendor;
exports.textRequest = textRequest;
exports.imageRequest = imageRequest;
exports.videoRequest = videoRequest;
exports.ttsRequest = ttsRequest;
export {};
