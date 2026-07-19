import { Socket } from "socket.io";
import ResTool from "@/socket/resTool";

/**
 * 交互式确认节点系统
 * 
 * 允许 Agent 在关键流程节点暂停，向用户发送确认请求，
 * 并等待用户响应后再继续执行。
 * 
 * 使用方式：
 * ```typescript
 * const confirm = new InteractiveConfirm(socket, resTool, msg);
 * 
 * // 发起风格选择
 * const style = await confirm.choose("style_select", {
 *   title: "请选择画风",
 *   options: ["水墨风", "日系动漫", "古风", "写实"],
 * });
 * 
 * // 发起确认
 * const agreed = await confirm.ask("confirm_story", {
 *   title: "确认故事大纲",
 *   content: "以上就是故事大纲，是否满意？",
 * });
 * ```
 */

export interface ChoiceOption {
  label: string;
  value: string;
  description?: string;
  imageUrl?: string;
}

export interface ConfirmQuestion {
  title: string;
  content?: string;
  options?: ChoiceOption[];
  type: "confirm" | "choice" | "input" | "multi_choice";
}

export interface ConfirmResponse {
  type: string;
  value: any;
  timestamp: number;
}

export class InteractiveConfirm {
  private socket: Socket;
  private resTool: ResTool;
  private msg: ReturnType<ResTool["newMessage"]>;
  private pendingResolvers: Map<string, { resolve: (value: any) => void; reject: (reason: any) => void; timeout: NodeJS.Timeout }> = new Map();
  private responseHandler: ((data: any) => void) | null = null;

  constructor(socket: Socket, resTool: ResTool, msg: ReturnType<ResTool["newMessage"]>) {
    this.socket = socket;
    this.resTool = resTool;
    this.msg = msg;

    // 注册响应监听
    this.responseHandler = (data: any) => {
      const resolver = this.pendingResolvers.get(data.type);
      if (resolver) {
        clearTimeout(resolver.timeout);
        this.pendingResolvers.delete(data.type);
        resolver.resolve(data.value);
      }
    };

    this.socket.on("confirm:response", this.responseHandler);
  }

  /**
   * 销毁监听器
   */
  destroy() {
    if (this.responseHandler) {
      this.socket.off("confirm:response", this.responseHandler);
      this.responseHandler = null;
    }
    // 清理所有等待中的 resolver
    for (const [, resolver] of this.pendingResolvers) {
      clearTimeout(resolver.timeout);
      resolver.reject(new Error("InteractiveConfirm 已销毁"));
    }
    this.pendingResolvers.clear();
  }

