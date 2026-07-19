import u from "@/utils";
import ResTool from "@/socket/resTool";
import * as fs from "fs";
import path from "path";

/**
 * 漫剧模式（动态漫画/Motion Comic）
 * 
 * 将标准的视频生成管线转换为漫剧输出模式。
 * 漫剧是一种介于漫画和动画之间的形式：
 * - 使用静态或半动态画面
 * - 添加运镜（推拉摇移）
 * - 添加特效字幕
 * - 添加转场动画
 * - 配音 + 音效
 */

export interface MangaConfig {
  /** 每格持续秒数 */
  panelDuration: number;
  /** 格之间转场类型 */
  transition: "fade" | "slide" | "zoom" | "none";
  /** 是否启用动态运镜 */
  cameraMotion: boolean;
  /** 字幕样式 */
  subtitleStyle: "standard" | "comic" | "minimal";
  /** 分格布局 */
  layout: "single" | "comic_strip" | "multi_panel";
  /** 是否添加特效 */
  effects: boolean;
  /** 背景音乐风格 */
  bgm: "none" | "dramatic" | "comedy" | "action" | "romantic";
}

export const DEFAULT_MANGA_CONFIG: MangaConfig = {
  panelDuration: 5,
  transition: "fade",
  cameraMotion: true,
  subtitleStyle: "comic",
  layout: "single",
  effects: true,
  bgm: "dramatic",
};

/**
 * 漫剧模式管理器
 */
export class MangaModeManager {
  private resTool: ResTool;
  private config: MangaConfig;

  constructor(resTool: ResTool, config: Partial<MangaConfig> = {}) {
    this.resTool = resTool;
    this.config = { ...DEFAULT_MANGA_CONFIG, ...config };
  }

