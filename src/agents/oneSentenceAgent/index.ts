import { Socket } from "socket.io";
import u from "@/utils";
import Memory from "@/utils/agent/memory";
import useTools from "@/agents/oneSentenceAgent/tools";
import ResTool from "@/socket/resTool";
import * as fs from "fs";
import path from "path";

export interface AgentContext {
  socket: Socket;
  isolationKey: string;
  text: string;
  userMessageTime?: number;
  abortSignal?: AbortSignal;
  resTool: ResTool;
  msg: ReturnType<ResTool["newMessage"]>;
  thinkConfig: { think: boolean; thinlLevel: 0 | 1 | 2 | 3; };
}

export async function runDecisionAI(ctx: AgentContext) {
  const { isolationKey, text, userMessageTime, abortSignal, resTool } = ctx;
  const memory = new Memory("oneSentenceAgent", isolationKey);
  await memory.add("user", text, { createTime: userMessageTime });
  const skill = path.join(u.getPath("skills"), "oneSentence_skills", "one_sentence_decision.md");
  const prompt = await fs.promises.readFile(skill, "utf-8");

  const { fullStream } = await u.Ai.Text("oneSentenceAgent:decisionAgent", ctx.thinkConfig.think, ctx.thinkConfig.thinlLevel).stream({
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: text },
    ],
    abortSignal,
    tools: {
      ...memory.getTools(),
      ...useTools({ resTool: ctx.resTool, msg: ctx.msg }),
    },
    onFinish: async (completion: any) => {
      await memory.add("assistant:decision", completion.text);
    },
  });

  const textStream = ctx.msg.text();
  for await (const chunk of fullStream) {
    if (chunk.type === "text-delta" && chunk.textDelta) {
      textStream.append(chunk.textDelta);
    }
  }
  textStream.complete();
  resTool.sendComplete(ctx.msg.id);
}

export async function quickGenerate(ctx: AgentContext, extraConfig?: { artStyle?: string; outputType?: string }) {
  const { text, abortSignal, resTool, socket } = ctx;
  const skillPath = path.join(u.getPath("skills"), "oneSentence_skills", "story_expander.md");
  const expanderPrompt = await fs.promises.readFile(skillPath, "utf-8");
  const thinking = ctx.msg.thinking("正在扩写故事...");

  const streamResult: any = await u.Ai.Text("universalAi").stream({
    messages: [
      { role: "system", content: expanderPrompt },
      { role: "user", content: "请将以下创意扩写为故事大纲：\n\n" + text },
    ],
    abortSignal,
  });
  let outlineText = "";
  for await (const chunk of streamResult.fullStream) {
    if (chunk.type === "text-delta" && chunk.textDelta) {
      outlineText += chunk.textDelta;
    }
  }
  thinking.complete();

  let outline;
  try { outline = JSON.parse(outlineText.replace(/[`]{3}json\n?/g, "").trim()); }
  catch { throw new Error("故事扩写失败"); }

  const style = extraConfig?.artStyle || "日系动漫";
  const outputType = extraConfig?.outputType || "漫剧";
  const [projectId] = await u.db("o_project").insert({
    name: outline.title, type: outputType, artStyle: style,
    intro: outline.logline, status: "active",
  });

  for (let i = 0; i < outline.scenes.length; i++) {
    const scene = outline.scenes[i];
    await u.db("o_novel").insert({
      projectId, chapterIndex: i + 1, chapter: scene.name,
      chapterData: scene.description, location: scene.location || "",
      event: scene.description, characters: (scene.characters || []).join(","),
      eventState: "pending",
    });
  }
  if (outline.characters) {
    for (const char of outline.characters) {
      await u.db("o_assets").insert({
        projectId, name: char.name, type: "role",
        desc: (char.type || "配角") + " - " + (char.personality || ""),
        prompt: char.appearance || "", state: "confirmed",
      });
    }
  }

  socket.emit("pipeline:start", { projectId, agentType: "scriptAgent", config: { storyOutline: outline, styleConfig: { artStyle: style, outputType } } });
  ctx.msg.text().append("项目已创建！").complete();
  resTool.sendComplete(ctx.msg.id);
}