  /**
   * 发送确认请求，等待用户响应
   */
  private async waitForResponse(type: string, question: ConfirmQuestion, timeoutMs: number = 300000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResolvers.delete(type);
        reject(new Error(`确认超时：${question.title}`));
      }, timeoutMs);

      this.pendingResolvers.set(type, { resolve, reject, timeout });

      // 通过 Activity 内容类型发送确认请求
      this.msg.activity("confirm", {
        type,
        question,
        timeoutMs,
      });
    });
  }

  /**
   * 确认/取消询问
   */
  async ask(type: string, question: {
    title: string;
    content?: string;
  }): Promise<boolean> {
    const result = await this.waitForResponse(type, {
      title: question.title,
      content: question.content,
      type: "confirm",
      options: [
        { label: "✅ 确认", value: "true", description: "确认并继续" },
        { label: "❌ 取消", value: "false", description: "取消并修改" },
      ],
    });
    return result === true;
  }

  /**
   * 多选一选择
   */
  async choose(type: string, question: {
    title: string;
    options: ChoiceOption[];
    content?: string;
  }): Promise<string> {
    const result = await this.waitForResponse(type, {
      title: question.title,
      content: question.content,
      type: "choice",
      options: question.options,
    });
    return result;
  }

  /**
   * 多选（可多选）
   */
  async multiChoose(type: string, question: {
    title: string;
    options: ChoiceOption[];
    content?: string;
    min?: number;
    max?: number;
  }): Promise<string[]> {
    const result = await this.waitForResponse(type, {
      title: question.title,
      content: question.content,
      type: "multi_choice",
      options: question.options,
    });
    return Array.isArray(result) ? result : [result];
  }

  /**
   * 文本输入
   */
  async input(type: string, question: {
    title: string;
    placeholder?: string;
    defaultValue?: string;
  }): Promise<string> {
    const result = await this.waitForResponse(type, {
      title: question.title,
      type: "input",
    });
    return result || question.defaultValue || "";
  }

  /**
   * 发送信息（不需要响应，仅显示）
   */
  info(title: string, content?: string) {
    this.msg.activity("info", {
      title,
      content,
    });
    return this;
  }

  /**
   * 发送进度更新
   */
  progress(title: string, percent: number, status?: string) {
    this.msg.activity("progress", {
      title,
      percent,
      status,
    });
    return this;
  }

  /**
   * 发送风格选择面板
   */
  async selectStyle(): Promise<{
    artStyle: string;
    colorTone: string;
    pacing: string;
    outputType: string;
    voiceStyle: string;
  }> {
    const artStyle = await this.choose("style_artStyle", {
      title: "🎨 请选择画风",
      content: "您希望作品呈现什么样的视觉风格？",
      options: [
        { label: "水墨风", value: "水墨风", description: "中国传统水墨画风格，意境深远" },
        { label: "日系动漫", value: "日系动漫", description: "日本动画风格，色彩鲜明" },
        { label: "古风", value: "古风", description: "中国古典美学风格" },
        { label: "写实", value: "写实", description: "逼真的现实风格" },
        { label: "Q版", value: "Q版", description: "可爱卡通风格" },
        { label: "赛博朋克", value: "赛博朋克", description: "霓虹灯光与高科技的科幻风格" },
      ],
    });

    const colorTone = await this.choose("style_colorTone", {
      title: "🎭 请选择色调",
      content: "您希望作品的色彩基调是什么？",
      options: [
        { label: "明亮温暖", value: "明亮温暖", description: "阳光、温暖、积极" },
        { label: "暗黑冷峻", value: "暗黑冷峻", description: "深沉、冷酷、神秘" },
        { label: "怀旧复古", value: "怀旧复古", description: "旧时光的温暖色调" },
        { label: "鲜艳多彩", value: "鲜艳多彩", description: "色彩丰富、活泼" },
        { label: "黑白", value: "黑白", description: "经典黑白风格" },
      ],
    });

    const pacing = await this.choose("style_pacing", {
      title: "📖 请选择叙事节奏",
      content: "您希望故事的节奏如何？",
      options: [
        { label: "轻松搞笑", value: "轻松搞笑", description: "轻松愉快，笑点密集" },
        { label: "紧张刺激", value: "紧张刺激", description: "节奏紧凑，扣人心弦" },
        { label: "温馨治愈", value: "温馨治愈", description: "温暖人心，治愈系" },
        { label: "悬疑惊悚", value: "悬疑惊悚", description: "悬念迭起，惊险刺激" },
        { label: "史诗磅礴", value: "史诗磅礴", description: "宏大叙事，气势恢宏" },
      ],
    });

    const outputType = await this.choose("style_outputType", {
      title: "🎬 请选择输出类型",
      content: "您希望最终生成什么形式的作品？",
      options: [
        { label: "漫剧（推荐）", value: "漫剧", description: "动态漫画，画面精美，制作快速" },
        { label: "短视频", value: "短视频", description: "1-3分钟短片，适合社交媒体" },
        { label: "电影短片", value: "电影短片", description: "5-10分钟电影风格短片" },
      ],
    });

    const voiceStyle = await this.choose("style_voiceStyle", {
      title: "🎙 请选择配音风格",
      content: "您希望作品的音频风格是什么？",
      options: [
        { label: "旁白解说", value: "旁白解说", description: "叙述者讲解故事" },
        { label: "角色对话", value: "角色对话", description: "角色之间有对白" },
        { label: "无声配乐", value: "无声配乐", description: "仅背景音乐，无配音" },
      ],
    });

    return { artStyle, colorTone, pacing, outputType, voiceStyle };
  }
}

export default InteractiveConfirm;