  getConfig(): MangaConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<MangaConfig>) {
    this.config = { ...this.config, ...partial };
  }

  /**
   * 将分镜数据转换为漫剧面板布局
   */
  async convertToMangaPanels(storyboardData: any[]) {
    const { socket, data: { projectId } } = this.resTool;

    // 计算每个面板的持续时间
    const panels = storyboardData.map((item: any, index: number) => ({
      id: item.id || `panel_${index}`,
      index: index + 1,
      imageUrl: item.src || item.imageUrl || "",
      duration: this.config.panelDuration,
      text: item.content || item.prompt || "",
      cameraMotion: this.getCameraMotion(index),
      transition: this.config.transition,
      subtitle: this.formatSubtitle(item.content || "", item.characters),
    }));

    // 发送漫剧布局数据到前端
    socket.emit("manga:layout", {
      projectId,
      panels,
      config: this.config,
      totalDuration: panels.reduce((sum, p) => sum + p.duration, 0),
    });

    return panels;
  }

  /**
   * 生成运镜指令
   */
  private getCameraMotion(panelIndex: number): string {
    if (!this.config.cameraMotion) return "static";

    const motions = [
      "zoom_in",      // 推进
      "zoom_out",     // 拉远
      "pan_left",     // 左移
      "pan_right",    // 右移
      "tilt_up",      // 上摇
      "tilt_down",    // 下摇
      "static",       // 静止
    ];

    // 根据索引选择运镜，避免连续相同
    const motionIndex = panelIndex % motions.length;
    return motions[motionIndex];
  }

  /**
   * 格式化字幕文本
   */
  private formatSubtitle(content: string, characters?: string): string {
    if (!content) return "";

    switch (this.config.subtitleStyle) {
      case "comic":
        // 漫画风格：气泡式，角色名前置
        if (characters) {
          return `[${characters}] ${content}`;
        }
        return content;
      case "standard":
        return content;
      case "minimal":
        return content.length > 50 ? content.substring(0, 50) + "..." : content;
      default:
        return content;
    }
  }

  /**
   * 生成漫剧时间线数据（用于 FFmpeg 合成）
   */
  async generateTimeline(panels: any[]) {
    let timeline = [];
    let currentTime = 0;

    for (const panel of panels) {
      timeline.push({
        startTime: currentTime,
        endTime: currentTime + panel.duration,
        imageUrl: panel.imageUrl,
        cameraMotion: panel.cameraMotion,
        transition: panel.transition,
        subtitle: panel.subtitle,
        duration: panel.duration,
      });
      currentTime += panel.duration;
    }

    return {
      totalDuration: currentTime,
      panels: timeline,
      config: this.config,
    };
  }

  /**
   * 导出为漫剧 XML（兼容 FCPXML 的简化版本）
   */
  async exportToFCPXML(panels: any[]) {
    const timeline = await this.generateTimeline(panels);
    
    // 生成兼容 Final Cut Pro 的 XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <asset id="r1" name="MangaVideo" />
  </resources>
  <library>
    <event name="Manga Export">
      <project name="漫剧导出" duration="${timeline.totalDuration}s">
        <sequence duration="${timeline.totalDuration}s">
          <spine>
`;

    for (const panel of timeline.panels) {
      xml += `            <asset-clip
              name="panel_${panel.startTime}"
              offset="${panel.startTime}s"
              duration="${panel.duration}s"
              start="${panel.startTime}s"
            />
`;
    }

    xml += `          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;

    return xml;
  }

  /**
   * 生成漫剧 HTML 预览
   */
  async generateHTMLPreview(panels: any[]) {
    const timeline = await this.generateTimeline(panels);

    let panelHtml = "";
    for (const panel of timeline.panels) {
      panelHtml += `
    <div class="panel" data-start="${panel.startTime}" data-duration="${panel.duration}" style="animation-duration: ${panel.duration}s;">
      <img src="${panel.imageUrl}" alt="panel" class="panel-image ${panel.cameraMotion}" />
      ${panel.subtitle ? `<div class="subtitle">${panel.subtitle}</div>` : ""}
    </div>`;
    }

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>漫剧预览</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: "Microsoft YaHei", sans-serif; }
  .stage { width: 1080px; height: 1920px; position: relative; overflow: hidden; background: #111; }
  .panel { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; animation: fadeIn 0.5s ease-in forwards; }
  .panel-image { width: 100%; height: 100%; object-fit: cover; }
  .panel-image.zoom_in { animation: zoomIn 3s ease-in-out; }
  .panel-image.zoom_out { animation: zoomOut 3s ease-in-out; }
  .panel-image.pan_left { animation: panLeft 3s ease-in-out; }
  .panel-image.pan_right { animation: panRight 3s ease-in-out; }
  .subtitle { position: absolute; bottom: 80px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.7); color: #fff; padding: 12px 24px; border-radius: 8px; font-size: 28px; max-width: 90%; text-align: center; border: 2px solid rgba(255,255,255,0.2); }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes zoomIn { from { transform: scale(1); } to { transform: scale(1.15); } }
  @keyframes zoomOut { from { transform: scale(1.15); } to { transform: scale(1); } }
  @keyframes panLeft { from { transform: translateX(0); } to { transform: translateX(-5%); } }
  @keyframes panRight { from { transform: translateX(-5%); } to { transform: translateX(0); } }
</style>
</head>
<body>
<div class="stage">${panelHtml}</div>
<script>
(function() {
  let currentPanel = 0;
  const panels = document.querySelectorAll('.panel');
  function showPanel(index) {
    panels.forEach((p, i) => { p.style.display = i === index ? 'block' : 'none'; });
  }
  showPanel(0);
  setInterval(() => {
    currentPanel = (currentPanel + 1) % panels.length;
    showPanel(currentPanel);
  }, ${timeline.totalDuration / panels.length * 1000});
})();
</script>
</body>
</html>`;

    // 保存到 oss 目录
    const ossDir = u.getPath("oss");
    const previewPath = path.join(ossDir, `manga_preview_${Date.now()}.html`);
    await fs.promises.writeFile(previewPath, html, "utf-8");

    return previewPath;
  }
}

export default MangaModeManager;
