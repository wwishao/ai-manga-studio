import { tool, jsonSchema } from "ai";
import { z } from "zod";
import u from "@/utils";
import ResTool from "@/socket/resTool";

interface ToolConfig {
  resTool: ResTool;
  toolsNames?: string[];
  msg: ReturnType<ResTool["newMessage"]>;
}

export const styleConfigSchema = z.object({
  artStyle: z.enum(["水墨风", "日系动漫", "古风", "写实", "Q版", "赛博朋克", "其他"]).describe("画风"),
  colorTone: z.enum(["明亮温暖", "暗黑冷峻", "怀旧复古", "鲜艳多彩", "黑白"]).describe("色调"),
  pacing: z.enum(["轻松搞笑", "紧张刺激", "温馨治愈", "悬疑惊悚", "史诗磅礴"]).describe("叙事节奏"),
  outputType: z.enum(["漫剧", "短视频", "电影短片"]).describe("输出类型"),
  voiceStyle: z.enum(["旁白解说", "角色对话", "无声配乐"]).describe("配音风格"),
});

export type StyleConfig = z.infer<typeof styleConfigSchema>;

export const storyOutlineSchema = z.object({
  title: z.string().describe("故事标题"),
  logline: z.string().describe("一句话梗概"),
  scenes: z.array(z.object({
    name: z.string().describe("场景名称"),
    description: z.string().describe("场景描述"),
    characters: z.array(z.string()).describe("出场角色"),
    location: z.string().describe("场景地点"),
  })).describe("场景列表"),
  characters: z.array(z.object({
    name: z.string().describe("角色名"),
    type: z.enum(["主角", "配角", "反派"]).describe("角色类型"),
    personality: z.string().describe("性格简述"),
    appearance: z.string().describe("外貌描述"),
  })).describe("角色列表"),
  genre: z.string().describe("故事类型"),
  mood: z.string().describe("整体氛围"),
});

export type StoryOutline = z.infer<typeof storyOutlineSchema>;

export const projectConfigSchema = z.object({
  storyOutline: storyOutlineSchema,
  styleConfig: styleConfigSchema,
  status: z.enum(["draft", "confirmed", "in_progress", "completed"]).describe("项目状态"),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

async function callAI(prompt: string, userMsg: string): Promise<string> {
  const streamResult: any = await u.Ai.Text("universalAi").stream({
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: userMsg },
    ],
  });
  let result = "";
  for await (const chunk of streamResult.fullStream) {
    if (chunk.type === "text-delta" && chunk.textDelta) {
      result += chunk.textDelta;
    }
  }
  return result;
}

export default (toolConfig: ToolConfig) => {
  const { resTool, msg } = toolConfig;
  const { socket } = resTool;

  const tools: Record<string, Tool> = {
    expand_story: tool({
      description: "将用户的一句话创意扩写为包含3-5个场景的完整故事大纲",
      inputSchema: jsonSchema<{ idea: string }>(
        z.object({
          idea: z.string().describe("用户的一句话创意"),
        }).toJSONSchema(),
      ),
      execute: async ({ idea }) => {
        console.log("[oneSentenceAgent] expand_story:", idea);
        const thinking = msg.thinking("正在扩写故事...");
        const skill = u.getPath("skills") + "/oneSentence_skills/story_expander.md";
        const prompt = require("fs").readFileSync(skill, "utf-8");
        const text = await callAI(prompt, `请将以下创意扩写为故事大纲：\n\n${idea}`);
        thinking.appendText("故事扩写完成");
        thinking.complete();
        try {
          const outline: StoryOutline = JSON.parse(text.replace(/\\```json\n?|\\```/g, "").trim());
          return JSON.stringify(outline);
        } catch (e) {
          return text;
        }
      },
    }),

    confirm_style: tool({
      description: "记录用户确认的风格参数",
      inputSchema: jsonSchema<StyleConfig>(styleConfigSchema.toJSONSchema()),
      execute: async (config) => {
        console.log("[oneSentenceAgent] confirm_style:", config);
        if (resTool.data.projectId) {
          await u.db("o_project").where("id", resTool.data.projectId).update({
            artStyle: config.artStyle,
            type: config.outputType,
          });
        }
        return JSON.stringify(config);
      },
    }),

    execute_pipeline: tool({
      description: "将确认后的项目参数传递给下游 Agent",
      inputSchema: jsonSchema<{ projectConfig: ProjectConfig }>(
        z.object({ projectConfig: projectConfigSchema }).toJSONSchema(),
      ),
      execute: async ({ projectConfig }) => {
        console.log("[oneSentenceAgent] execute_pipeline:", projectConfig.storyOutline.title);
        const thinking = msg.thinking("正在编排生成流程...");
        const { storyOutline, styleConfig } = projectConfig;

        const [projectId] = await u.db("o_project").insert({
          name: storyOutline.title,
          type: styleConfig.outputType,
          artStyle: styleConfig.artStyle,
          intro: storyOutline.logline,
          status: "active",
        });

        for (let i = 0; i < storyOutline.scenes.length; i++) {
          const scene = storyOutline.scenes[i];
          await u.db("o_novel").insert({
            projectId,
            chapterIndex: i + 1,
            chapter: scene.name,
            chapterData: scene.description,
            location: scene.location,
            event: scene.description,
            characters: scene.characters.join(","),
            eventState: "pending",
          });
        }

        for (const char of storyOutline.characters) {
          await u.db("o_assets").insert({
            projectId, name: char.name, type: "role",
            desc: char.type + " - " + char.personality,
            prompt: char.appearance, state: "confirmed",
          });
        }

        thinking.appendText("项目已创建");
        thinking.complete();
        socket.emit("pipeline:start", { projectId, agentType: "scriptAgent", config: projectConfig });
        return JSON.stringify({ projectId, status: "pipeline_started" });
      },
    }),

    get_project_status: tool({
      description: "获取当前项目的生成状态",
      execute: async () => {
        if (!resTool.data.projectId) return JSON.stringify({ status: "no_project" });
        const project = await u.db("o_project").where("id", resTool.data.projectId).first();
        return JSON.stringify(project || { status: "not_found" });
      },
    }),
  };

  return tools;
};
