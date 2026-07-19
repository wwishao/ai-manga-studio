import { tool, jsonSchema, Tool } from "ai";
import { z } from "zod";
import u from "@/utils";
import ResTool from "@/socket/resTool";
import * as fs from "fs";
import path from "path";

interface ToolConfig {
  resTool: ResTool;
  toolsNames?: string[];
  msg: ReturnType<ResTool["newMessage"]>;
}

/**
 * 一句话剧本生成 & 交互式确认工具
 * 基于 OneSentenceAgent 的输出直接生成剧本
 */
export default (toolConfig: ToolConfig) => {
  const { resTool, msg } = toolConfig;
  const { socket } = resTool;

  const tools: Record<string, Tool> = {
    /**
     * 基于故事大纲直接生成完整剧本（跳过小说提取环节）
     */
    generate_script_from_outline: tool({
      description: "基于故事大纲直接生成完整剧本，适用于 OneSentenceAgent 传入的场景",
      inputSchema: jsonSchema<{ scenes: any[] }>(
        z.object({
          scenes: z.array(z.any()).describe("故事场景列表"),
        }).toJSONSchema(),
      ),
      execute: async ({ scenes }) => {
        console.log("[scriptAgent] generate_script_from_outline:", scenes.length, "个场景");
        const thinking = msg.thinking("正在生成剧本...");

        const skillPath = path.join(u.getPath("skills"), "script_execution_script.md");
        const prompt = await fs.promises.readFile(skillPath, "utf-8");

        const projectId = resTool.data.projectId;
        const project = await u.db("o_project").where("id", projectId).first();

        const sceneText = scenes.map((s, i) => 
          `场景${i + 1}：${s.name}\n地点：${s.location}\n角色：${(s.characters || []).join("、")}\n描述：${s.description}`
        ).join("\n\n");

        // 生成剧本
        const { text } = await u.Ai.Text("scriptAgent:scriptAgent").generate({
          messages: [
            { role: "system", content: prompt },
            { role: "user", content: [
              `## 项目信息`,
              `名称：${project?.name || "未命名"}`,
              `类型：${project?.type || "未指定"}`,
              `画风：${project?.artStyle || "未指定"}`,
              ``,
              `## 故事大纲`,
              sceneText,
              ``,
              `请根据以上故事大纲，为每个场景生成详细的剧本内容，`,
              `包含对话、动作描述、镜头指示等。`,
            ].join("\n") },
          ],
        });

        thinking.appendText("剧本已生成");
        thinking.complete();

        // 保存剧本到数据库
        if (projectId) {
          await u.db("o_project").where("id", projectId).update({
            memo: text,
          });
        }

        return text;
      },
    }),

    /**
     * 将剧本转换为分镜预备数据
     */
    prepare_storyboard_from_script: tool({
      description: "将生成的剧本转换为分镜预备数据",
      inputSchema: jsonSchema<{ scriptContent: string; scenes: any[] }>(
        z.object({
          scriptContent: z.string().describe("剧本内容"),
          scenes: z.array(z.any()).describe("场景列表"),
        }).toJSONSchema(),
      ),
      execute: async ({ scriptContent, scenes }) => {
        console.log("[scriptAgent] prepare_storyboard_from_script");
        const thinking = msg.thinking("正在转换分镜数据...");

        const projectId = resTool.data.projectId;

        // 为每个场景创建分镜条目
        for (let i = 0; i < scenes.length; i++) {
          const scene = scenes[i];
          
          // 检查是否已有分镜
          const existing = await u.db("o_storyboard")
            .where("projectId", projectId)
            .where("index", i + 1)
            .first();

          if (!existing) {
            await u.db("o_storyboard").insert({
              projectId,
              index: i + 1,
              name: scene.name,
              content: scene.description,
              location: scene.location || "",
              characters: (scene.characters || []).join(","),
              duration: 10, // 默认10秒
              state: "pending",
            });
          }
        }

        thinking.appendText(`已创建 ${scenes.length} 个分镜`);
        thinking.updateTitle("分镜数据准备完成");
        thinking.complete();

        return JSON.stringify({ sceneCount: scenes.length, status: "ready" });
      },
    }),

    /**
     * 将 OneSentenceAgent 创建的项目数据转入标准剧本流程
     */
    transfer_to_script_workflow: tool({
      description: "将 OneSentenceAgent 创建的项目数据转入标准剧本流程",
      inputSchema: jsonSchema<{ projectId: number }>(
        z.object({
          projectId: z.number().describe("项目ID"),
        }).toJSONSchema(),
      ),
      execute: async ({ projectId }) => {
        console.log("[scriptAgent] transfer_to_script_workflow:", projectId);
        const thinking = msg.thinking("正在转入剧本流程...");

        // 获取小说章节数据
        const chapters = await u.db("o_novel")
          .where("projectId", projectId)
          .orderBy("chapterIndex", "asc");

        if (chapters.length === 0) {
          throw new Error("未找到章节数据，请先通过 OneSentenceAgent 创建项目");
        }

        // 标记章节事件为已提取
        for (const chapter of chapters) {
          await u.db("o_novel")
            .where("id", chapter.id)
            .update({ eventState: "extracted" });
        }

        thinking.appendText(`已准备 ${chapters.length} 个章节`);
        thinking.updateTitle("剧本流程已就绪");
        thinking.complete();

        return JSON.stringify({
          chapterCount: chapters.length,
          projectId,
          status: "transferred",
        });
      },
    }),

    /**
     * 交互式确认 - 确认剧本内容
     */
    confirm_script_content: tool({
      description: "将生成的剧本呈现给用户确认，用户可提出修改建议",
      inputSchema: jsonSchema<{ scriptContent: string }>(
        z.object({
          scriptContent: z.string().describe("剧本内容"),
        }).toJSONSchema(),
      ),
      execute: async ({ scriptContent }) => {
        console.log("[scriptAgent] confirm_script_content");
        
        // 通过 activity 发送剧本预览
        msg.activity("script_preview", {
          content: scriptContent,
          type: "confirm",
        });

        // 等待用户确认
        // 这里通过 socket 监听用户响应
        return new Promise((resolve) => {
          const handler = (data: any) => {
            if (data.type === "script_confirm") {
              socket.off("confirm:response", handler);
              resolve(data.approved ? "confirmed" : "rejected");
            }
          };
          socket.on("confirm:response", handler);

          // 超时处理（5分钟）
          setTimeout(() => {
            socket.off("confirm:response", handler);
            resolve("timeout");
          }, 300000);
        });
      },
    }),
  };

  return tools;
};
